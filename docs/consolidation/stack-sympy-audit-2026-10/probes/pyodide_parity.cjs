// Run stack_sympy (bundled runtime-sources.js) in real Pyodide 0.27.2 (Node) with SymPy 1.13.3 wheels.
const fs = require('fs'), path = require('path'), vm = require('vm');
// PYODIDE: the pyodide 0.27.2 npm package (folder or name); PYODIDE_WHEELS: a folder with the mpmath 1.3.0 and
// SymPy 1.13.3 wheels; STACK_SYMPY: stack-sympy at f450bcd (the audited commit).
const {loadPyodide} = require(process.env.PYODIDE || 'pyodide');
const WHEELS = process.env.PYODIDE_WHEELS;
const REPO = process.env.STACK_SYMPY;
(async () => {
  const py = await loadPyodide({stdout: () => {}, stderr: () => {}});
  for (const w of ['mpmath-1.3.0-py3-none-any.whl', 'sympy-1.13.3-py3-none-any.whl']) await py.loadPackage(path.join(WHEELS, w));
  const ctx = {globalThis: {}}; ctx.self = ctx.globalThis;
  vm.runInNewContext(fs.readFileSync(path.join(REPO, '_extensions/stack-sympy/runtime-sources.js'), 'utf8'), ctx);
  const files = ctx.globalThis.STACK_SYMPY_SOURCES || ctx.STACK_SYMPY_SOURCES;
  py.FS.mkdirTree('/home/pyodide/stack_sympy');
  for (const [p, src] of Object.entries(files)) py.FS.writeFile('/home/pyodide/' + p, src);
  py.FS.mkdirTree('/probe');
  for (const f of ['polynomial-expansion.xml', 'zero-product.xml']) py.FS.writeFile('/probe/' + f, fs.readFileSync(path.join(REPO, 'questions', f), 'utf8'));
  for (const f of ['quiet.xml', 'physics-I.xml', 'numabs-branch.xml']) py.FS.writeFile('/probe/' + f, fs.readFileSync(path.join(__dirname, 'q', f), 'utf8'));
  py.FS.writeFile('/probe/cases.json', fs.readFileSync(path.join(__dirname, 'cases1.json'), 'utf8'));
  const out = await py.runPythonAsync(`
import sys, json, platform
sys.path.insert(0, '/home/pyodide')
import sympy
from stack_sympy.assessment import answer_test
from stack_sympy.importer import import_xml
from stack_sympy.engine import instantiate, grade, validate
res = {"python": platform.python_version(), "sympy": sympy.__version__, "at": [], "q": {}}
for test, s, t, o in json.load(open('/probe/cases.json')):
    try:
        r = answer_test(test, s, t, o, raw=s)
        res["at"].append([test, s, t, o, "INVALID" if not r["valid"] else str(r["correct"])])
    except Exception as e:
        res["at"].append([test, s, t, o, "EXC " + type(e).__name__])
def g(f, ans):
    q = import_xml('/probe/' + f)[0]; v = instantiate(q, 1)
    r = grade(q, ans, variant=v)
    return [r["status"], r["score"], {k: p["feedback"] for k, p in r["prts"].items()}]
res["q"]["leak polynomial ta"] = g('polynomial-expansion.xml', {"ans": "ta"})
res["q"]["leak zero-product ta"] = g('zero-product.xml', {"ans": "ta"})
res["q"]["physics -R"] = g('physics-I.xml', {"ans1": "-R"})
res["q"]["quiet not factored"] = g('quiet.xml', {"ans1": "x^2+x-2"})
res["q"]["numabs 45*x"] = g('numabs-branch.xml', {"ans1": "45*x"})
json.dumps(res)
`);
  fs.writeFileSync(path.join(__dirname, 'pyodide-parity.json'), out);
  const r = JSON.parse(out);
  console.log('Pyodide python', r.python, 'sympy', r.sympy);
  const cpy = JSON.parse(fs.readFileSync(path.join(__dirname, 'out1.json'), 'utf8'));
  let diff = 0;
  r.at.forEach((row, i) => {
    const p = cpy[i].port; const c = 'exception' in p ? 'EXC' : (!p.valid ? 'INVALID' : (p.correct ? 'True' : 'False'));
    const pv = row[4].startsWith('EXC') ? 'EXC' : row[4];
    if (c !== pv) { diff++; console.log('DIFF', row, 'cpython', c); }
  });
  console.log('AT rows', r.at.length, 'CPython/Pyodide differences', diff);
  console.log(JSON.stringify(r.q, null, 1));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
