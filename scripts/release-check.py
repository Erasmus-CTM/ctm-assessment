#!/usr/bin/env python3
"""Checks before a CTM Assessment release (the release workflow runs it on a tag).

    python scripts/release-check.py --tag v0.9.0 [--notes NOTES.md]

- The tag is vMAJOR.MINOR.PATCH and names the package version (`version:` of
  _extensions/ctm-assessment/_extension.yml; package.json has the same).
- Every component in integration/feedback/repos.json is pinned by a full
  commit SHA (ctm-assessment itself is the tagged checkout), so the release
  archive and a course installing from the tag get the same files.
- CHANGELOG.md has a section for the version; --notes writes it to a file
  (the release notes).
Without --notes nothing is written (a dry run). Exit status 1 names every problem.
"""
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def manifest_version(root=ROOT):
    text = (root / '_extensions' / 'ctm-assessment' / '_extension.yml').read_text(encoding='utf-8')
    found = re.search(r'(?m)^version:\s*["\']?([0-9A-Za-z.+-]+)', text)
    return found.group(1) if found else None


def changelog_section(version, root=ROOT):
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


def problems(tag, root=ROOT):
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
    if changelog_section(version, root) is None:
        found.append(f'CHANGELOG.md has no "## {version}" section')
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--tag', required=True, help='The release tag, for example v0.9.0')
    parser.add_argument('--notes', type=Path, help='Write the CHANGELOG section of the version to this file')
    args = parser.parse_args()
    found = problems(args.tag)
    if found:
        sys.exit('Not a releasable state:\n- ' + '\n- '.join(found))
    version = args.tag[1:]
    if args.notes:
        args.notes.write_text(changelog_section(version), encoding='utf-8')
    print(f'Release {args.tag}: package version {version}, every component pinned by commit, CHANGELOG section present.')


if __name__ == '__main__':
    main()
