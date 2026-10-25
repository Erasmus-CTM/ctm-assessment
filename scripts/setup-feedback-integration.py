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
import sys
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / 'integration' / 'feedback'
# The components share one copy of ctm-libs' bootstrap (the file that finds
# ctm-libs); each must equal the canonical copy in the ctm-libs repository.
BOOTSTRAP = 'ctm-bootstrap.lua'
BOOTSTRAP_COMPONENTS = ('math-exercise', 'py-exercise', 'pyodide-interaktiv')
# Copies that moved into ctm-libs in consolidation step 1; pyodide-interaktiv
# dropped its loader with 1.9 (step 3), so no component keeps one.
RETIRED_COPIES = ('feedback-loader.lua', 'shared/pyodide-runtime.js')
KEEPS_RETIRED_COPIES = ()
# The last standalone ai-feedback release (0.8.1) before it became ctm-libs:
# tests check that such a copy next to the package is ignored or stops a page.
LEGACY_AI_FEEDBACK = ('Erasmus-CTM/ctm-libs', '79103a6a829b9c5cf62f645857ca7f8330ff7be2')


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
    inside one of the repository's own extension folders (`own`: a name or a
    list of names) that is itself an extension folder (`<own>/<x>/_extension.yml`)
    or an `_extensions` tree is reported as `<x>` too, so nested copies cannot
    slip into the distribution.
    """
    owns = [own] if isinstance(own, str) else list(own)
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
        for folder in owns:
            if folder in parts[1:3] and '_extensions' in parts[2:]:
                shipped.add('nested-_extensions-in-' + folder)
    return shipped


def extension_folders(config):
    """{repository name: [extension folders it owns]}; the first is its main folder.

    `extensions` lists the repository's owned folders, `extension` names one,
    and the default is the repository name.
    """
    folders = {name: list(spec.get('extensions', [spec.get('extension', name)]))
               for name, spec in config['repositories'].items()}
    owners = {}
    for name, names in folders.items():
        for folder in names:
            if folder in owners:
                raise SystemExit(f'repos.json: {owners[folder]} and {name} both own the extension folder {folder}.')
            owners[folder] = name
    return folders


def aliases(config):
    """{old name: repository name} from `review-ref-aliases` (ai-feedback -> ctm-libs)."""
    return {alias: name for name, spec in config['repositories'].items() for alias in spec.get('review-ref-aliases', [])}


def canonical_name(name, config, option, notices):
    """A repository name as given in --source/--ref/--review-refs/--only, aliases resolved."""
    renamed = aliases(config)
    if name in renamed and name not in config['repositories']:
        if name not in notices:
            notices.add(name)
            print(f'Note: {name} is now part of {renamed[name]}; {option} {name} is read as {renamed[name]} '
                  '(the old name is accepted in CTM Assessment 0.9 only).', flush=True)
        return renamed[name]
    return name


def check_shared_files(config, sources, extensions, hashes, pinned_libs=None):
    """The shared bootstrap is byte-identical everywhere; retired copies are gone.

    `pinned_libs`: with --follow-branches, the pinned ctm-libs when its branch
    tip is another commit. A copy may then also equal the pinned canonical
    bootstrap: a component's tip that has not yet taken a new bootstrap from
    ctm-libs' tip is not an error (consolidation step 3, U3a)."""
    canonical = sources['ctm-libs'] / 'bootstrap' / BOOTSTRAP
    if not canonical.is_file():
        raise SystemExit(f'ctm-libs has no bootstrap/{BOOTSTRAP} to compare the components\' copies with.')
    expected = hashlib.sha256(canonical.read_bytes()).hexdigest()
    accepted = {expected}
    if pinned_libs is not None and (pinned_libs / 'bootstrap' / BOOTSTRAP).is_file():
        accepted.add(hashlib.sha256((pinned_libs / 'bootstrap' / BOOTSTRAP).read_bytes()).hexdigest())
    digests = {}
    for name in config['repositories']:
        for folder in extensions[name]:
            for path, digest in hashes[folder].items():
                if Path(path).name == BOOTSTRAP:
                    digests[f'{folder}/{path}'] = digest
    for name in BOOTSTRAP_COMPONENTS:
        digests.setdefault(f'{extensions[name][0]}/{BOOTSTRAP}', None)
    differ = {path: digest for path, digest in digests.items() if digest not in accepted}
    if differ:
        raise SystemExit(f'Copies of {BOOTSTRAP} must equal ctm-libs\' bootstrap/{BOOTSTRAP} ({expected[:12]}'
                         + ''.join(f' or the pinned {digest[:12]}' for digest in sorted(accepted - {expected})) + '): '
                         + ', '.join(f'{path}={(digest or "missing")[:12]}' for path, digest in sorted(differ.items())))
    for name in config['repositories']:
        if name in KEEPS_RETIRED_COPIES:
            continue
        for folder in extensions[name]:
            left = [path for path in RETIRED_COPIES if path in hashes[folder]]
            if left:
                raise SystemExit(f'{name} still ships {", ".join(folder + "/" + path for path in left)}, '
                                 'which ctm-libs provides now; remove the copy.')


# Checker Python has one home, ctm-checkers (step-2 design §3.6): no other
# packaged folder defines math-exercise's checks or the basis helper (in any
# file: scripts, modules, JSON, also inside an escaped string) or ships a
# wheel. Math-exercise's allowed Python files are its component adapters and
# local review server; their grading calls still belong to ctm-checkers.
CHECKER_DEFINITIONS = re.compile(rb'(?:(?<![\w\\])|(?<=\\[nrt]))def(?:\s|\\[nrt])+(_math_check|assess_basis)\b')
MATH_EXERCISE_PYTHON = {'variants.py', 'question-tests.py', 'variant_resolver.py', 'question-variants.py', 'variants-review.py'}


def produce_native_authoring(sources, extensions_root, hashes):
    """Carry canonical native tools outside the checker browser wheel."""
    producer = sources['ctm-checkers'] / 'tools' / 'build_authoring.py'
    wrapper = extensions_root / 'math-exercise' / 'question-variants.py'
    if not producer.is_file():
        if wrapper.is_file():
            raise SystemExit('math-exercise native variants requires the canonical ctm-checkers authoring producer.')
        return
    destination = extensions_root / 'ctm-checkers' / 'native-authoring'
    run([sys.executable, producer, '--install-extension', extensions_root / 'ctm-checkers'])
    run([sys.executable, producer, '--install-extension', extensions_root / 'ctm-checkers', '--check'])
    for path in sorted(destination.rglob('*')):
        if path.is_file():
            hashes['ctm-checkers'][path.relative_to(extensions_root / 'ctm-checkers').as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()


def check_one_home(extensions, extensions_root):
    """No checker code outside ctm-checkers."""
    problems = []
    for name, folders in extensions.items():
        if name == 'ctm-checkers':
            continue
        for folder in folders:
            for path in sorted((extensions_root / folder).rglob('*')):
                if not path.is_file():
                    continue
                where = f'{folder}/{path.relative_to(extensions_root / folder)}'
                if path.suffix == '.whl':
                    problems.append(f'{where} is a wheel outside ctm-checkers')
                    continue
                if CHECKER_DEFINITIONS.search(path.read_bytes()):
                    problems.append(f'{where} defines checker code')
    for folder in extensions.get('math-exercise', []):
        extra = sorted(str(path.relative_to(extensions_root / folder)) for path in (extensions_root / folder).rglob('*.py')
                       if path.name not in MATH_EXERCISE_PYTHON or path.parent != extensions_root / folder)
        problems += [f'{folder}/{path} is Python besides the approved component authoring wrappers' for path in extra]
    if problems:
        raise SystemExit('Checker code belongs in ctm-checkers only: ' + '; '.join(problems) + '.')


def package_version():
    """The CTM Assessment version (`version:` of the package manifest)."""
    manifest = (ROOT / '_extensions' / 'ctm-assessment' / '_extension.yml').read_text(encoding='utf-8')
    found = re.search(r'(?m)^version:\s*["\']?([0-9A-Za-z.+-]+)', manifest)
    if not found:
        raise SystemExit('_extensions/ctm-assessment/_extension.yml has no version.')
    return found.group(1)


def version_tuple(text):
    """'1.8.27' -> (1, 8, 27); pre-release suffixes are ignored."""
    return tuple(int(part) for part in re.findall(r'\d+', text.split('-')[0])[:3])


def descends(repository, ancestor, tip):
    """True if `tip` contains `ancestor` (GitHub compare API; public repositories).
    GITHUB_TOKEN or GH_TOKEN, when set, only raises the API's rate limit."""
    headers = {'User-Agent': 'CTM-feedback-integration', 'Accept': 'application/vnd.github+json'}
    token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(f'https://api.github.com/repos/{repository}/compare/{ancestor}...{tip}', headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)['status'] in ('ahead', 'identical')


def followed_revision(name, spec):
    """--follow-branches: the branch tip, or the pin when the branch does not
    contain it. Such a pin lies outside its branch (the JSXGraph pin is the fork
    commit of upstream pull request #2, not on upstream main): the tip would be
    other code, not newer code. Returns (commit, pin kept)."""
    tip = remote_revision(name, spec, follow=True)
    pin = spec.get('commit')
    if pin and tip != pin and not descends(spec['repository'], pin, tip):
        print(f'{name}: {spec["branch"]} @ {tip} does not contain the pinned {pin}; '
              'following keeps the pin (a commit outside its branch, such as an upstream pull request).', flush=True)
        return pin, True
    return tip, False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, default=ROOT / '.feedback-workspace')
    parser.add_argument('--refresh', action='store_true', help='Compatibility option without effect: every component is pinned by commit')
    parser.add_argument('--follow-branches', action='store_true', help='Resolve each component\'s branch tip instead of its pinned commit (early warning; not a release build); a pin its branch does not contain is kept')
    parser.add_argument('--update-pins', action='store_true', help='Write the current branch tips into repos.json and stop; then run --test')
    parser.add_argument('--check-pins', action='store_true', help='Check that every pin is a commit of its branch (after a stacked set merged: each pin is on its dependency\'s main) and stop')
    parser.add_argument('--only', metavar='NAME[,NAME]', help='With --update-pins: re-pin only these repositories (others, such as the JSXGraph fork pin, stay as they are)')
    parser.add_argument('--ref', action='append', default=[], metavar='NAME=BRANCH', help='Use a review branch for a dependency without changing normal build defaults')
    parser.add_argument('--review-refs', default='{}', help='Explicit JSON dependency SHA map for coordinated review builds; normal defaults stay unchanged')
    parser.add_argument('--source', action='append', default=[], metavar='NAME=PATH', help='Use a local Git checkout for a repository; record SHA and dirty files')
    parser.add_argument('--package-only', action='store_true', help='Build the installable package only, without rendering the example site (course installs; used by install-project.py)')
    parser.add_argument('--test', action='store_true', help='Run repository and common-page tests after rendering')
    parser.add_argument('--browser', action='store_true', help='Also run real Chromium/Pyodide/Monaco smoke tests (requires Playwright browser)')
    args = parser.parse_args()
    if args.package_only and (args.test or args.browser):
        raise SystemExit('--package-only cannot be combined with --test or --browser (they test the rendered site).')
    if args.only and not args.update_pins:
        raise SystemExit('--only selects the repositories that --update-pins re-pins; use it with --update-pins.')
    config = json.loads((TEMPLATE / 'repos.json').read_text())
    extensions = extension_folders(config)
    notices = set()
    if args.check_pins:
        # Stacked sets (merge protocol, AC 20 Oct): the pins are the reviewed
        # heads; once the set has merged, each must be on its branch.
        off = []
        for name, spec in config['repositories'].items():
            if name == 'ctm-assessment' or not spec.get('commit'):
                continue
            if spec.get('pin-outside-branch'):
                # Known to lie outside its branch (JSXGraph: the fork commit of
                # an upstream pull request); --follow-branches keeps it too.
                print(f'{name}: {spec["commit"][:12]} is outside {spec["branch"]} by design ({spec["pin-outside-branch"]})', flush=True)
                continue
            tip = remote_revision(name, spec, follow=True)
            on = tip == spec['commit'] or descends(spec['repository'], spec['commit'], tip)
            print(f'{name}: {spec["commit"][:12]} {"is" if on else "is NOT"} on {spec["branch"]} ({tip[:12]})', flush=True)
            if not on:
                off.append(name)
        if off:
            raise SystemExit('Pins not on their branch: ' + ', '.join(off) + ' (merge the set, or pin commits of the branch).')
        return
    if args.update_pins:
        only = None
        if args.only:
            only = {canonical_name(name.strip(), config, '--only', notices) for name in args.only.split(',') if name.strip()}
            unknown = sorted(only - set(config['repositories']) | ({'ctm-assessment'} & only))
            if unknown or not only:
                raise SystemExit('--only names repositories that repos.json pins: ' + (', '.join(unknown) or 'none given')
                                 + ' (known: ' + ', '.join(sorted(set(config['repositories']) - {'ctm-assessment'})) + ')')
        for name, spec in config['repositories'].items():
            if name == 'ctm-assessment' or (only is not None and name not in only):
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
        name = canonical_name(name, config, '--source', notices)
        if name not in config['repositories']:
            raise SystemExit('Unknown repository: ' + name)
        local[name] = Path(path).resolve()
    given = json.loads(args.review_refs)
    if not isinstance(given, dict):
        raise SystemExit('Review refs must map known repositories to full SHAs')
    review_refs = {}
    for name, ref in given.items():
        name = canonical_name(name, config, 'review refs', notices)
        if name not in config['repositories'] or not re.fullmatch(r'[0-9a-f]{40}', str(ref)) or name in review_refs:
            raise SystemExit('Review refs must map known repositories to full SHAs, each once')
        review_refs[name] = ref
    for entry in args.ref:
        name, ref = entry.split('=', 1)
        name = canonical_name(name, config, '--ref', notices)
        if name not in config['repositories'] or not ref.strip():
            raise SystemExit('Unknown repository or empty review branch: ' + name)
        if name in local:
            raise SystemExit('Choose either --source or --ref for ' + name)
        review_refs[name] = ref
    sources, revisions = {}, {}
    for name, spec in config['repositories'].items():
        sha = spec.get('commit')
        requested_ref = review_refs.get(name, spec['branch'])
        dirty, kept = [], False
        if name in local:
            source = local[name]
            sha = git(source, 'rev-parse', 'HEAD')
            dirty = git(source, 'status', '--porcelain', '--untracked-files=all').splitlines()
        else:
            if args.follow_branches and name not in review_refs:
                sha, kept = followed_revision(name, spec)
            else:
                sha = remote_revision(name, spec, review_refs.get(name), args.follow_branches)
            source = snapshot(spec['repository'], sha, cache)
        sources[name] = source
        pinned = bool(spec.get('commit')) and (not args.follow_branches or kept) and name not in review_refs and name not in local
        revisions[name] = {'repository': spec['repository'], 'branch': spec['branch'], 'requested_ref': requested_ref, 'commit': sha, 'ref_override': name in review_refs, 'pinned': pinned, 'local_override': name in local, 'dirty_files': dirty, 'extensions': extensions[name]}
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
    # Bytecode left by component tests in a reused workspace is not shipped.
    build_files = shutil.ignore_patterns('__pycache__', '*.pyc')
    for name, source in sources.items():
        for folder in extensions[name]:
            extension = source / '_extensions' / folder
            if not any((extension / manifest).is_file() for manifest in ('_extension.yml', '_extension.yaml')):
                raise SystemExit(f'{name} @ {revisions[name]["commit"][:12]} has no _extensions/{folder}; '
                                 'repos.json expects it (check the pin or the branch).')
            destination = extensions_root / folder
            shutil.copytree(extension, destination, ignore=build_files)
            hashes[folder] = {str(p.relative_to(destination)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(destination.rglob('*')) if p.is_file()}
    produce_native_authoring(sources, extensions_root, hashes)
    # The one deliberate shared copy (ctm-libs' bootstrap in every component)
    # stays byte-identical; copies that moved into ctm-libs are gone.
    # Following branch tips, a component may still carry the bootstrap of the
    # pinned ctm-libs while ctm-libs' tip has a new one (any merge order of
    # ctm-libs and the components keeps the tracker green).
    pinned_libs = None
    libs_pin = config['repositories']['ctm-libs'].get('commit')
    if args.follow_branches and libs_pin and revisions['ctm-libs']['commit'] != libs_pin:
        pinned_libs = snapshot(config['repositories']['ctm-libs']['repository'], libs_pin, cache)
    check_shared_files(config, sources, extensions, hashes, pinned_libs)
    check_one_home(extensions, extensions_root)
    # Licence notices travel with the package (`quarto add` installs only
    # _extensions/): each repository's licence, when its main extension folder
    # has none of its own.
    licence_notices = extensions_root / 'ctm-assessment' / 'licenses'
    for name, source in sources.items():
        if any(p.is_file() and p.name.upper().startswith(('LICENSE', 'COPYING')) for p in (extensions_root / extensions[name][0]).iterdir()):
            continue
        found = sorted(p for p in source.iterdir() if p.is_file() and p.name.upper().startswith(('LICENSE', 'COPYING')))
        if not found:
            raise SystemExit(f'{name} has no licence file to ship with the package.')
        licence_notices.mkdir(exist_ok=True)
        shutil.copy2(found[0], licence_notices / f'{name}.txt')
        hashes['ctm-assessment'][f'licenses/{name}.txt'] = hashlib.sha256((licence_notices / f'{name}.txt').read_bytes()).hexdigest()
    # One source per component: no repository may ship another component's
    # extension (a vendored copy would silently diverge from the pinned one).
    owned = {folder for folders in extensions.values() for folder in folders}
    for name, source in sources.items():
        own = set(extensions[name])
        shipped = tracked_extensions(source, name in local, extensions[name])
        # A declared distribution copy next to the component is allowed: the
        # package copies only the component's own folders, so it never installs
        # it. pyodide-interaktiv 1.9 ships a generated ctm-libs for standalone
        # use and the ai-feedback forwarder. Neither copy is packaged.
        foreign = shipped - own - set(config['repositories'][name].get('ships-copies', []))
        # A copy inside one of the component's own folders would be shipped: never allowed.
        foreign |= {other for other in owned - own
                    if any(path.startswith(other + '/') for folder in own for path in hashes[folder])}
        foreign = sorted(foreign)
        if foreign:
            raise SystemExit(f'{name} ships its own copy of {", ".join(foreign)}; use the pinned component instead.')
    result = {'version': package_version(), 'quarto': quarto_version, 'quarto_required': config['quarto'], 'refresh': args.refresh, 'follow_branches': args.follow_branches, 'repositories': revisions, 'extension_sha256': hashes}
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
        libs = sources['ctm-libs'] / '_extensions' / 'ctm-libs'
        # CTM_LIBS_EXTENSION: ctm-libs' extension folder (the components' tests
        # load its runtime, catalogues and feedback files). ctm-checkers, the Python checker library
        # (math-exercise 0.11 grades with it): CTM_CHECKERS_EXTENSION names the
        # packaged _extensions/ctm-checkers folder (math-exercise's tests),
        # CTM_CHECKERS_SOURCE its repository (ctm-libs' tests install from it).
        env = dict(base_env, CTM_INTEGRATION_SITE=str(site / '_site'), CTM_INTEGRATION_RECORD=str(workspace / 'resolved-repos.json'),
                   CTM_LIBS_EXTENSION=str(libs),
                   CTM_CHECKERS_EXTENSION=str(extensions_root / 'ctm-checkers'), CTM_CHECKERS_SOURCE=str(sources['ctm-checkers']))
        checker_extension = extensions_root / 'ctm-checkers'
        checker_manifest = json.loads((checker_extension / 'checkers.json').read_text())
        env['CTM_CHECKERS_WHEEL'] = str(checker_extension / checker_manifest['wheel'])
        env['CTM_VARIANTS_NATIVE'] = str(checker_extension / 'native-authoring')
        run(['npm', 'ci', '--ignore-scripts'], cwd=ROOT)
        if args.test:
            legacy = snapshot(*LEGACY_AI_FEEDBACK, cache)
            env['CTM_LEGACY_AI_FEEDBACK'] = str(legacy / '_extensions' / 'ai-feedback')
            run(['python', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], cwd=ROOT, env=env)
            run(['python', ROOT / 'scripts/test-package.py', archive], env=env)
            run(['python', sources['ctm-libs'] / 'scripts/sync-feedback-defaults.py', '--check'], env=env)
            run(['python', sources['ctm-libs'] / 'scripts/check-locales.py'], env=env)
            # The packaged ctm-checkers folder (wheel and page script) is the one
            # its source builds.
            run(['python', sources['ctm-checkers'] / 'tools/build.py', '--check'], env=env)
            run(['npm', 'test'], cwd=ROOT, env=env)
            env['JSXGRAPH_EXTENSION'] = str(site / '_extensions' / 'jsxgraph')
            # The components' tests render single files in temporary folders, and
            # a single file finds CTM Assessment in the _extensions of any folder
            # above it. Inside this checkout (the default workspace) that is the
            # umbrella's own _extensions/ctm-assessment, so tests of "no package
            # installed" would see one: they get a temporary folder outside.
            component_tmp = Path(tempfile.mkdtemp(prefix='ctm-component-tests-'))
            component_env = dict(env, TMPDIR=str(component_tmp), CTM_COMPONENT_DEV='1')
            try:
                for consumer in ('ctm-libs', 'math-exercise', 'py-exercise', 'pyodide-interaktiv'):
                    run(['npm', 'ci', '--ignore-scripts'], cwd=sources[consumer])
                    run(['npm', 'test'], cwd=sources[consumer], env=component_env)
                run(['python', '-m', 'unittest', 'discover', '-s', 'tests'], cwd=sources['py-exercise'], env=component_env)
            finally:
                shutil.rmtree(component_tmp, ignore_errors=True)
            run(['npm', 'run', 'test:integration'], cwd=ROOT, env=env)
        if args.browser:
            run(['npm', 'run', 'test:browser'], cwd=ROOT, env=env)
    print('Common page:', site / '_site' / 'example.html')
    print('Revision and file record:', workspace / 'resolved-repos.json')
    print('Serve with: python -m http.server 8000 --directory ' + str(site / '_site'))


if __name__ == '__main__':
    main()
