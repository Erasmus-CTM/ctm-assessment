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
  const files = ctx.globalThis.STACK_SYMPY_SOURCES;
  py.FS.mkdirTree('/home/pyodide/stack_sympy');
  for (const [p, src] of Object.entries(files)) py.FS.writeFile('/home/pyodide/' + p, src);
  py.FS.writeFile('/home/pyodide/numabs.xml', fs.readFileSync(path.join(__dirname, 'q/numabs-branch.xml'), 'utf8'));
  await py.runPythonAsync("import sys\nsys.path.insert(0, '/home/pyodide')\nimport stack_sympy.engine");
  // Same request path as worker.js
  const prep = await py.runPythonAsync("import json\nfrom stack_sympy.importer import import_xml\nfrom stack_sympy.engine import instantiate\nq=import_xml('/home/pyodide/numabs.xml')[0]\njson.dumps({'question': q, 'variant': instantiate(q, 1)})");
  const payload = JSON.parse(prep);
  const msg = Object.assign({id: 1, type: 'grade', answers: {ans1: 'exp(exp(exp(exp(10))))'}}, payload);
  py.globals.set('_stack_request', JSON.stringify(msg));
  try {
    await py.runPythonAsync([
      'import json',
      'from stack_sympy.engine import grade, validate, run_question_tests',
      'from stack_sympy.importer import UnsupportedQuestion',
      '_request = json.loads(_stack_request)',
      'try:',
      '    _result = grade(_request["question"], _request["answers"], variant=_request["variant"])',
      'except UnsupportedQuestion as exc:',
      '    _response = {"ok": False, "error": str(exc)}',
      'else:',
      '    _response = {"ok": True, "result": _result}',
      'json.dumps(_response, default=str)'].join('\n'));
    console.log('no error');
  } catch (error) {
    console.log('UI would show: Could not check this answer: ' + String(error && error.message || error).slice(0, 900));
  }
  process.exit(0);
})();
