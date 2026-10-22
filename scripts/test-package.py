#!/usr/bin/env python3
"""Install the built archive into a fresh course and exercise its meta-filter.

CTM_LEGACY_AI_FEEDBACK: the extension folder of the last standalone
ai-feedback (0.8.1, ctm-libs 79103a6), prepared by
setup-feedback-integration.py --test.
"""
from pathlib import Path
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

INSTALL = 'quarto add https://erasmus-ctm.github.io/ctm-assessment/ctm-assessment.tar.gz'
archive = Path(sys.argv[1]).resolve()
legacy = Path(os.environ.get('CTM_LEGACY_AI_FEEDBACK', ''))
assert (legacy / 'feedback-quarto.lua').is_file(), 'Set CTM_LEGACY_AI_FEEDBACK to the ai-feedback 0.8.1 extension folder'


def version(folder):
    return re.search(r'(?m)^version:\s*(\S+)', (folder / '_extension.yml').read_text()).group(1)


def render(course, expect_ok=True):
    result = subprocess.run(['quarto', 'render'], cwd=course, capture_output=True, text=True)
    if expect_ok:
        assert result.returncode == 0, result.stderr
    return result


def once(html, scripts, why=''):
    """Each (HTML dependency, file) is loaded by exactly one script tag."""
    for dependency, file in scripts:
        found = re.findall(r'<script[^>]*src="[^"]*/quarto-contrib/' + re.escape(dependency) + r'-\d[^/"]*/' + re.escape(file) + '"', html)
        assert len(found) == 1, f'{dependency}/{file} did not load exactly once ({len(found)}){why}'


# Cacheable files (D1): ctm-libs' runtime, catalogues and feedback, the components' own scripts.
SCRIPTS = [('ai-feedback', 'feedback-core.js'), ('ai-feedback', 'feedback-dom.js'), ('ai-feedback', 'ai-feedback.js'),
           ('ctm-runtime', 'pyodide-runtime.js'), ('ctm-locale', 'ctm-locale.js'), ('ctm-locale-math-exercise', 'math-exercise.js'),
           ('ctm-locale-py-exercise', 'py-exercise.js'), ('math-exercise', 'math-exercise.js'), ('py-exercise', 'py-exercise.js')]

with tempfile.TemporaryDirectory(prefix='ctm-install-', dir=archive.parent) as temp:
    course = Path(temp)
    extensions = course / '_extensions'
    subprocess.run(['quarto', 'add', str(archive), '--no-prompt'], cwd=course, check=True)
    record = json.loads((extensions / 'ctm-assessment' / 'resolved-repos.json').read_text())
    assert set(record['repositories']) >= {'ctm-libs', 'math-exercise', 'py-exercise', 'pyodide-interaktiv', 'jsxgraph'}, 'installed record incomplete'
    assert record['version'] == version(extensions / 'ctm-assessment'), 'the record names another package version'
    # ctm-libs: its library only. The ai-feedback alias (CTM Assessment 0.9
    # and 0.10) is no longer packaged (step 3, U3b; M5), and nothing else
    # installs an ai-feedback folder: not pyodide-interaktiv's forwarder (N1).
    assert record['repositories']['ctm-libs']['extensions'] == ['ctm-libs']
    assert not (extensions / 'ai-feedback').exists(), 'the package must not install an ai-feedback folder'
    libs_version = version(extensions / 'ctm-libs')
    assert not (extensions / 'math-exercise' / 'feedback-loader.lua').exists()
    # pyodide-interaktiv 1.9 or later (consolidation step 3) loads ctm-libs
    # through the shared bootstrap (the build compares the copy) instead of its
    # own loader, and its scripts are cacheable files.
    pyodide = extensions / 'pyodide-interaktiv'
    pyodide_version = version(pyodide).strip('\'"')
    assert tuple(int(part) for part in re.findall(r'\d+', pyodide_version)[:2]) >= (1, 9), \
        f'pyodide-interaktiv {pyodide_version} does not run on ctm-libs; the package ships 1.9 or later'
    assert (pyodide / 'ctm-bootstrap.lua').is_file(), 'pyodide-interaktiv without its ctm-bootstrap.lua'
    assert not (pyodide / 'feedback-loader.lua').exists(), 'pyodide-interaktiv still has feedback-loader.lua'
    assert not any((pyodide / name).exists() for name in ('ctm-libs', 'ai-feedback', '_extensions')), 'the package must not install pyodide-interaktiv\'s shipped copies'
    SCRIPTS.extend([('ctm-worker', 'pyodide-worker.js'), ('ctm-locale-pyodide-interaktiv', 'pyodide-interaktiv.js'),
                    ('pyodide-interaktiv', 'qpyodide-locale.js'), ('pyodide-interaktiv', 'qpyodide-document-engine-initialization.js'),
                    ('pyodide-interaktiv', 'qpyodide-cell-classes.js'), ('pyodide-interaktiv-feedback', 'qpyodide-feedback.js')])
    # ctm-checkers, the Python checker library that math-exercise 0.11 and
    # later grade with: its folder with the manifest, the wheel it names and the
    # page script that carries that wheel.
    checkers = extensions / 'ctm-checkers'
    assert record['repositories']['ctm-checkers']['extensions'] == ['ctm-checkers']
    manifest = json.loads((checkers / 'checkers.json').read_text())
    wheel = (checkers / manifest['wheel']).read_bytes()
    assert hashlib.sha256(wheel).hexdigest() == manifest['sha256'], 'ctm-checkers: the wheel is not the one checkers.json names'
    payload = (checkers / manifest['script']).read_text()
    carried = re.search(r"\bdata: '([A-Za-z0-9+/=]+)'", payload)
    assert 'sha256: ' + json.dumps(manifest['sha256']) in payload and carried and base64.b64decode(carried.group(1)) == wheel, \
        'ctm-checkers: the page script does not carry the wheel of checkers.json'
    # The package ships a math-exercise that grades with ctm-checkers (0.11
    # and later, by the version in its manifest): its page script loads on
    # every page with an exercise, once.
    math_version = version(extensions / 'math-exercise').strip('\'"')
    assert tuple(int(part) for part in re.findall(r'\d+', math_version)[:2]) >= (0, 11), \
        f'math-exercise {math_version} does not grade with ctm-checkers; the package ships 0.11 or later'
    SCRIPTS.append(('ctm-checkers', manifest['script']))
    (course / '_quarto.yml').write_text('project:\n  type: default\n  render: [example.qmd]\nfilters: [ctm-assessment]\npy-exercise:\n  feedback: true\npyodide:\n  feedback: true\n')
    (course / 'example.qmd').write_text('''---
format: html
---

# A shared course

Use exact values.

::: {.ai-feedback}
Explain a half.
:::

```{math-exercise}
#| context: none
Compute 2+2: _[4]
```

```{py-exercise}
#| task: Return two.
def answer():
    return 0
## TESTS ##
assert answer() == 2
```

```{pyodide-python}
#| task: Print two.
print(0)
```

```{.jsxgraph width="400" height="250"}
var board = JXG.JSXGraph.initBoard(BOARDID, {boundingbox: [-2,2,2,-2]});
board.create('circle', [[0,0],1]);
```
''')
    render(course)
    html = (course / 'example.html').read_text()
    for marker in ['ai-feedback-activity', 'math-exercise-cell', 'py-exercise-cell', 'qpyodide-insertion-location-', '<iframe']:
        assert marker in html, marker + ' missing after archive installation'
    # Scripts are cacheable files, each once per page, none inlined (D1).
    once(html, SCRIPTS)
    assert 'var ME_CFG =' not in html, 'math-exercise must not inline its bundle'
    assert 'ai-feedback-' + libs_version + '/' in html
    # Author tests run against the checker wheel installed from this archive.
    # Built-in declarative grading requires the shared question-test API.
    config = (course / '_quarto.yml').read_text()
    (course / '_quarto.yml').write_text(
        'project:\n  type: default\n  render: [author-tests.qmd]\nfilters: [ctm-assessment]\n')
    author_tests = '''---
format: html
---

```{math-exercise}
#| label: packaged-numeric-author-test
#| mode: numeric
#| tolerance: 0.01
#| tests:
#|   - name: PACKAGED_NUMERIC_ASSERTION
#|     answers: ['raw("0.501")']
#|     expect: correct
Answer: _[1/2].
```

```{math-exercise}
#| label: packaged-legacy-author-test
#| mode: custom
#| checker: |
#|   def check(response, symbols):
#|       return {"correct": True}
#| tests: |
#|   def test(check, symbols):
#|       assert check({"expressions": []}, symbols)["correct"], "PACKAGED_LEGACY_ASSERTION"
Answer: _[].
```
'''
    author_page = course / 'author-tests.qmd'
    author_page.write_text(author_tests)
    render(course)
    author_html = (course / 'author-tests.html').read_text()
    for label in ('packaged-numeric-author-test', 'packaged-legacy-author-test'):
        assert label in author_html, label + ' missing from the installed-package fixture'
    assert 'PACKAGED_NUMERIC_ASSERTION' not in author_html and 'PACKAGED_LEGACY_ASSERTION' not in author_html
    for original, mutation, label, assertion in (
        ('raw("0.501")', 'raw("9")', 'packaged-numeric-author-test', 'PACKAGED_NUMERIC_ASSERTION'),
        ('assert check(', 'assert not check(', 'packaged-legacy-author-test', 'PACKAGED_LEGACY_ASSERTION'),
    ):
        changed = author_tests.replace(original, mutation)
        assert changed != author_tests, 'the authored-test mutation must alter the real fixture'
        author_page.write_text(changed)
        failed = render(course, expect_ok=False)
        diagnostic = failed.stdout + failed.stderr
        assert failed.returncode != 0 and label in diagnostic and assertion in diagnostic, diagnostic
    author_page.write_text(author_tests)
    (course / '_quarto.yml').write_text(config)
    # The pre-ast filter that keeps tab-heading ids is installed with the
    # package, at the path a course's _quarto.yml names (step 4).
    config = (course / '_quarto.yml').read_text()
    (course / '_quarto.yml').write_text('project:\n  type: default\n  render: [tabs.qmd]\nfilters:\n'
                                        '  - path: _extensions/ctm-assessment/tab-ids.lua\n    at: pre-ast\n  - ctm-assessment\n')
    (course / 'tabs.qmd').write_text('---\nformat: html\n---\n\n::: {.panel-tabset}\n\n## One\n\nFirst.\n\n'
                                     '## 3.5 Polynomer {#uke3-del5}\n\nSecond.\n\n:::\n')
    render(course)
    tabs = (course / 'tabs.html').read_text()
    assert '<div id="uke3-del5" class="ctm-tab-target">' in tabs and 'ctm-nav.js' in tabs, 'tab-ids.lua: the tab-heading id is not kept'
    (course / '_quarto.yml').write_text(config)
    # A course may also hold separately added copies (`quarto add Erasmus-CTM/...`
    # installs under an owner folder): the components, a standalone
    # pyodide-interaktiv with its forwarder, and an old ai-feedback alias. The
    # package keeps using its own set.
    for name in ['ctm-libs', 'math-exercise', 'py-exercise', 'pyodide-interaktiv']:
        shutil.copytree(extensions / name, extensions / 'Erasmus-CTM' / name)
    shutil.copytree(legacy, extensions / 'Erasmus-CTM' / 'ai-feedback')
    render(course)
    html = (course / 'example.html').read_text()
    once(html, SCRIPTS, ' next to standalone copies')
    frames = ' '.join(base64.b64decode(m).decode('utf8', 'replace') for m in re.findall(r'data:text/html;base64,([A-Za-z0-9+/=]+)', html))
    pins = (extensions / 'ctm-assessment' / 'jsxgraph-pins.yml').read_text()
    board_script, = re.findall(r'(?m)^\s*src_jxg:\s*(\S+)\s*$', pins)
    assert board_script in frames, 'JSXGraph boards do not load the exact installed package library URL'
    for name, spec in record['repositories'].items():
        own = extensions / spec['extensions'][0]
        notice = (extensions / 'ctm-assessment' / 'licenses' / (name + '.txt')).is_file()
        assert notice or any(p.name.upper().startswith(('LICENSE', 'COPYING')) for p in own.iterdir() if p.is_file()), name + ' licence not installed'
    # Standalone copies may be older or newer than the package: an old
    # standalone ai-feedback 0.8.1 and a newer ctm-libs under Erasmus-CTM/ are
    # ignored; the page uses the package's ctm-libs.
    assert version(extensions / 'Erasmus-CTM' / 'ai-feedback') == '0.8.1'
    standalone = extensions / 'Erasmus-CTM' / 'ctm-libs' / '_extension.yml'
    standalone.write_text(re.sub(r'(?m)^version:.*$', 'version: 9.9.9', standalone.read_text()))
    # A JSXGraph added with `quarto add` lands inside the package's copy: warned about, harmless.
    nested = extensions / 'jsxgraph' / 'jsxgraph'
    shutil.copytree(extensions / 'jsxgraph', nested, ignore=shutil.ignore_patterns('jsxgraph'))
    result = render(course)
    assert 'separately added JSXGraph extension was installed inside' in result.stderr, result.stderr
    html = (course / 'example.html').read_text()
    assert 'ai-feedback-0.8.1' not in html and 'ai-feedback-9.9.9' not in html and 'ai-feedback-' + libs_version + '/' in html, \
        'the package must keep its own ctm-libs'
    once(html, SCRIPTS, ' next to an old ai-feedback and a newer ctm-libs')
    shutil.rmtree(nested)
    # One page combining the old standalone ai-feedback 0.8.1 with the
    # package's components stops clearly: a page uses one version.
    (course / '_quarto.yml').write_text('project:\n  type: default\n  render: [mixed.qmd]\nfilters: [Erasmus-CTM/ai-feedback, math-exercise, py-exercise]\npy-exercise:\n  feedback: true\n')
    (course / 'mixed.qmd').write_text('''---
format: html
---

```{math-exercise}
#| context: none
Compute 2+2: _[4]
```

```{py-exercise}
#| task: Return two.
def answer():
    return 0
## TESTS ##
assert answer() == 2
```
''')
    result = render(course, expect_ok=False)
    assert result.returncode != 0 and 'combines filters that use different ai-feedback versions' in result.stderr, result.stderr
    assert 'remove ai-feedback from filters: and delete the old folder.' in result.stderr, result.stderr
    # Without ctm-checkers, a page with a math exercise stops with the install
    # command; a page without one renders.
    away = course / 'ctm-checkers-away'
    shutil.move(extensions / 'ctm-checkers', away)
    (course / 'python.qmd').write_text('---\nformat: html\n---\n\n```{py-exercise}\n#| task: Return two.\n'
                                       'def answer():\n    return 2\n## TESTS ##\nassert answer() == 2\n```\n')
    for page in ('mixed.qmd', 'python.qmd'):
        (course / '_quarto.yml').write_text(f'project:\n  type: default\n  render: [{page}]\nfilters: [ctm-assessment]\n')
        result = render(course, expect_ok=page == 'python.qmd')
        if page == 'mixed.qmd':
            assert result.returncode != 0 and 'needs ctm-checkers' in result.stderr and INSTALL in result.stderr, result.stderr
    shutil.move(away, extensions / 'ctm-checkers')
    # Without ctm-libs, a component stops with the install command (decision 3).
    shutil.rmtree(extensions / 'Erasmus-CTM')
    shutil.rmtree(extensions / 'ctm-libs')
    for filters in ('math-exercise', 'py-exercise', 'pyodide-interaktiv'):
        (course / '_quarto.yml').write_text(f'project:\n  type: default\n  render: [mixed.qmd]\nfilters: [{filters}]\n')
        result = render(course, expect_ok=False)
        assert result.returncode != 0 and 'needs its library ctm-libs' in result.stderr and INSTALL in result.stderr, result.stderr
    (course / '_quarto.yml').write_text('project:\n  type: default\n  render: [mixed.qmd]\nfilters: [ctm-assessment]\n')
    assert render(course, expect_ok=False).returncode != 0, 'the package must not render without ctm-libs'
print('Installable archive passed: all five components render from a fresh course with one copy of each script, no ai-feedback folder, '
      'also next to standalone copies (an old ai-feedback 0.8.1, a newer ctm-libs, a standalone pyodide-interaktiv); '
      'an old ai-feedback listed with the package stops; '
      'without ctm-libs a component stops with the install command; JSXGraph release line and licence notices; '
      'tab-ids.lua keeps tab-heading ids at pre-ast.')
