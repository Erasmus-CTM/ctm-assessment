#!/usr/bin/env python3
"""Build the parity harness's corpora with one umbrella checkout.

    python integration/pyodide-parity/build-corpora.py --umbrella CHECKOUT --out DIR \\
        [--review-refs REFS] [--ref NAME=COMMIT ...] [--source NAME=PATH ...]

Layout of DIR, which run.cjs reads (directly, or as one build of --builds):
  umbrella/        the umbrella checkout (a link): the umbrella corpus's sources and Python programs
  ws/site/_site    the umbrella's example site; ws/site/_extensions the package as installed
  sites/math-exercise, sites/ctm-demo (_site and _review-site), sites/ingmat3a

The components are those pinned in CHECKOUT's integration/feedback/repos.json
(math-exercise's example site at math-exercise's pin); the courses at the
commits in this checkout's corpora.json, or at --ref NAME=COMMIT.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
COURSES = {'ctm-demo': {'url': 'https://github.com/aacchhee/ctm-demo.git', 'profiles': ['review', None]},
           'ingmat3a': {'url': 'https://github.com/aacchhee/ingmat3a_ntnu.git', 'profiles': [None]}}


def run(*args, cwd=None):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--umbrella', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--review-refs', default='')
    parser.add_argument('--ref', action='append', default=[], metavar='NAME=COMMIT', help='A course at another commit')
    parser.add_argument('--source', action='append', default=[], metavar='NAME=PATH', help='A local component checkout (passed to the builders)')
    args = parser.parse_args()
    umbrella, out = args.umbrella.resolve(), args.out.resolve()
    corpora = json.loads((HERE / 'corpora.json').read_text())['corpora']
    refs = {name: corpora[name]['commit'] for name in COURSES}
    for entry in args.ref:
        name, _, commit = entry.partition('=')
        if name not in COURSES or not re.fullmatch(r'[0-9a-f]{7,40}', commit.strip()):
            raise SystemExit(f'--ref takes {", ".join(COURSES)}=COMMIT (7 to 40 hex digits)')
        refs[name] = commit.strip()
    out.mkdir(parents=True, exist_ok=True)
    link = out / 'umbrella'
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(umbrella, target_is_directory=True)
    review = ['--review-refs', args.review_refs] if args.review_refs.strip() not in ('', '{}') else []
    sources = [option for source in args.source for option in ('--source', source)]
    run(sys.executable, umbrella / 'scripts/setup-feedback-integration.py', '--workspace', out / 'ws', *review, *sources)
    record = json.loads((out / 'ws/resolved-repos.json').read_text())
    build = [sys.executable, umbrella / 'scripts/build-course.py', '--umbrella', umbrella, '--workspace', out / 'sites/ws', *review, *sources]
    run(*build, '--repo', 'https://github.com/Erasmus-CTM/math-exercise.git', '--ref', record['repositories']['math-exercise']['commit'],
        '--dest', out / 'sites/math-exercise')
    for name, course in COURSES.items():
        first, *others = course['profiles']
        run(*build, '--repo', course['url'], '--ref', refs[name], '--dest', out / 'sites' / name, *(['--profile', first] if first else []))
        for profile in others:
            run('quarto', 'render', *(['--profile', profile] if profile else []), cwd=out / 'sites' / name)
    shutil.rmtree(out / 'sites/ws', ignore_errors=True)
    print(json.dumps({'umbrella': str(umbrella), 'courses': refs}), flush=True)


if __name__ == '__main__':
    main()
