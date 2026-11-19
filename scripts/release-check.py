#!/usr/bin/env python3
"""Checks before a CTM Assessment release (the release workflow runs it on a tag).

    python scripts/release-check.py --tag v0.9.0 [--notes NOTES.md] [--remote --manifest RELEASE.json]

- The tag is vMAJOR.MINOR.PATCH and names the package version (`version:` of
  _extensions/ctm-assessment/_extension.yml; package.json has the same).
- Every component in integration/feedback/repos.json is pinned by a full
  commit SHA (ctm-assessment itself is the tagged checkout), so the release
  archive and a course installing from the tag get the same files.
- CHANGELOG.md has a section for the version, and the section names every
  pinned component's commit (its first 7 characters), so the notes describe the
  tuple the release ships (M6 of the 26 Oct review); --notes writes it to a
  file (the release notes).
- With --remote (network, git): every pinned commit carries a release tag of
  its repository (vX.Y.Z or, for stack-wasm-maxima's runtime, runtime-vN), and
  each component's own CI pins agree with repos.json (H3,
  tools/ci/check-component-pins.py). --manifest writes the release manifest:
  the package version and, per component, repository, commit and tag.
Without --notes or --manifest nothing is written (a dry run). Exit status 1
names every problem.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def manifest_version(root=None):
    root = root or ROOT
    text = (root / '_extensions' / 'ctm-assessment' / '_extension.yml').read_text(encoding='utf-8')
    found = re.search(r'(?m)^version:\s*["\']?([0-9A-Za-z.+-]+)', text)
    return found.group(1) if found else None


def changelog_section(version, root=None):
    root = root or ROOT
    """The text of the `## <version>` section of CHANGELOG.md, or None."""
    path = root / 'CHANGELOG.md'
    if not path.is_file():
        return None
    lines, section = path.read_text(encoding='utf-8').splitlines(), None
    for line in lines:
        heading = re.match(r'^## +(\S+)', line)
        if heading:
            if section is not None:
                break
            if heading.group(1) == version:
                section = []
            continue
        if section is not None:
            section.append(line)
    return '\n'.join(section).strip() + '\n' if section is not None else None


def problems(tag, root=None):
    root = root or ROOT
    found = []
    wanted = re.fullmatch(r'v(\d+\.\d+\.\d+)', tag or '')
    if not wanted:
        return [f'the tag {tag!r} is not vMAJOR.MINOR.PATCH (for example v0.9.0)']
    version = wanted.group(1)
    if manifest_version(root) != version:
        found.append(f'the tag {tag} does not name the package version: _extensions/ctm-assessment/_extension.yml has {manifest_version(root)}')
    package = json.loads((root / 'package.json').read_text(encoding='utf-8')).get('version')
    if package != version:
        found.append(f'package.json has version {package}, not {version}')
    repositories = json.loads((root / 'integration' / 'feedback' / 'repos.json').read_text(encoding='utf-8'))['repositories']
    for name, spec in repositories.items():
        if name == 'ctm-assessment':
            continue  # the tagged checkout itself
        if not re.fullmatch(r'[0-9a-f]{40}', spec.get('commit', '')):
            found.append(f'repos.json: {name} is not pinned by a full commit SHA (branch {spec.get("branch")})')
    section = changelog_section(version, root)
    if section is None:
        found.append(f'CHANGELOG.md has no "## {version}" section')
    else:
        for name, spec in repositories.items():
            commit = spec.get('commit', '')
            if name != 'ctm-assessment' and re.fullmatch(r'[0-9a-f]{40}', commit) and commit[:7] not in section:
                found.append(f'CHANGELOG.md "## {version}" does not name {name} at {commit[:7]} (the notes describe the pinned components)')
    return found


RELEASE_TAG = re.compile(r'v\d+\.\d+\.\d+|runtime-v\d+')


def tags_at(repository, commit):
    """The release tags of `repository` that name `commit` (annotated tags peeled)."""
    listed = subprocess.run(['git', 'ls-remote', '--tags', f'https://github.com/{repository}.git'],
                            capture_output=True, text=True, check=True).stdout
    found = set()
    for line in listed.splitlines():
        sha, _, ref = line.partition('\t')
        name = ref.removeprefix('refs/tags/').removesuffix('^{}')
        if sha == commit and RELEASE_TAG.fullmatch(name):
            found.add(name)
    return sorted(found)


def remote_problems(root=None, tags=tags_at, pin_check=None):
    root = root or ROOT
    """(problems, components) for --remote; `tags` and `pin_check` are replaceable in tests."""
    repositories = json.loads((root / 'integration' / 'feedback' / 'repos.json').read_text(encoding='utf-8'))['repositories']
    found, components = [], {}
    for name, spec in sorted(repositories.items()):
        commit = spec.get('commit', '')
        if name == 'ctm-assessment' or not re.fullmatch(r'[0-9a-f]{40}', commit):
            continue
        named = tags(spec['repository'], commit)
        if not named:
            found.append(f'{name}: {spec["repository"]} has no release tag on the pinned commit {commit[:12]}')
        components[name] = {'repository': spec['repository'], 'commit': commit, 'tag': named[-1] if named else None}
    if pin_check is None:
        pin_check = component_pin_differences
    for component, path, dependency, commit, expected in pin_check(repositories):
        found.append(f'{component} {path} pins {dependency} {commit[:12]}; the package ships {expected[:12]}')
    return found, components


def component_pin_differences(repositories):
    module_path = ROOT / 'tools' / 'ci' / 'check-component-pins.py'
    spec = importlib.util.spec_from_file_location('check_component_pins', module_path)
    pins = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pins)
    result = []
    with tempfile.TemporaryDirectory(prefix='ctm-release-pins-') as workdir:
        for name, entry in repositories.items():
            if name == 'ctm-assessment' or not entry.get('commit'):
                continue
            result += pins.differences(repositories, name, pins.read_files(entry['repository'], entry['commit'], workdir))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--tag', required=True, help='The release tag, for example v0.9.0')
    parser.add_argument('--notes', type=Path, help='Write the CHANGELOG section of the version to this file')
    parser.add_argument('--remote', action='store_true', help='Also require release tags on the pins and agreeing component CI pins (network)')
    parser.add_argument('--manifest', type=Path, help='With --remote: write the release manifest (version, component tags) to this file')
    args = parser.parse_args()
    if args.manifest and not args.remote:
        parser.error('--manifest needs --remote')
    found = problems(args.tag)
    components = {}
    if args.remote and not found:
        remote, components = remote_problems()
        found += remote
    if found:
        sys.exit('Not a releasable state:\n- ' + '\n- '.join(found))
    version = args.tag[1:]
    if args.notes:
        args.notes.write_text(changelog_section(version), encoding='utf-8')
    if args.manifest:
        args.manifest.write_text(json.dumps({'package': 'ctm-assessment', 'version': version, 'components': components},
                                            indent=2) + '\n', encoding='utf-8')
    print(f'Release {args.tag}: package version {version}, every component pinned by commit, CHANGELOG section present'
          + (', release tags on every pin, component CI pins agree.' if args.remote else '.'))


if __name__ == '__main__':
    main()
