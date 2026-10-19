"""Extract math-exercise's embedded Python checker library to a .py file (read-only)."""
import ast, re, sys
from pathlib import Path
src = Path(sys.argv[1]).read_text()
m = re.search(r"var source = \[\n(.*?)\n    \]\.join\('\\n'\);", src, re.S)
lines = ast.literal_eval('[' + m[1] + ']')
Path(sys.argv[2]).write_text('\n'.join(lines) + '\n')
print(len(lines), 'lines')
