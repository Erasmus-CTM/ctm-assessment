// One Pyodide version in Node, as the page's Python runtime: loadPackage
// serves SymPy, mpmath and NetworkX from that version's verified wheels, and
// every grading call (math-exercise's _math_check / _math_check_custom) is
// recorded with its result.
'use strict';

async function boot(version, wheels) {
  const {loadPyodide} = require(`pyodide-${version}`);
  const py = await loadPyodide({stdout: () => {}, stderr: () => {}});
  const load = py.loadPackage.bind(py);
  const loaded = new Set();
  const needs = {sympy: ['mpmath', 'sympy'], mpmath: ['mpmath'], networkx: ['networkx']};
  py.loadPackage = async (names, options) => {
    for (const name of [].concat(names)) {
      const key = String(name).toLowerCase();
      if (!needs[key]) { await load(name, options); continue; }
      for (const part of needs[key]) {
        if (loaded.has(part)) continue;
        await load(wheels[part], {messageCallback: () => {}, errorCallback: () => {}});
        loaded.add(part);
      }
    }
  };
  const info = py.runPython('import sys, platform; f"{sys.version.split()[0]}"');
  return {py, python: info};
}

// A view of `py` for one page: grading results are appended to `calls`.
function recording(py, calls) {
  const run = py.runPythonAsync.bind(py);
  return new Proxy(py, {
    get(target, property) {
      if (property === 'runPythonAsync') {
        return async (code, options) => {
          const result = await run(code, options);
          if (typeof code === 'string' && code.includes('._math_run("_math_check')) calls.push(result);
          return result;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

module.exports = {boot, recording};
