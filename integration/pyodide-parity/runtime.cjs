// One Pyodide version in Node, as the page's Python runtime: loadPackage
// serves SymPy, mpmath and NetworkX from that version's verified wheels, and
// every grading call (math-exercise's _math_check / _math_check_custom) is
// recorded at the runtime boundary: the values set before it (the request)
// and the JSON text it returned, or the error it raised. The interpreter runs
// with a fixed PYTHONHASHSEED (set and dict orders do not vary between
// processes), and `random` is seeded before each grading call.
'use strict';

async function boot(version, wheels, hashSeed = 0) {
  const {loadPyodide} = require(`pyodide-${version}`);
  const py = await loadPyodide({stdout: () => {}, stderr: () => {}, env: {PYTHONHASHSEED: String(hashSeed)}});
  if (py.runPython('import sys; sys.flags.hash_randomization') !== (hashSeed ? 1 : 0)) throw new Error('PYTHONHASHSEED did not reach Python');
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

// The grading calls math-exercise.js makes: `_ctm_math_exercise._math_run("<name>", globals())`.
const CALL = /\._math_run\("(_math_check(?:_custom)?)"/;
// A Python error as the page sees it: its last line ("ValueError: ..."), without the traceback.
function raised(error) {
  const lines = String(error && error.message || error).trim().split('\n').filter(line => line.trim());
  return lines[lines.length - 1] || String(error);
}

// A view of `py` for one page: every grading call is appended to `calls` as
// {call, input, text} or {call, input, raised}. `input` holds the `_math_*`
// values the page set since the previous call, exactly as set (strings,
// booleans, numbers); math-exercise.js sets a request's values and runs its
// call in one transaction, so these are that call's request.
function recording(py, calls) {
  const run = py.runPythonAsync.bind(py);
  let pending = {};
  const globals = new Proxy(py.globals, {
    get(target, property) {
      if (property === 'set') {
        return (name, value) => {
          if (typeof name === 'string' && name.startsWith('_math_')) pending[name] = value;
          return target.set(name, value);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return new Proxy(py, {
    get(target, property) {
      if (property === 'globals') return globals;
      if (property === 'runPythonAsync') {
        return async (code, options) => {
          const match = typeof code === 'string' && CALL.exec(code);
          if (!match) return run(code, options);
          const call = match[1].replace(/^_math_/, ''), input = pending;
          pending = {};
          target.runPython('__import__("random").seed(0)');
          try {
            const text = await run(code, options);
            calls.push({call, input, text});
            return text;
          } catch (error) {
            calls.push({call, input, raised: raised(error)});
            throw error;
          }
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

module.exports = {boot, recording, raised};
