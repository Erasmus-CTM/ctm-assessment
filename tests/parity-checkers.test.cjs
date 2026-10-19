// The parity harness (integration/pyodide-parity) grades math-exercise 0.11,
// which calls ctm-checkers through ctm-libs (step-2 design §6.4), alike with
// math-exercise 0.10, so a build comparison (--builds) covers the move: the
// recording view records the call path of ctm-libs' callCheckers under the
// names of the values 0.10 set, math pages load ctm-checkers' page script,
// and authored tests run through ctm-checkers when the build has it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const {recording, legacyInput} = require('../integration/pyodide-parity/runtime.cjs');
const {checkersWheel} = require('../integration/pyodide-parity/run.cjs');
const {AUTHORED} = require('../integration/pyodide-parity/authored.cjs');
const scripts = require('../integration/feedback/page-scripts.cjs');

// ctm-libs' call text (MathExerciseRuntime.callCheckers) and its cleanup.
const callText = (name) => 'import builtins as _ctm_builtins\n'
  + '_ctm_builtins.__import__("ctm_checkers.browser", fromlist=["call"]).call("math_exercise.' + name + '", _ctm_builtins.globals())';
const CLEANUP = '_ctm_request = None\ndel _ctm_request';

function fakePy() {
  const set = [], seeded = [], runs = [];
  return {set, seeded, runs, globals: {set: (name, value) => set.push([name, value])}, runPython: (code) => { seeded.push(code); },
    runPythonAsync: async (code) => {
      runs.push(code);
      if (code.includes('boom')) throw new Error('Traceback (most recent call last):\n  File "<exec>", line 2\nValueError: SyntaxError: unsupported input');
      return '{"status": "correct", "score": 1.0}';
    }};
}

const CHECK = {student: '2*x', correct: 'x+x', vars: 'x', mode: 'equivalent', reject: '', tolerance: '', decplaces: '', sigfigs: '', form: '',
  partial_credit: false, form_credit: 0.5};
const CUSTOM = {checker: 'def check(response, symbols):\n    return True\n', vars: 'x', response: {kind: 'expressions', raw: ['1'], inputs: {}}};

test('ctm-checkers calls are recorded with their request, under the names of the values math-exercise 0.10 set', async () => {
  const py = fakePy(), calls = [];
  const view = recording(py, calls);
  view.globals.set('_ctm_request', JSON.stringify(CHECK));
  assert.equal(await view.runPythonAsync(callText('check')), '{"status": "correct", "score": 1.0}');
  await view.runPythonAsync(CLEANUP);
  await view.runPythonAsync('import json\n"install code"');
  view.globals.set('_ctm_request', JSON.stringify(CUSTOM));
  await assert.rejects(view.runPythonAsync(callText('check_custom') + '  # boom'));
  assert.equal(py.set.length, 2, 'the request still reaches Python');
  assert.equal(py.runs.length, 4, 'every code still runs');
  assert.equal(calls.length, 2, 'only the grading calls are recorded');
  assert.deepEqual(calls[0], {call: 'check', input: {_math_student: '2*x', _math_correct: 'x+x', _math_vars: 'x', _math_mode: 'equivalent',
    _math_reject: '', _math_tolerance: '', _math_decplaces: '', _math_sigfigs: '', _math_form: '', _math_partial_credit: false,
    _math_form_credit: 0.5}, text: '{"status": "correct", "score": 1.0}'});
  assert.deepEqual(calls[1], {call: 'check_custom', input: {_math_checker: CUSTOM.checker, _math_vars: 'x',
    _math_response_json: '{"kind":"expressions","raw":["1"],"inputs":{}}'}, raised: 'ValueError: SyntaxError: unsupported input'});
  assert.deepEqual(py.seeded, ['__import__("random").seed(0)', '__import__("random").seed(0)'], 'random is seeded before each grading call');
  assert.deepEqual(legacyInput('{"new_field": 1}'), {new_field: 1}, 'a field 0.10 did not have keeps its name');
});

test('the same request recorded from math-exercise 0.10 and through ctm-checkers gives the same input', async () => {
  const legacy = [], current = [];
  const old = recording(fakePy(), legacy);
  for (const [key, value] of Object.entries(CUSTOM)) old.globals.set('_math_' + (key === 'response' ? 'response_json' : key), key === 'response' ? JSON.stringify(value) : value);
  await old.runPythonAsync('__import__("_ctm_math_exercise")._math_run("_math_check_custom", globals())');
  const view = recording(fakePy(), current);
  view.globals.set('_ctm_request', JSON.stringify(CUSTOM));
  await view.runPythonAsync(callText('check_custom'));
  assert.deepEqual(current, legacy);
});

test('math pages load ctm-checkers\' page script, in document order; its development version holds a +', () => {
  assert.ok(scripts.MATH.includes('ctm-checkers'));
  assert.deepEqual(scripts.dependency('site_libs/quarto-contrib/ctm-checkers-0.1.1.dev0+be41199f/ctm-checkers.js'),
    {name: 'ctm-checkers', version: '0.1.1.dev0+be41199f', file: 'ctm-checkers.js'});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-scripts-'));
  try {
    const files = {'ctm-runtime-0.9.0/pyodide-runtime.js': 'ctm-runtime', 'ctm-checkers-0.1.1.dev0+be41199f/ctm-checkers.js': 'ctm-checkers',
      'math-exercise-0.11.0/math-exercise.js': 'math-exercise', 'other-1.0/other.js': 'other'};
    for (const [file, name] of Object.entries(files)) {
      fs.mkdirSync(path.join(dir, 'site_libs', 'quarto-contrib', path.dirname(file)), {recursive: true});
      fs.writeFileSync(path.join(dir, 'site_libs', 'quarto-contrib', file), `(window.loaded = window.loaded || []).push(${JSON.stringify(name)});`);
    }
    const page = path.join(dir, 'page.html');
    fs.writeFileSync(page, '<html><head>' + Object.keys(files).map(file => `<script src="site_libs/quarto-contrib/${file}"></script>`).join('')
      + '</head><body></body></html>');
    const w = new JSDOM(fs.readFileSync(page, 'utf8'), {url: 'http://localhost/page.html', runScripts: 'outside-only'}).window;
    scripts.run(w, page, scripts.MATH);
    assert.deepEqual([...w.loaded], ['ctm-runtime', 'ctm-checkers', 'math-exercise']);
    w.close();
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a build\'s ctm-checkers wheel is the one next to math-exercise', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-extensions-'));
  try {
    assert.equal(checkersWheel(dir), null);
    fs.mkdirSync(path.join(dir, 'ctm-checkers'));
    fs.writeFileSync(path.join(dir, 'ctm-checkers', 'checkers.json'), JSON.stringify({wheel: 'ctm_checkers-0.1.1.dev0-py3-none-any.whl'}));
    assert.equal(checkersWheel(dir), path.join(dir, 'ctm-checkers', 'ctm_checkers-0.1.1.dev0-py3-none-any.whl'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// The authored-test program (worker.cjs runs it in Pyodide; it is plain
// Python) natively, with stand-ins: a ctm-checkers wheel whose
// authored_questions and run_question mark what they did, and a
// question-tests.py of math-exercise 0.10's shape.
const python = ['python3', 'python'].find(name => !spawnSync(name, ['--version']).error);
test('authored tests run through ctm-checkers when the build has it, else through question-tests.py', {skip: python ? false : 'Python 3 required'}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-authored-'));
  try {
    const parity = path.join(dir, 'ctm-parity');
    fs.mkdirSync(parity);
    fs.copyFileSync(path.join(__dirname, '..', 'integration', 'pyodide-parity', 'authored_record.py'), path.join(parity, 'authored_record.py'));
    const run = 'def run(options, base, origin):\n    scope = {}\n    exec(options["checker"], scope)\n    exec(options["tests"], scope)\n'
      + '    scope["test"](scope["check"], {"origin": origin})\n';
    const question = '{"label": LABEL, "mode": "custom", "checker": "def check(response, symbols):\\n    return {\\"score\\": 1, \\"by\\": symbols[\\"origin\\"]}\\n", '
      + '"tests": "def test(check, symbols):\\n    assert check({\\"raw\\": [\\"1\\"]}, symbols)[\\"score\\"] == 1\\n"}';
    fs.writeFileSync(path.join(parity, 'question-tests.py'), run
      + 'def runtime_namespace():\n    return {}\n'
      + 'def run_question(options, runtime, base):\n    run(options, base, "question-tests.py")\n'
      + 'def authored_questions(path):\n    yield ' + question.replace('LABEL', '"q (0.10)"') + '\n');
    // A wheel of stand-ins (a zip; zipimport as with the real one).
    const wheelDir = path.join(dir, 'wheel', 'ctm_checkers', 'math_exercise');
    fs.mkdirSync(wheelDir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'wheel', 'ctm_checkers', '__init__.py'), '');
    fs.writeFileSync(path.join(wheelDir, '__init__.py'), '');
    fs.writeFileSync(path.join(wheelDir, 'authored.py'), run
      + 'def run_question(options, base):\n    run(options, base, "ctm-checkers")\n'
      + 'def authored_questions(path):\n    yield ' + question.replace('LABEL', '"q (ctm-checkers)"') + '\n');
    const wheel = path.join(parity, 'ctm_checkers-0.0.0-py3-none-any.whl');
    const zip = spawnSync(python, ['-c', 'import shutil, sys; shutil.make_archive(sys.argv[1], "zip", sys.argv[2]); shutil.move(sys.argv[1] + ".zip", sys.argv[3])',
      path.join(dir, 'archive'), path.join(dir, 'wheel'), wheel], {encoding: 'utf8'});
    assert.equal(zip.status, 0, zip.stderr);
    const tree = path.join(dir, 'tree');
    fs.mkdirSync(tree);
    fs.writeFileSync(path.join(tree, 'page.qmd'), 'stand-in\n');
    const program = (wheelPath) => '_ctm_parity_wheel = ' + (wheelPath ? JSON.stringify(wheelPath) : 'None') + '\n'
      + AUTHORED.split('/ctm-parity/').join(parity + '/') + '\nprint(_ctm_authored(' + JSON.stringify(tree) + ', ["page.qmd"]))\n';
    const records = (wheelPath) => {
      const result = spawnSync(python, ['-c', program(wheelPath)], {encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout).map(text => JSON.parse(text));
    };
    const [legacy] = records(null), [current] = records(wheel);
    assert.equal(legacy.label, 'q (0.10)');
    assert.equal(current.label, 'q (ctm-checkers)');
    assert.deepEqual([legacy.outcome, legacy.calls, legacy.responses], ['pass', [{by: 'question-tests.py', score: 1}], [{inputs: {}, kind: 'expressions', raw: ['1']}]]);
    assert.deepEqual([current.outcome, current.calls, current.responses], ['pass', [{by: 'ctm-checkers', score: 1}], [{inputs: {}, kind: 'expressions', raw: ['1']}]]);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
