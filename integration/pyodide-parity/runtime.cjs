// One Pyodide version in Node, as the page's Python runtime: loadPackage
// serves SymPy, mpmath and NetworkX from that version's verified wheels, and
// every grading call (math-exercise's check and check_custom) is recorded at
// the runtime boundary: the values set before it (the request) and the JSON
// text it returned, or the error it raised. Both call paths are recorded:
// math-exercise 0.10's `_math_run` after the `_math_*` values, and
// ctm-checkers' `call("math_exercise.…")` after `_ctm_request` (ctm-libs'
// MathExerciseRuntime.callCheckers), whose request is recorded under the
// `_math_*` names of the values 0.10 set, so both give the same rows. The
// interpreter runs with a fixed PYTHONHASHSEED (set and dict orders do not
// vary between processes), and `random` is seeded before each grading call.
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

// The grading calls math-exercise.js makes: 0.10's
// `_ctm_math_exercise._math_run("_math_check", globals())`, and with
// ctm-checkers `….call("math_exercise.check", …)` (ctm-libs' call text).
const CALL = /\._math_run\("_math_(check(?:_custom)?)"/;
const CHECKERS_CALL = /\.call\("math_exercise\.(check(?:_custom)?)"/;
// ctm-checkers' request fields (its docs/api.md) and the values math-exercise 0.10 set for them.
const LEGACY_NAMES = {student: '_math_student', correct: '_math_correct', vars: '_math_vars', mode: '_math_mode', reject: '_math_reject',
  tolerance: '_math_tolerance', decplaces: '_math_decplaces', sigfigs: '_math_sigfigs', form: '_math_form',
  partial_credit: '_math_partial_credit', form_credit: '_math_form_credit', checker: '_math_checker'};
// A ctm-checkers request (`_ctm_request`, JSON text) as the values math-exercise 0.10 set:
// `response` as its JSON text (`_math_response_json`); a field 0.10 did not have keeps its name.
function legacyInput(text) {
  const input = {};
  for (const [key, value] of Object.entries(JSON.parse(text))) {
    if (key === 'response') input._math_response_json = JSON.stringify(value);
    else input[LEGACY_NAMES[key] || key] = value;
  }
  return input;
}
// A Python error as the page sees it: its last line ("ValueError: ..."), without the traceback.
function raised(error) {
  const lines = String(error && error.message || error).trim().split('\n').filter(line => line.trim());
  return lines[lines.length - 1] || String(error);
}

// A view of `py` for one page: every grading call is appended to `calls` as
// {call, input, text} or {call, input, raised}. `input` holds the `_math_*`
// values the page set since the previous call, exactly as set (strings,
// booleans, numbers), or the `_ctm_request` it set, under those names;
// math-exercise.js sets a request's values and runs its call in one
// transaction, so these are that call's request.
function recording(py, calls) {
  const run = py.runPythonAsync.bind(py);
  let pending = {};
  const globals = new Proxy(py.globals, {
    get(target, property) {
      if (property === 'set') {
        return (name, value) => {
          if (typeof name === 'string' && name.startsWith('_math_')) pending[name] = value;
          if (name === '_ctm_request' && typeof value === 'string') pending = legacyInput(value);
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
          const match = typeof code === 'string' && (CALL.exec(code) || CHECKERS_CALL.exec(code));
          if (!match) return run(code, options);
          const call = match[1], input = pending;
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

module.exports = {boot, recording, raised, legacyInput};
