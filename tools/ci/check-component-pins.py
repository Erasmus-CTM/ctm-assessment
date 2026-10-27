#!/usr/bin/env python3
"""Report component CI pins that differ from the package's repos.json.

Each component's own CI builds against the dependency commits in its pin
files (.github/pins.json, tests/pins.json, pyodide-interaktiv's
.github/ctm-libs-source.json). The package ships the commits in
integration/feedback/repos.json. Where the two differ, a component's green CI
tested a combination the package does not ship. This script reads the pin
files at each component's pinned commit and reports every package dependency
that differs. ctm-assessment pins name the umbrella's tooling, not part of the
package, and are not compared.

Warnings only (exit 0); --strict exits 1 on a difference. Needs git and
network access to GitHub.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIN_FILES = ('.github/pins.json', 'tests/pins.json')
# A record of one commit, not a map of dependencies.
SINGLE_FILES = {'.github/ctm-libs-source.json': 'ctm-libs'}


def pins_in(files):
    """{dependency: commit} from the pin files' texts ({path: text})."""
    found = {}
    for path, text in files.items():
        data = json.loads(text)
        if path in SINGLE_FILES:
            found[(SINGLE_FILES[path], path)] = data['commit']
            continue
        for name, entry in data.items():
            if isinstance(entry, dict) and 'commit' in entry:
                found[(name, path)] = entry['commit']
    return found


def differences(packaged, component, files):
    """[(component, file, dependency, its pin, the package's)] for every
    package dependency that the component's pin files name differently."""
    result = []
    for (name, path), commit in sorted(pins_in(files).items()):
        expected = packaged.get(name, {}).get('commit')
        if name == 'ctm-assessment' or not expected:
            continue
        if commit != expected:
            result.append((component, path, name, commit, expected))
    return result


def read_files(repository, commit, workdir):
    folder = Path(workdir) / repository.replace('/', '-')
    git = ['git', '-C', str(folder)]
    subprocess.run(['git', 'init', '-q', str(folder)], check=True)
    subprocess.run(git + ['fetch', '-q', '--depth=1', '--filter=blob:none',
                          f'https://github.com/{repository}.git', commit], check=True)
    files = {}
    for path in PIN_FILES + tuple(SINGLE_FILES):
        shown = subprocess.run(git + ['show', f'{commit}:{path}'], capture_output=True, text=True)
        if shown.returncode == 0:
            files[path] = shown.stdout
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--repos', default=ROOT / 'integration' / 'feedback' / 'repos.json', type=Path)
    parser.add_argument('--strict', action='store_true', help='exit 1 when a pin differs')
    args = parser.parse_args()
    packaged = json.loads(args.repos.read_text())['repositories']
    found = []
    with tempfile.TemporaryDirectory(prefix='ctm-pins-') as workdir:
        for name, entry in packaged.items():
            if name == 'ctm-assessment' or not entry.get('commit'):
                continue
            files = read_files(entry['repository'], entry['commit'], workdir)
            found += differences(packaged, name, files)
    lines = [f'{component} {path} pins {dependency} {commit[:12]}; the package ships {expected[:12]}'
             for component, path, dependency, commit, expected in found]
    for line in lines:
        print('::warning title=Component pin differs from repos.json::' + line)
    summary = '\n'.join(['## Component CI pins against repos.json', '']
                        + ([f'- {line}' for line in lines] or ['Every component CI pin equals the package.']))
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as out:
            out.write(summary + '\n')
    return 1 if args.strict and found else 0


if __name__ == '__main__':
    sys.exit(main())
