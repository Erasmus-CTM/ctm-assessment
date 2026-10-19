#!/usr/bin/env python3
"""Build the parity harness's corpora with one umbrella checkout.

    python integration/pyodide-parity/build-corpora.py --umbrella CHECKOUT --out DIR [--courses SET] \\
        [--review-refs REFS] [--ref NAME=COMMIT ...] [--refs FILE] [--source NAME=PATH ...]
    python integration/pyodide-parity/build-corpora.py --resolve FILE [--courses SET] [--ref NAME=COMMIT ...]
    python integration/pyodide-parity/build-corpora.py --course-matrix

The courses are those of corpora.json (entries with "course"), the one list
of courses for this harness and the workflow "Compare rendered courses". A
course is built at its pinned "commit", or, without one, at the tip of its
branch (a course that follows active work); --ref NAME=COMMIT builds another
commit. A course marked "optional" whose branch no longer exists is skipped
with a notice. --courses pinned builds the courses with a pinned commit and
the example sites (the blocking jobs), --courses following only the courses
that follow a branch (graded in jobs of their own that never fail; round-2
review N1), --courses all (default) everything. --resolve FILE writes the
commits to build (JSON, null for a skipped course) and stops; --refs FILE
builds those (two builds of one job then use the same commits).
--course-matrix prints the courses' matrix for the course comparison (branch
and profile per course, informational for a course that follows its branch;
skipped branches left out with a notice).

Layout of DIR, which run.cjs reads (directly, or as one build of --builds)
through DIR/corpora-built.json (--corpora):
  umbrella/        the umbrella checkout (a link): the umbrella corpus's sources and Python programs
  ws/site/_site    the umbrella's example site; ws/site/_extensions the package as installed
  sites/math-exercise, sites/<course> (_site, and a profile's output folder as site <course>-<profile>)

The components are those pinned in CHECKOUT's integration/feedback/repos.json
(math-exercise's example site at math-exercise's pin).
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
CORPORA = json.loads((HERE / 'corpora.json').read_text())['corpora']
COURSES = {name: spec for name, spec in CORPORA.items() if spec.get('course')}


def run(*args, cwd=None):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def notice(title, text):
    print(f'::notice title={title}::{text}', flush=True)


def branch_tip(spec):
    """The commit at the tip of a course's branch, or None when the branch does not exist."""
    url = f'https://github.com/{spec["repository"]}.git'
    out = subprocess.run(['git', 'ls-remote', url, 'refs/heads/' + spec['course']['branch']],
                         capture_output=True, text=True, check=True).stdout.split()
    return out[0] if out else None


def selection(which):
    """The courses of a set: all, those with a pinned commit, or those that follow their branch."""
    return {name: spec for name, spec in COURSES.items() if which == 'all' or (which == 'pinned') == bool(spec.get('commit'))}


def resolve(overrides, courses=COURSES):
    """The commit to build per course (None: an optional course whose branch is gone)."""
    refs = {}
    for name, spec in courses.items():
        if name in overrides:
            refs[name] = overrides[name]
        elif spec.get('commit'):
            refs[name] = spec['commit']
        else:
            refs[name] = branch_tip(spec)
            if refs[name] is None:
                if not spec['course'].get('optional'):
                    raise SystemExit(f'{name}: branch {spec["course"]["branch"]} of {spec["repository"]} not found')
                notice('Course skipped', f'{name}: branch {spec["course"]["branch"]} of {spec["repository"]} no longer exists (merged or deleted)')
    return refs


def course_matrix():
    """The courses of the comparison workflow: the umbrella's example site and every course's branch."""
    matrix = [{'course': 'examples', 'ref': '', 'profile': ''}]
    for name, spec in COURSES.items():
        course = spec['course']
        if course.get('optional') and branch_tip(spec) is None:
            notice('Course skipped', f'{name}: branch {course["branch"]} of {spec["repository"]} no longer exists (merged or deleted)')
            continue
        matrix.append({'course': spec['repository'], 'ref': course['branch'], 'profile': ' '.join(course.get('profiles', [])),
                       'informational': not spec.get('commit')})
    line = 'matrix=' + json.dumps(matrix)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
            out.write(line + '\n')
    print(line, flush=True)


def output_dir(course_dir, profile):
    """Where a Quarto profile renders (its project output-dir; None: no folder of its own)."""
    import yaml
    config = course_dir / f'_quarto-{profile}.yml'
    data = yaml.safe_load(config.read_text()) if config.is_file() else None
    folder = ((data or {}).get('project') or {}).get('output-dir')
    return folder if folder and folder != '_site' else None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--umbrella', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--review-refs', default='')
    parser.add_argument('--ref', action='append', default=[], metavar='NAME=COMMIT', help='A course at another commit')
    parser.add_argument('--refs', type=Path, help='The commits to build, as --resolve wrote them')
    parser.add_argument('--resolve', type=Path, metavar='FILE', help='Write the commits to build and stop')
    parser.add_argument('--course-matrix', action='store_true', help='Print the course comparison matrix and stop')
    parser.add_argument('--courses', choices=['all', 'pinned', 'following'], default='all',
                        help='all; pinned: the courses with a pinned commit and the example sites; following: only the courses that follow a branch')
    parser.add_argument('--source', action='append', default=[], metavar='NAME=PATH', help='A local component checkout (passed to the builders)')
    args = parser.parse_args()
    if args.course_matrix:
        return course_matrix()
    overrides = {}
    for entry in args.ref:
        name, _, commit = entry.partition('=')
        if name not in COURSES or not re.fullmatch(r'[0-9a-f]{7,40}', commit.strip()):
            raise SystemExit(f'--ref takes {", ".join(COURSES)}=COMMIT (7 to 40 hex digits)')
        overrides[name] = commit.strip()
    courses = selection(args.courses)
    if args.refs:
        refs = json.loads(args.refs.read_text())
        if set(refs) != set(courses):
            raise SystemExit(f'{args.refs}: commits for {", ".join(courses)} expected')
    else:
        refs = resolve(overrides, courses)
    if args.resolve:
        args.resolve.write_text(json.dumps(refs, indent=1) + '\n')
        print(json.dumps(refs), flush=True)
        return
    if not args.umbrella or not args.out:
        parser.error('--umbrella and --out are required to build')
    umbrella, out = args.umbrella.resolve(), args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    following = args.courses == 'following'
    if following and not any(refs.values()):
        # Nothing to build: run.cjs grades nothing and says so.
        (out / 'corpora-built.json').write_text(json.dumps({'umbrella': str(umbrella), 'courses': refs, 'extensions': None, 'python': None,
                                                            'sites': [], 'sources': []}, indent=1) + '\n')
        print(json.dumps({'umbrella': str(umbrella), 'courses': refs}), flush=True)
        return
    link = out / 'umbrella'
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(umbrella, target_is_directory=True)
    review = ['--review-refs', args.review_refs] if args.review_refs.strip() not in ('', '{}') else []
    sources = [option for source in args.source for option in ('--source', source)]
    run(sys.executable, umbrella / 'scripts/setup-feedback-integration.py', '--workspace', out / 'ws', *review, *sources)
    record = json.loads((out / 'ws/resolved-repos.json').read_text())
    build = [sys.executable, umbrella / 'scripts/build-course.py', '--umbrella', umbrella, '--workspace', out / 'sites/ws', *review, *sources]
    built = {'umbrella': str(umbrella), 'courses': refs, 'extensions': 'ws/site/_extensions', 'python': None, 'sites': [], 'sources': []}
    if not following:
        # The example sites (and the umbrella's Python programs) go with the pinned courses.
        run(*build, '--repo', 'https://github.com/Erasmus-CTM/math-exercise.git', '--ref', record['repositories']['math-exercise']['commit'],
            '--dest', out / 'sites/math-exercise')
        built.update(python='umbrella',
                     sites=[{'name': 'umbrella', 'dir': 'ws/site/_site', 'corpus': 'umbrella'},
                            {'name': 'math-exercise', 'dir': 'sites/math-exercise/_site', 'corpus': 'math-exercise'}],
                     sources=[{'name': 'umbrella', 'dir': 'umbrella'}, {'name': 'math-exercise', 'dir': 'sites/math-exercise'}])
    for name, spec in courses.items():
        if refs[name] is None:
            continue
        dest = out / 'sites' / name
        first, *others = spec['course'].get('profiles', []) + [None]
        run(*build, '--repo', f'https://github.com/{spec["repository"]}.git', '--ref', refs[name], '--dest', dest,
            *(['--profile', first] if first else []))
        for profile in others:
            run('quarto', 'render', *(['--profile', profile] if profile else []), cwd=dest)
        built['sites'].append({'name': name, 'dir': f'sites/{name}/_site', 'corpus': name})
        for profile in spec['course'].get('profiles', []):
            folder = output_dir(dest, profile)
            if folder:
                built['sites'].append({'name': f'{name}-{profile}', 'dir': f'sites/{name}/{folder}', 'corpus': name})
            else:
                notice('Profile not graded', f'{name}: profile {profile} has no output folder of its own')
        built['sources'].append({'name': name, 'dir': f'sites/{name}'})
    shutil.rmtree(out / 'sites/ws', ignore_errors=True)
    (out / 'corpora-built.json').write_text(json.dumps(built, indent=1) + '\n')
    print(json.dumps({'umbrella': str(umbrella), 'courses': refs}), flush=True)


if __name__ == '__main__':
    main()
