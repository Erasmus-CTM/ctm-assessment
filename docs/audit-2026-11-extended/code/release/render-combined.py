#!/usr/bin/env python3
"""Build a scratch combined EN/NB fixture; sources are read-only, no provider keys."""
from pathlib import Path
import argparse,shutil,subprocess
p=argparse.ArgumentParser();p.add_argument('--sources',type=Path,default=Path('/workspace'));p.add_argument('--snapshots',type=Path,default=Path('/workspace/audit-snapshots'));p.add_argument('--out',type=Path,default=Path('/tmp/ctm-audit-combined'));args=p.parse_args()
out=args.out;out.mkdir(parents=True,exist_ok=True)
for name in ['ctm-assessment','ctm-libs','ctm-checkers','math-exercise','py-exercise','ctm-stack','jsxgraph','pyodide-interaktiv']:
 repo='jsxgraph-quarto' if name=='jsxgraph' else name
 src=(args.snapshots/repo if repo in ['jsxgraph-quarto','pyodide-interaktiv','ctm-stack'] else args.sources/repo)/'_extensions'/name
 shutil.copytree(src,out/'_extensions'/name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
(out/'_quarto.yml').write_text('''project:
  type: website
  render: [en.qmd, nb.qmd]
format:
  html:
    theme: default
filters:
  - path: _extensions/ctm-assessment/tab-ids.lua
    at: pre-ast
  - ctm-assessment
ctm-assessment:
  markdown-lint: true
  save: answers
ai-feedback:
  mode: copy
  without-ai: text
''')
body=r'''
:::::: {.panel-tabset}

## Mathematics {#math-tab}

```{math-exercise}
#| label: audit-product
#| context: none
#| mode: numeric
#| tolerance: 0.01
What is $6\cdot 7$? _[42]
```

## Python {#python-tab}

```{py-exercise}
#| label: audit-python
#| task: Return the sum.
def add(a, b):
    return a+b
## TESTS ##
assert add(20,22)==42
```

## Feedback {#feedback-tab}

:::: {.ai-feedback #audit-text context="none"}
Explain addition in one sentence.

::: {.feedback-starter}
Addition combines quantities.
:::

::::

## Diagram {#diagram-tab}

```{.jsxgraph assessment_id="audit-board" width="400" height="280"}
var board=JXG.JSXGraph.initBoard(BOARDID,{boundingbox:[-3,3,3,-3],axis:true});
board.create('point',[1,2]);
```

::::::
'''
for lang in ['en','nb']:(out/(lang+'.qmd')).write_text('---\ntitle: "Combined audit fixture"\nengine: markdown\nlang: '+lang+'\n---\n'+body)
print('FIXTURE',out,flush=True);subprocess.run(['quarto','render'],cwd=out,check=True)
