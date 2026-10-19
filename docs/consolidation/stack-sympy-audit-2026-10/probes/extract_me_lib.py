"""Extract math-exercise's embedded Python checker library to a .py file (read-only).

    python extract_me_lib.py OUT.py                  # math-exercise.js at the umbrella's pin (integration/feedback/repos.json)
    python extract_me_lib.py --commit SHA OUT.py     # at another math-exercise commit
    python extract_me_lib.py --source FILE OUT.py    # a local math-exercise.js

The library has one home, math-exercise; the audit keeps no copy and fetches
it when a probe needs it (the audit read it at 8ab1b25, the umbrella's pin).
"""
import argparse
import ast
import json
from pathlib import Path
import re
import urllib.request

REPOS = Path(__file__).resolve().parents[4] / 'integration/feedback/repos.json'
RAW = 'https://raw.githubusercontent.com/Erasmus-CTM/math-exercise/{}/_extensions/math-exercise/math-exercise.js'

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('out', type=Path)
parser.add_argument('--commit', help='math-exercise commit (default: the umbrella pin)')
parser.add_argument('--source', type=Path, help='a local math-exercise.js instead of fetching one')
args = parser.parse_args()
if args.source:
    src = args.source.read_text()
else:
    commit = args.commit or json.loads(REPOS.read_text())['repositories']['math-exercise']['commit']
    with urllib.request.urlopen(RAW.format(commit)) as response:
        src = response.read().decode('utf-8')
m = re.search(r"var source = \[\n(.*?)\n    \]\.join\('\\n'\);", src, re.S)
lines = ast.literal_eval('[' + m[1] + ']')
args.out.write_text('\n'.join(lines) + '\n')
print(len(lines), 'lines')
