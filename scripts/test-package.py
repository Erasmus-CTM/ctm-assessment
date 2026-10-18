#!/usr/bin/env python3
"""Install the built archive into a fresh course and exercise its meta-filter."""
from pathlib import Path
import os, subprocess, sys, tempfile
archive = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='ctm-install-', dir=archive.parent) as temp:
    course = Path(temp)
    subprocess.run(['quarto', 'add', str(archive), '--no-prompt'], cwd=course, check=True)
    import json
    record = json.loads((course / '_extensions' / 'ctm-assessment' / 'resolved-repos.json').read_text())
    assert set(record['repositories']) >= {'ai-feedback', 'math-exercise', 'py-exercise', 'pyodide-interaktiv', 'jsxgraph'}, 'installed record incomplete'
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
    subprocess.run(['quarto','render'],cwd=course,check=True)
    html=(course/'example.html').read_text()
    for marker in ['ai-feedback-activity','math-exercise-cell','py-exercise-cell','qpyodide-insertion-location-','<iframe']:
        assert marker in html, marker+' missing after archive installation'
    for file in ['feedback-core.js','feedback-dom.js','ai-feedback.js']:
        assert html.count('/'+file+'"') == 1, file+' did not load exactly once'
    # A course may also hold separately added copies (`quarto add Erasmus-CTM/...`
    # installs under an owner folder). The umbrella keeps using its own set.
    import shutil
    for name in ['ai-feedback', 'math-exercise', 'py-exercise']:
        shutil.copytree(course / '_extensions' / name, course / '_extensions' / 'Erasmus-CTM' / name)
    subprocess.run(['quarto','render'],cwd=course,check=True)
    html=(course/'example.html').read_text()
    for file in ['feedback-core.js','feedback-dom.js','ai-feedback.js']:
        assert html.count('/'+file+'"') == 1, file+' did not load exactly once next to standalone copies'
    import base64, re
    frames = ' '.join(base64.b64decode(m).decode('utf8', 'replace') for m in re.findall(r'data:text/html;base64,([A-Za-z0-9+/=]+)', html))
    assert 'jsxgraph@1/distrib/jsxgraphcore.js' in frames, 'JSXGraph boards do not load the package library versions'
    folders = {'jsxgraph': 'jsxgraph'}
    for name in ['ai-feedback', 'math-exercise', 'py-exercise', 'pyodide-interaktiv', 'jsxgraph', 'ctm-assessment']:
        own = course / '_extensions' / folders.get(name, name)
        notice = (course / '_extensions' / 'ctm-assessment' / 'licenses' / (name + '.txt')).is_file()
        assert notice or any(p.name.upper().startswith(('LICENSE', 'COPYING')) for p in own.iterdir() if p.is_file()), name + ' licence not installed'
    # Standalone copies may follow a newer ai-feedback than the package.
    standalone = course / '_extensions' / 'Erasmus-CTM' / 'ai-feedback' / '_extension.yml'
    standalone.write_text(re.sub(r'(?m)^version:.*$', 'version: 9.9.9', standalone.read_text()))
    # A JSXGraph added with `quarto add` lands inside the package's copy: warned about, harmless.
    nested = course / '_extensions' / 'jsxgraph' / 'jsxgraph'
    shutil.copytree(course / '_extensions' / 'jsxgraph', nested, ignore=shutil.ignore_patterns('jsxgraph'))
    result = subprocess.run(['quarto','render'], cwd=course, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert 'separately added JSXGraph extension was installed inside' in result.stderr, result.stderr
    html = (course / 'example.html').read_text()
    own_version = re.search(r'(?m)^version:\s*(\S+)', (course / '_extensions' / 'ai-feedback' / '_extension.yml').read_text()).group(1)
    assert 'ai-feedback-9.9.9' not in html and 'ai-feedback-' + own_version + '/' in html, 'the package must keep its own ai-feedback'
    shutil.rmtree(nested)
    # One page combining filters bound to different ai-feedback versions stops clearly.
    (course / '_quarto.yml').write_text('project:\n  type: default\n  render: [mixed.qmd]\nfilters: [Erasmus-CTM/math-exercise, py-exercise]\npy-exercise:\n  feedback: true\n')
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
    result = subprocess.run(['quarto','render'], cwd=course, capture_output=True, text=True)
    assert result.returncode != 0 and 'combines filters that use different ai-feedback versions' in result.stderr, result.stderr
print('Installable archive passed: all five components render from a fresh course, also next to standalone copies '
      '(including a newer ai-feedback), with the JSXGraph release line and licence notices.')
