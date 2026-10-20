#!/usr/bin/env python3
"""The jobs of the workflow "Compare rendered courses" (.github/workflows/compare-courses.yml).

Writes `matrix` (one entry per comparison) and `browsers` (the entries that
also get the browser comparison) to GITHUB_OUTPUT. An entry names the course
(owner/name, "examples" for the umbrella's example site, or "step4-course"
with its `path`), the course ref built as "after" (`ref`) and as "before"
(`base_ref`, empty: the same), its Quarto `profile`, the package refs (`base`
for before, `head` for after: a ref, `pin` for the one the course's
quarto-extensions.yml names at that side's ref, empty for the pull request's
base and head), `convert` (a preview of the step-4 migration on the after
side), extra expect files (`expect`), `browser`, `informational` and a `key`
for artifact names; `engines` lists the browsers (all three, or BROWSERS).

On a pull request: the example site; every course of the one course list
(integration/pyodide-parity/build-corpora.py --course-matrix) on its own
sources, before = the package it pins (the courses are pinned until their
migration), after = the head; and the step-4 fixture course, before = as it
is with its pinned package, after = converted with the head, compared with
expect/step4-migration.yml and in the browser. On workflow_dispatch: the one
comparison its inputs describe (COURSE, COURSE_REF, COURSE_BASE_REF, PROFILE,
BASE, HEAD, CONVERT, EXPECT, BROWSER, BROWSERS).
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = {'course': 'step4-course', 'path': 'integration/step4-course'}
ENGINES = ('chromium', 'firefox', 'webkit')


def key(entry):
    name = entry['course'].rsplit('/', 1)[-1]
    ref = entry.get('ref') or ''
    return re.sub(r'[^\w.-]+', '-', name + ('-' + ref if ref else '') + ('-' + entry['profile'] if entry.get('profile') else '')).strip('-')


def courses():
    """The example site and the courses of corpora.json; its notices pass through."""
    env = dict(os.environ)
    env.pop('GITHUB_OUTPUT', None)
    out = subprocess.run([sys.executable, str(ROOT / 'integration/pyodide-parity/build-corpora.py'), '--course-matrix'],
                         env=env, capture_output=True, text=True, check=True).stdout
    matrix = None
    for line in out.splitlines():
        if line.startswith('matrix='):
            matrix = json.loads(line[len('matrix='):])
        else:
            print(line, flush=True)
    return matrix


def entries(event, inputs):
    if event == 'workflow_dispatch':
        course = inputs.get('COURSE') or 'aacchhee/ctm-demo'
        entry = {'course': course, 'ref': inputs.get('COURSE_REF') or ('' if course in ('examples', 'step4-course') else 'main'),
                 'base_ref': inputs.get('COURSE_BASE_REF') or '', 'profile': inputs.get('PROFILE') or '',
                 'base': inputs.get('BASE') or '', 'head': inputs.get('HEAD') or '',
                 'convert': inputs.get('CONVERT') == 'true', 'expect': inputs.get('EXPECT') or '',
                 'browser': inputs.get('BROWSER') == 'true', 'informational': False}
        if course == 'step4-course':
            entry.update(path=FIXTURE['path'], ref='')
        if course == 'examples' and entry['base'] == 'pin':
            entry['base'] = ''  # the example site pins nothing
        return [entry]
    found = []
    for entry in courses():
        entry = {'base_ref': '', 'base': '', 'head': '', 'convert': False, 'expect': '', 'browser': False, **entry}
        if entry['course'] != 'examples':
            entry['base'] = 'pin'
        found.append(entry)
    found.append({**FIXTURE, 'ref': '', 'base_ref': '', 'profile': '', 'base': 'pin', 'head': '', 'convert': True,
                  'expect': 'step4-migration.yml', 'browser': True, 'informational': False})
    return found


def main():
    inputs = {name: os.environ.get(name, '') for name in ('COURSE', 'COURSE_REF', 'COURSE_BASE_REF', 'PROFILE', 'BASE', 'HEAD',
                                                          'CONVERT', 'EXPECT', 'BROWSER', 'BROWSERS')}
    matrix = entries(os.environ.get('EVENT', 'pull_request'), inputs)
    for entry in matrix:
        entry['key'] = key(entry)
    browsers = [entry for entry in matrix if entry.get('browser')]
    engines = [name for name in (inputs['BROWSERS'] or ' '.join(ENGINES)).split() if name in ENGINES] or list(ENGINES)
    lines = ['matrix=' + json.dumps(matrix), 'browsers=' + json.dumps(browsers), 'engines=' + json.dumps(engines)]
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
            out.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
