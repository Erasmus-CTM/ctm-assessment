#!/usr/bin/env python3
"""Build a course (or a component's example site) with CTM Assessment from an umbrella checkout.

    python scripts/build-course.py (--repo URL_OR_PATH --ref REF | --path DIR) --dest DIR \\
        [--umbrella CHECKOUT] [--profile NAME] [--workspace DIR] [--source NAME=PATH] [--review-refs REFS] [--convert]
    python scripts/build-course.py (--repo URL_OR_PATH --ref REF | --path DIR) --pin

Fetches the repository at REF (a branch, a tag or a full commit SHA) into
DIR, or copies the folder --path (a course in this checkout, such as
integration/step4-course), installs the package with CHECKOUT's
scripts/install-project.py (default: this checkout), so that the components
are those pinned in CHECKOUT's integration/feedback/repos.json, and renders
the project (with --profile, if given). Used by the Pyodide parity job and the
course comparison workflow, which build a course with two umbrella refs.

--convert previews a course's step-4 migration before installing: this
checkout's tools/migrate-course-html.py --config, then the course's
migrated/ folder (the hand edits of a migration, if it has one) copied over
it. --pin prints the CTM Assessment ref the course pins in its
quarto-extensions.yml (main when it names none) and stops.
"""
import argparse
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def run(*args, cwd=None):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def pinned(text):
    """The ctm-assessment ref of a quarto-extensions.yml (main without one)."""
    try:
        import yaml
        data = yaml.safe_load(text) or {}
        plugins = data.get('plugins') or []
        for plugin in plugins if isinstance(plugins, list) else []:
            if isinstance(plugin, dict) and plugin.get('name') == 'ctm-assessment':
                return str(plugin.get('ref') or 'main')
        return 'main'
    except ImportError:
        found = re.search(r'name:\s*ctm-assessment\b(?:(?!\n\s*-\s).)*?\n\s*ref:\s*["\']?([^\s"\'#]+)', text, re.S)
        return found.group(1) if found else 'main'


def fetch(args, dest):
    """The course at args.ref (or the folder args.path) in dest."""
    if dest.exists():
        shutil.rmtree(dest)
    if args.path:
        shutil.copytree(args.path.resolve(), dest, ignore=shutil.ignore_patterns('_site', '.quarto', '_extensions', '_freeze'))
        print(f'Course {args.path}', flush=True)
        return
    dest.mkdir(parents=True)
    run('git', 'init', '-q', dest)
    run('git', '-C', dest, 'fetch', '-q', '--depth', '1', args.repo, args.ref)
    run('git', '-C', dest, 'checkout', '-q', '--detach', 'FETCH_HEAD')
    commit = subprocess.check_output(['git', '-C', str(dest), 'rev-parse', 'HEAD'], text=True).strip()
    print(f'Course {args.repo} @ {args.ref} = {commit}', flush=True)


def convert(dest):
    """--convert: the step-4 migration of the course, previewed."""
    run(sys.executable, ROOT / 'tools' / 'migrate-course-html.py', '--project', dest, '--config')
    migrated = dest / 'migrated'
    if migrated.is_dir():
        shutil.copytree(migrated, dest, dirs_exist_ok=True)
        shutil.rmtree(migrated)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--repo', help='Git URL or local path of the course')
    parser.add_argument('--ref', default='main', help='Branch, tag or full commit SHA (default: main)')
    parser.add_argument('--path', type=Path, help='A course folder to copy instead of --repo (no Git)')
    parser.add_argument('--dest', type=Path, help='Folder for the course (replaced)')
    parser.add_argument('--convert', action='store_true', help='Preview the step-4 migration (see above)')
    parser.add_argument('--pin', action='store_true', help='Print the CTM Assessment ref the course pins and stop')
    parser.add_argument('--umbrella', type=Path, default=ROOT, help='ctm-assessment checkout whose installer and pins are used')
    parser.add_argument('--profile', action='append', default=[], help='Quarto profile for the render (repeatable)')
    parser.add_argument('--workspace', type=Path, help='Package build folder (default: inside the course)')
    parser.add_argument('--source', action='append', default=[], metavar='NAME=PATH', help='Passed to install-project.py (a local component checkout)')
    parser.add_argument('--review-refs', default='', help='Passed to install-project.py (component commits for a coordinated review)')
    parser.add_argument('--no-render', action='store_true', help='Install only')
    args = parser.parse_args()
    if bool(args.repo) == bool(args.path):
        parser.error('give the course as --repo (with --ref) or as --path')
    if args.pin:
        if args.path:
            file = args.path / 'quarto-extensions.yml'
            print(pinned(file.read_text(encoding='utf-8')) if file.is_file() else 'main')
            return
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run(['git', 'init', '-q', temp], check=True)
            subprocess.run(['git', '-C', temp, 'fetch', '-q', '--depth', '1', args.repo, args.ref], check=True)
            shown = subprocess.run(['git', '-C', temp, 'show', 'FETCH_HEAD:quarto-extensions.yml'], capture_output=True, text=True)
        print(pinned(shown.stdout) if shown.returncode == 0 else 'main')
        return
    if not args.dest:
        parser.error('--dest is required')
    dest = args.dest.resolve()
    fetch(args, dest)
    if args.convert:
        convert(dest)
    elif (dest / 'migrated').is_dir() and args.path:
        shutil.rmtree(dest / 'migrated')  # a course folder's migration edits: only for --convert
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
