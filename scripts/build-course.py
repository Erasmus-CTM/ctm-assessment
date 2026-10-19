#!/usr/bin/env python3
"""Build a course (or a component's example site) with CTM Assessment from an umbrella checkout.

    python scripts/build-course.py --repo URL_OR_PATH --ref REF --dest DIR \\
        [--umbrella CHECKOUT] [--profile NAME] [--workspace DIR] [--source NAME=PATH] [--review-refs REFS]

Fetches the repository at REF (a branch, a tag or a full commit SHA) into
DIR, installs the package with CHECKOUT's scripts/install-project.py (default:
this checkout), so that the components are those pinned in CHECKOUT's
integration/feedback/repos.json, and renders the project (with --profile, if
given). Used by the Pyodide parity job and the course comparison workflow,
which build a course with two umbrella refs.
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(*args, cwd=None):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--repo', required=True, help='Git URL or local path of the course')
    parser.add_argument('--ref', default='main', help='Branch, tag or full commit SHA (default: main)')
    parser.add_argument('--dest', type=Path, required=True, help='Folder for the course (replaced)')
    parser.add_argument('--umbrella', type=Path, default=ROOT, help='ctm-assessment checkout whose installer and pins are used')
    parser.add_argument('--profile', action='append', default=[], help='Quarto profile for the render (repeatable)')
    parser.add_argument('--workspace', type=Path, help='Package build folder (default: inside the course)')
    parser.add_argument('--source', action='append', default=[], metavar='NAME=PATH', help='Passed to install-project.py (a local component checkout)')
    parser.add_argument('--review-refs', default='', help='Passed to install-project.py (component commits for a coordinated review)')
    parser.add_argument('--no-render', action='store_true', help='Install only')
    args = parser.parse_args()
    dest = args.dest.resolve()
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    run('git', 'init', '-q', dest)
    run('git', '-C', dest, 'fetch', '-q', '--depth', '1', args.repo, args.ref)
    run('git', '-C', dest, 'checkout', '-q', '--detach', 'FETCH_HEAD')
    commit = subprocess.check_output(['git', '-C', str(dest), 'rev-parse', 'HEAD'], text=True).strip()
    print(f'Course {args.repo} @ {args.ref} = {commit}', flush=True)
    installer = [sys.executable, args.umbrella.resolve() / 'scripts' / 'install-project.py', '--project', dest]
    if args.workspace:
        installer += ['--workspace', args.workspace.resolve()]
    installer += [option for source in args.source for option in ('--source', source)]
    if args.review_refs.strip() not in ('', '{}'):
        installer += ['--review-refs', args.review_refs]
    run(*installer)
    if not args.no_render:
        run('quarto', 'render', *[option for profile in args.profile for option in ('--profile', profile)], cwd=dest)


if __name__ == '__main__':
    main()
