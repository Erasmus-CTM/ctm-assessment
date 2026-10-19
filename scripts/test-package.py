#!/usr/bin/env python3
"""Install the built archive into a fresh course and exercise its meta-filter.

CTM_LEGACY_AI_FEEDBACK: the extension folder of the last standalone
ai-feedback (0.8.1, ctm-libs 79103a6), prepared by
setup-feedback-integration.py --test.
"""
from pathlib import Path
import base64
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
    # ctm-libs ships its library and the ai-feedback alias (0.9.x), at one version.
    assert record['repositories']['ctm-libs']['extensions'] == ['ctm-libs', 'ai-feedback']
    libs_version = version(extensions / 'ctm-libs')
    assert version(extensions / 'ai-feedback') == libs_version, 'the ai-feedback alias must have the version of ctm-libs'
    assert not (extensions / 'math-exercise' / 'feedback-loader.lua').exists()
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
    # A course may also hold separately added copies (`quarto add Erasmus-CTM/...`
    # installs under an owner folder). The package keeps using its own set.
    for name in ['ctm-libs', 'ai-feedback', 'math-exercise', 'py-exercise']:
        shutil.copytree(extensions / name, extensions / 'Erasmus-CTM' / name)
    render(course)
    html = (course / 'example.html').read_text()
    once(html, SCRIPTS, ' next to standalone copies')
    frames = ' '.join(base64.b64decode(m).decode('utf8', 'replace') for m in re.findall(r'data:text/html;base64,([A-Za-z0-9+/=]+)', html))
    assert 'jsxgraph@1/distrib/jsxgraphcore.js' in frames, 'JSXGraph boards do not load the package library versions'
    for name, spec in record['repositories'].items():
        own = extensions / spec['extensions'][0]
        notice = (extensions / 'ctm-assessment' / 'licenses' / (name + '.txt')).is_file()
        assert notice or any(p.name.upper().startswith(('LICENSE', 'COPYING')) for p in own.iterdir() if p.is_file()), name + ' licence not installed'
    # Standalone copies may be older or newer than the package: an old
    # standalone ai-feedback 0.8.1 and a newer ctm-libs under Erasmus-CTM/ are
    # ignored; the page uses the package's ctm-libs.
    shutil.rmtree(extensions / 'Erasmus-CTM' / 'ai-feedback')
    shutil.copytree(legacy, extensions / 'Erasmus-CTM' / 'ai-feedback')
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
    # Without ctm-libs, a component stops with the install command (decision 3).
    shutil.rmtree(extensions / 'Erasmus-CTM')
    shutil.rmtree(extensions / 'ctm-libs')
    for filters in ('math-exercise', 'py-exercise'):
        (course / '_quarto.yml').write_text(f'project:\n  type: default\n  render: [mixed.qmd]\nfilters: [{filters}]\n')
        result = render(course, expect_ok=False)
        assert result.returncode != 0 and 'needs its library ctm-libs' in result.stderr and INSTALL in result.stderr, result.stderr
    (course / '_quarto.yml').write_text('project:\n  type: default\n  render: [mixed.qmd]\nfilters: [ctm-assessment]\n')
    assert render(course, expect_ok=False).returncode != 0, 'the package must not render without ctm-libs'
print('Installable archive passed: all five components render from a fresh course with one copy of each script, also next to '
      'standalone copies (an old ai-feedback 0.8.1, a newer ctm-libs); an old ai-feedback listed with the package stops; '
      'without ctm-libs a component stops with the install command; JSXGraph release line and licence notices.')
