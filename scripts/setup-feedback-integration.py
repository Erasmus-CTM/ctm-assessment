#!/usr/bin/env python3
"""Build/test a common page from maintained CTM branches (Python 3.12+)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / 'integration' / 'feedback'


def run(args, cwd=None, env=None):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=cwd, env=env, check=True)


def git(path, *args):
    return subprocess.check_output(['git', '-C', str(path), *args], text=True).strip()


def download(url, target):
    request = urllib.request.Request(url, headers={'User-Agent': 'CTM-feedback-integration'})
    with urllib.request.urlopen(request, timeout=120) as response, target.open('wb') as out:
        shutil.copyfileobj(response, out)


def remote_revision(name, spec, review_ref=None, follow=False):
    if review_ref and re.fullmatch(r'[0-9a-f]{40}', review_ref):
        return review_ref
    sha = None if follow else spec.get('commit')
    if not sha or review_ref:
        branch = review_ref or spec['branch']
        refs = subprocess.check_output(['git', 'ls-remote', f'https://github.com/{spec["repository"]}.git', 'refs/heads/' + branch], text=True).split()
        if len(refs) != 2:
            raise SystemExit('Could not resolve branch: ' + name)
        sha = refs[0]
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise SystemExit('Expected a full commit SHA: ' + name)
    return sha


def without_root(member, destination):
    """Extraction filter: drop the archive's top folder (`<repo>-<sha>/`) to keep paths short."""
    rest = member.name.partition('/')[2]
    if not rest:
        return None  # the top folder itself
    changes = {'name': rest}
    if member.islnk():
        changes['linkname'] = member.linkname.partition('/')[2]
    return tarfile.data_filter(member.replace(**changes, deep=False), destination)


def snapshot(repo, sha, cache):
    # Short names: Windows paths are limited to about 260 characters, and the
    # workspace often sits inside a course project.
    target = cache / (repo.rsplit('/', 1)[1] + '-' + sha[:12])
    marker = target / '.integration-source.json'
    if marker.exists() and json.loads(marker.read_text()).get('commit') == sha:
        return target
    if target.exists():
        shutil.rmtree(target)  # A different commit with the same short name, or a partial copy.
    temp = Path(tempfile.mkdtemp(prefix='t', dir=cache))
    archive = cache / (temp.name + '.tgz')
    try:
        download(f'https://codeload.github.com/{repo}/tar.gz/{sha}', archive)
        with tarfile.open(archive) as tar:
            if len({member.name.partition('/')[0] for member in tar.getmembers()}) != 1:
                raise RuntimeError('Unexpected repository archive structure')
            tar.extractall(temp, filter=without_root)
        # Do not treat generated metadata as part of upstream source.
        (temp / '.integration-source.json').write_text(json.dumps({'repository': repo, 'commit': sha}))
        temp.rename(target)
    finally:
        archive.unlink(missing_ok=True)
        if temp.exists():
            shutil.rmtree(temp)
    return target


def tracked_extensions(source, local, own):
    """Extension names a repository ships (tracked files only).

    `_extensions/<x>` and `_extensions/<owner>/<x>` both ship `<x>`; anything
    inside the repository's own extension folder that is itself an extension
    folder (`<own>/<x>/_extension.yml`) or an `_extensions` tree is reported
    as `<x>` too, so nested copies cannot slip into the distribution.
    """
    if local:
        files = subprocess.check_output(['git', '-C', str(source), 'ls-files', '_extensions'], text=True).splitlines()
    else:
        files = [str(p.relative_to(source)) for p in (source / '_extensions').rglob('*') if p.is_file()] if (source / '_extensions').is_dir() else []
    shipped = set()
    for name in files:
        parts = Path(name).parts
        if parts[-1] in ('_extension.yml', '_extension.yaml'):
            folders = parts[1:-1]
            if folders:
                shipped.add(folders[-1])
        if own in parts[1:3] and '_extensions' in parts[2:]:
            shipped.add('nested-_extensions-in-' + own)
    return shipped


def version_tuple(text):
    """'1.8.27' -> (1, 8, 27); pre-release suffixes are ignored."""
    return tuple(int(part) for part in re.findall(r'\d+', text.split('-')[0])[:3])


def descends(repository, ancestor, tip):
    """True if `tip` contains `ancestor` (GitHub compare API; public repositories)."""
    request = urllib.request.Request(f'https://api.github.com/repos/{repository}/compare/{ancestor}...{tip}',
                                     headers={'User-Agent': 'CTM-feedback-integration', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)['status'] in ('ahead', 'identical')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=ROOT / '.feedback-workspace')
    parser.add_argument('--refresh', action='store_true', help='Compatibility option without effect: every component is pinned by commit')
    parser.add_argument('--follow-branches', action='store_true', help='Resolve each component\'s branch tip instead of its pinned commit (early warning; not a release build)')
    parser.add_argument('--update-pins', action='store_true', help='Write the current branch tips into repos.json and stop; then run --test')
    parser.add_argument('--ref', action='append', default=[], metavar='NAME=BRANCH', help='Use a review branch for a dependency without changing normal build defaults')
    parser.add_argument('--review-refs', default='{}', help='Explicit JSON dependency SHA map for coordinated review builds; normal defaults stay unchanged')
    parser.add_argument('--source', action='append', default=[], metavar='NAME=PATH', help='Use a local Git checkout for a repository; record SHA and dirty files')
    parser.add_argument('--package-only', action='store_true', help='Build the installable package only, without rendering the example site (course installs; used by install-project.py)')
    parser.add_argument('--test', action='store_true', help='Run repository and common-page tests after rendering')
    parser.add_argument('--browser', action='store_true', help='Also run real Chromium/Pyodide/Monaco smoke tests (requires Playwright browser)')
    args = parser.parse_args()
    if args.package_only and (args.test or args.browser):
        raise SystemExit('--package-only cannot be combined with --test or --browser (they test the rendered site).')
    config = json.loads((TEMPLATE / 'repos.json').read_text())
    if args.update_pins:
        for name, spec in config['repositories'].items():
            if name == 'ctm-assessment':
                continue
            sha = remote_revision(name, spec, follow=True)
            old = spec.get('commit')
            # Never move a pin backwards or sideways (e.g. to a branch that does
            # not yet contain the pinned commit).
            if old and old != sha and not descends(spec['repository'], old, sha):
                raise SystemExit(f'{name}: {spec["branch"]} @ {sha} does not contain the pinned {old}; '
                                 'merge the pinned work first or change the branch in repos.json.')
            print(f'{name}: {old or "unpinned"} -> {sha}')
            spec['commit'] = sha
        (TEMPLATE / 'repos.json').write_text(json.dumps(config, indent=2) + '\n')
        print('Updated integration/feedback/repos.json. Now run: python scripts/setup-feedback-integration.py --test --browser')
        return
    quarto_version = subprocess.check_output(['quarto', '--version'], text=True).strip()
    if version_tuple(quarto_version) < version_tuple(config['quarto']):
        raise SystemExit(f'Quarto {quarto_version} is older than the required {config["quarto"]} or later.')
    workspace = args.workspace.resolve()
    if workspace == ROOT or workspace in ROOT.parents:
        raise SystemExit('Workspace must not replace the project or its ancestors.')
    workspace.mkdir(parents=True, exist_ok=True)
    marker = workspace / '.ctm-feedback-workspace'
    if not marker.exists() and any(workspace.iterdir()):
        raise SystemExit('Refusing a nonempty workspace not created by this script.')
    marker.touch()
    (workspace / 'tmp').mkdir(exist_ok=True)
    base_env = dict(os.environ, TMPDIR=str(workspace / 'tmp'), PYTHONDONTWRITEBYTECODE='1')
    cache = workspace / 'src'
    cache.mkdir(exist_ok=True)
    local = {'ctm-assessment': ROOT}
    for entry in args.source:
        name, path = entry.split('=', 1)
        if name not in config['repositories']:
            raise SystemExit('Unknown repository: ' + name)
        local[name] = Path(path).resolve()
    review_refs = json.loads(args.review_refs)
    if not isinstance(review_refs, dict) or any(name not in config['repositories'] or not re.fullmatch(r'[0-9a-f]{40}', str(ref)) for name,ref in review_refs.items()):
        raise SystemExit('Review refs must map known repositories to full SHAs')
    for entry in args.ref:
        name, ref = entry.split('=', 1)
        if name not in config['repositories'] or not ref.strip():
            raise SystemExit('Unknown repository or empty review branch: ' + name)
        if name in local:
            raise SystemExit('Choose either --source or --ref for ' + name)
        review_refs[name] = ref
    sources, revisions = {}, {}
    for name, spec in config['repositories'].items():
        sha = spec.get('commit')
        requested_ref = review_refs.get(name, spec['branch'])
        dirty = []
        if name in local:
            source = local[name]
            sha = git(source, 'rev-parse', 'HEAD')
            dirty = git(source, 'status', '--porcelain', '--untracked-files=all').splitlines()
        else:
            sha = remote_revision(name, spec, review_refs.get(name), args.follow_branches)
            source = snapshot(spec['repository'], sha, cache)
        sources[name] = source
        pinned = bool(spec.get('commit')) and not args.follow_branches and name not in review_refs and name not in local
        revisions[name] = {'repository': spec['repository'], 'branch': spec['branch'], 'requested_ref': requested_ref, 'commit': sha, 'ref_override': name in review_refs, 'pinned': pinned, 'local_override': name in local, 'dirty_files': dirty}
        print(f'Resolved {name}: {requested_ref} @ {sha}', flush=True)
    site = workspace / 'site'
    distribution = workspace / 'ctm-assessment'
    if distribution.exists():
        shutil.rmtree(distribution)  # Generated package inside the marked workspace only.
    if args.package_only:
        # Course installs need only the extensions: no example site, no example
        # assets to download. The files and their record are the same as in a
        # full build, which copies the site's _extensions into the package.
        extensions_root = distribution / '_extensions'
    else:
        if site.exists():
            shutil.rmtree(site)  # Generated site inside the marked workspace only.
        site.mkdir()
        for name in ['_quarto.yml', 'index.qmd', 'example.qmd', 'examples.qmd', 'feedback.yml']:
            shutil.copy2(ROOT / name, site / name)
        if (ROOT / 'feedback').is_dir():
            shutil.copytree(ROOT / 'feedback', site / 'feedback')
        shutil.copytree(ROOT / 'assets', site / 'assets')
        for name, spec in json.loads((ROOT / 'assets/sources.json').read_text()).items():
            asset = site / 'assets' / name
            if not asset.exists():
                download(spec['url'], asset)
            if hashlib.sha256(asset.read_bytes()).hexdigest() != spec['sha256']:
                raise SystemExit('Example asset checksum mismatch: ' + name)
        shutil.copytree(ROOT / 'examples', site / 'examples')
        shutil.copytree(ROOT / '_filters', site / '_filters')
        extensions_root = site / '_extensions'
    hashes = {}
    extensions = {name: spec.get('extension', name) for name, spec in config['repositories'].items()}
    # Bytecode left by component tests in a reused workspace is not shipped.
    build_files = shutil.ignore_patterns('__pycache__', '*.pyc')
    for name, source in sources.items():
        extension = source / '_extensions' / extensions[name]
        destination = extensions_root / extensions[name]
        shutil.copytree(extension, destination, ignore=build_files)
        hashes[extensions[name]] = {str(p.relative_to(destination)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(destination.rglob('*')) if p.is_file()}
    # Deliberate shared copies must stay byte-identical across components.
    shared_copies = {
        'feedback-loader.lua': [('math-exercise', 'feedback-loader.lua'), ('py-exercise', 'feedback-loader.lua'), ('pyodide-interaktiv', 'feedback-loader.lua')],
        'pyodide-runtime.js': [('math-exercise', 'shared/pyodide-runtime.js'), ('py-exercise', 'shared/pyodide-runtime.js')],
    }
    for label, copies in shared_copies.items():
        digests = {f'{name}/{path}': hashes[extensions[name]].get(path) for name, path in copies}
        if None in digests.values() or len(set(digests.values())) != 1:
            raise SystemExit(f'Shared copies of {label} differ or are missing: ' + ', '.join(f'{k}={(v or "missing")[:12]}' for k, v in digests.items()))
    # Licence notices travel with the package (`quarto add` installs only
    # _extensions/): each component's repository licence, when its extension
    # folder has none of its own.
    notices = extensions_root / 'ctm-assessment' / 'licenses'
    for name, source in sources.items():
        if any(p.is_file() and p.name.upper().startswith(('LICENSE', 'COPYING')) for p in (extensions_root / extensions[name]).iterdir()):
            continue
        found = sorted(p for p in source.iterdir() if p.is_file() and p.name.upper().startswith(('LICENSE', 'COPYING')))
        if not found:
            raise SystemExit(f'{name} has no licence file to ship with the package.')
        notices.mkdir(exist_ok=True)
        shutil.copy2(found[0], notices / f'{name}.txt')
        hashes['ctm-assessment'][f'licenses/{name}.txt'] = hashlib.sha256((notices / f'{name}.txt').read_bytes()).hexdigest()
    # One source per component: no repository may ship another component's
    # extension (a vendored copy would silently diverge from the pinned one).
    for name, source in sources.items():
        shipped = tracked_extensions(source, name in local, extensions[name])
        # A declared distribution copy next to the component (pyodide-interaktiv
        # ships ai-feedback for its existing projects) is allowed; the package
        # copies only the component's own folder, so it never installs it.
        foreign = shipped - {extensions[name]} - set(config['repositories'][name].get('ships-copies', []))
        # A copy inside the component's own folder would be shipped: never allowed.
        foreign |= {other for other in extensions.values() if other != extensions[name]
                    and any(path.startswith(other + '/') for path in hashes[extensions[name]])}
        foreign = sorted(foreign)
        if foreign:
            raise SystemExit(f'{name} ships its own copy of {", ".join(foreign)}; use the pinned component instead.')
    result = {'quarto': quarto_version, 'quarto_required': config['quarto'], 'refresh': args.refresh, 'follow_branches': args.follow_branches, 'repositories': revisions, 'extension_sha256': hashes}
    (workspace / 'resolved-repos.json').write_text(json.dumps(result, indent=2) + '\n')
    if not args.package_only:
        shutil.copy2(workspace / 'resolved-repos.json', site / 'resolved-repos.json')
        run(['quarto', 'render'], cwd=site, env=base_env)
        # Build a single installable distribution with one copy of each dependency.
        shutil.copytree(site / '_extensions', distribution / '_extensions')
    shutil.copy2(workspace / 'resolved-repos.json', distribution / 'resolved-repos.json')
    # `quarto add` installs only _extensions/: keep the record with the umbrella.
    shutil.copy2(workspace / 'resolved-repos.json', distribution / '_extensions' / 'ctm-assessment' / 'resolved-repos.json')
    shutil.copy2(ROOT / 'LICENSE', distribution / 'LICENSE')
    if args.package_only:
        print('Package:', distribution)
        print('Revision and file record:', workspace / 'resolved-repos.json')
        return
    archive = shutil.make_archive(str(workspace / 'ctm-assessment'), 'gztar', root_dir=distribution)
    shutil.copy2(archive, site / '_site' / 'ctm-assessment.tar.gz')
    if args.test or args.browser:
        env = dict(base_env, CTM_INTEGRATION_SITE=str(site / '_site'), CTM_INTEGRATION_RECORD=str(workspace / 'resolved-repos.json'), AI_FEEDBACK_EXTENSION=str(sources['ai-feedback'] / '_extensions' / 'ai-feedback'))
        run(['npm', 'ci', '--ignore-scripts'], cwd=ROOT)
        if args.test:
            run(['python', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], cwd=ROOT, env=env)
            run(['python', ROOT / 'scripts/test-package.py', archive], env=env)
            run(['python', sources['ai-feedback'] / 'scripts/sync-feedback-defaults.py', '--check'], env=env)
            run(['npm', 'test'], cwd=ROOT, env=env)
            env['JSXGRAPH_EXTENSION'] = str(site / '_extensions' / 'jsxgraph')
            for consumer in ('ai-feedback', 'math-exercise', 'py-exercise', 'pyodide-interaktiv'):
                run(['npm', 'ci', '--ignore-scripts'], cwd=sources[consumer])
                run(['npm', 'test'], cwd=sources[consumer], env=env)
            run(['python', '-m', 'unittest', 'discover', '-s', 'tests'], cwd=sources['py-exercise'], env=env)
            run(['npm', 'run', 'test:integration'], cwd=ROOT, env=env)
        if args.browser:
            run(['npm', 'run', 'test:browser'], cwd=ROOT, env=env)
    print('Common page:', site / '_site' / 'example.html')
    print('Revision and file record:', workspace / 'resolved-repos.json')
    print('Serve with: python -m http.server 8000 --directory ' + str(site / '_site'))


if __name__ == '__main__':
    main()
