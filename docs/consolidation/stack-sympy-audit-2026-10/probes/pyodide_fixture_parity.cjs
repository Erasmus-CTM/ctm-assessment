// Pyodide 0.27.2 (Node) parity for the supported native fixture rows, using the repo's own evaluate_case.
const fs = require('fs'), path = require('path'), vm = require('vm');
// PYODIDE: the pyodide 0.27.2 npm package (folder or name); PYODIDE_WHEELS: a folder with the mpmath 1.3.0 and
// SymPy 1.13.3 wheels; STACK_SYMPY: stack-sympy at f450bcd (the audited commit).
const {loadPyodide} = require(process.env.PYODIDE || 'pyodide');
const WHEELS = process.env.PYODIDE_WHEELS;
const REPO = process.env.STACK_SYMPY;
(async () => {
  const py = await loadPyodide({stdout: () => {}, stderr: () => {}});
  for (const w of ['mpmath-1.3.0-py3-none-any.whl', 'sympy-1.13.3-py3-none-any.whl']) await py.loadPackage(path.join(WHEELS, w));
  const ctx = {globalThis: {}}; vm.runInNewContext(fs.readFileSync(path.join(REPO, '_extensions/stack-sympy/runtime-sources.js'), 'utf8'), ctx);
  py.FS.mkdirTree('/home/pyodide/stack_sympy'); py.FS.mkdirTree('/home/pyodide/native_compliance');
  for (const [p, src] of Object.entries(ctx.globalThis.STACK_SYMPY_SOURCES)) py.FS.writeFile('/home/pyodide/' + p, src);
  py.FS.writeFile('/home/pyodide/native_compliance/__init__.py', '');
  for (const n of ['common.py', 'python_runner.py']) py.FS.writeFile('/home/pyodide/native_compliance/' + n, fs.readFileSync(path.join(REPO, 'scripts/native_compliance', n), 'utf8'));
  await py.runPythonAsync("import sys\nsys.path.insert(0, '/home/pyodide')\nfrom native_compliance.python_runner import evaluate_case");
  const fixtures = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/native_compliance/fixtures.json'), 'utf8')).cases;
  const cpy = JSON.parse(fs.readFileSync(path.join(REPO, 'test-results/compliance/python.json'), 'utf8')).observations;
  const byId = Object.fromEntries(cpy.map(o => [o.case_id, o]));
  const chosen = fixtures.filter(c => byId[c.id] && byId[c.id].scope === 'supported');
  let same = 0, diff = [], t0 = Date.now();
  for (const c of chosen) {
    py.globals.set('_case', JSON.stringify(c));
    const r = JSON.parse(await py.runPythonAsync("import json\njson.dumps(evaluate_case(json.loads(_case)))"));
    const o = byId[c.id];
    const key = x => [x.kind, x.valid, x.correct].join('/');
    if (key(r) === key(o)) same++; else diff.push({id: c.id, test: c.test, pyodide: key(r), cpython: key(o)});
  }
  console.log(`supported rows: ${chosen.length}; identical kind/valid/correct: ${same}; differences: ${diff.length}; ${((Date.now()-t0)/1000).toFixed(1)}s`);
  diff.slice(0, 10).forEach(d => console.log(JSON.stringify(d)));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
