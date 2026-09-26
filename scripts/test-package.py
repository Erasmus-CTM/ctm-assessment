#!/usr/bin/env python3
"""Install the built archive into a fresh course and exercise its meta-filter."""
from pathlib import Path
import os, subprocess, sys, tempfile
archive = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='ctm-install-', dir=archive.parent) as temp:
    course = Path(temp)
    subprocess.run(['quarto', 'add', str(archive), '--no-prompt'], cwd=course, check=True)
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
print('Installable archive passed: all five components render from a fresh course.')
