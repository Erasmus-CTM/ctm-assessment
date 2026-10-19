// The golden capture of the parity harness (integration/pyodide-parity):
// requests recorded at the runtime boundary, rows in canonical JSON, Python's
// number spelling kept, outputs with Python messages per Python minor version,
// sources by hash, and the split by provenance (step-2 design §6, §13 item 7).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const capture = require('../integration/pyodide-parity/capture.cjs');
const {recording, raised} = require('../integration/pyodide-parity/runtime.cjs');

test('canonical JSON keeps Python numbers, sorts keys and tags numbers JSON cannot hold', () => {
  const value = capture.pythonJson('{"status": "correct", "score": 1.0, "notes": [1e-09, 2], "text": "\\u00e9"}');
  assert.equal(capture.canonical(value), '{"notes":[1e-09,2],"score":1.0,"status":"correct","text":"é"}');
  assert.equal(capture.canonical({b: NaN, a: Infinity}), '{"a":{"$float":"Infinity"},"b":{"$float":"NaN"}}');
  assert.equal(capture.minor('3.13.2'), '3.13');
});

test('the recording view captures each grading call with the values set before it', async () => {
  const set = [];
  const seeded = [];
  const py = {globals: {set: (name, value) => set.push([name, value]), get: name => name}, runPython: code => { seeded.push(code); },
    runPythonAsync: async code => { if (code.includes('boom')) throw new Error('Traceback (most recent call last):\n  File "<exec>"\nValueError: SyntaxError: unsupported input'); return '{"status": "correct", "score": 1.0}'; }};
  const calls = [];
  const view = recording(py, calls);
  view.globals.set('_math_student', 'x');
  view.globals.set('_math_form_credit', NaN);
  view.globals.set('other', 1);
  assert.equal(await view.runPythonAsync('__import__("_ctm_math_exercise")._math_run("_math_check", globals())'), '{"status": "correct", "score": 1.0}');
  view.globals.set('_math_response_json', '{"kind":"expressions","raw":["__x"]}');
  await assert.rejects(view.runPythonAsync('__import__("_ctm_math_exercise")._math_run("_math_check_custom", globals()) # boom'));
  assert.equal(await view.runPythonAsync('1 + 1'), '{"status": "correct", "score": 1.0}');
  assert.equal(set.length, 4, 'every value still reaches Python');
  assert.equal(calls.length, 2, 'only grading calls are recorded');
  assert.deepEqual(calls[0].input, {_math_student: 'x', _math_form_credit: NaN});
  assert.equal(calls[0].call, 'check');
  assert.equal(calls[1].call, 'check_custom');
  assert.deepEqual(calls[1].input, {_math_response_json: '{"kind":"expressions","raw":["__x"]}'});
  assert.equal(calls[1].raised, 'ValueError: SyntaxError: unsupported input');
  assert.equal(raised('plain'), 'plain');
  assert.deepEqual(seeded, ['__import__("random").seed(0)', '__import__("random").seed(0)'], 'random is seeded before each grading call');
});

test('rows: one per request, outputs per Python minor when they hold a message or differ, sources by hash', () => {
  const collect = capture.collector();
  const checker = 'def check(response, symbols):\n    return True\n';
  const custom = {call: 'check_custom', input: {_math_checker: checker, _math_response_json: '{"kind":"expressions","raw":["1"]}', _math_vars: ''}, text: '{"status": "correct", "score": 1.0, "show_score": true, "feedback": "", "assessment": {}}'};
  const plain = {call: 'check', input: {_math_student: '2', _math_correct: '2', _math_partial_credit: false, _math_form_credit: 0.5}, text: '{"status": "correct", "score": 1.0}'};
  const error = {call: 'check', input: {_math_student: 'x +', _math_correct: '2'}, text: '{"status": "error", "message": "invalid syntax (<string>, line 1)"}'};
  const changing = {call: 'check', input: {_math_student: '3', _math_correct: '2'}};
  for (const python of ['3.12', '3.13']) {
    collect.request('ctm-demo', false, 'keys', [plain, error, {...changing, text: python === '3.12' ? '{"status": "wrong", "score": 0.0}' : '{"status": "wrong", "score": 0}'}], python);
    collect.request('ctm-demo', true, 'probe', [custom, plain], python);   // plain again: stays a request
    collect.request('math-exercise', true, 'probe', [custom], python);
    collect.authored('math-exercise', '{"calls":[true],"file":"a.qmd","label":"q","options":{"checker":' + JSON.stringify(checker) + ',"label":"q","mode":"custom","tests":"def test(check, symbols):\\n    assert check({}, symbols)\\n"},"outcome":"pass","responses":[{}]}', python);
  }
  const {suites, conflicts} = collect.suites();
  assert.deepEqual(conflicts, []);
  const rows = lines => lines.map(line => JSON.parse(line));
  const requests = rows(suites['ctm-demo'].requests);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(r => r.id), [...requests.map(r => r.id)].sort(), 'sorted by id');
  const byStudent = Object.fromEntries(requests.map(r => [r.input._math_student, r]));
  assert.deepEqual(byStudent['2'].output, {status: 'correct', score: 1});
  assert.match(suites['ctm-demo'].requests.find(line => line.includes('"_math_student":"2"')), /"output":\{"score":1\.0,"status":"correct"\}/);
  assert.deepEqual(byStudent['2'].tags, ['keys', 'probe']);
  assert.deepEqual(Object.keys(byStudent['x +'].by_python), ['3.12', '3.13'], 'an error message is kept per version');
  assert.equal(byStudent['x +'].output, undefined);
  assert.deepEqual(Object.keys(byStudent['3'].by_python), ['3.12', '3.13'], 'outputs that differ are kept per version');
  const probes = rows(suites['ctm-demo']['custom-probes']);
  assert.equal(probes.length, 1);
  assert.equal(probes[0].suite, 'math_exercise/custom-probes-ctm-demo');
  assert.deepEqual(probes[0].input._math_checker, {$source: capture.sha256(checker)});
  assert.deepEqual(rows(suites['ctm-demo'].sources), [{sha256: capture.sha256(checker), text: checker}]);
  assert.equal(probes[0].id, rows(suites['math-exercise']['custom-probes'])[0].id, 'the same request has the same id in every corpus');
  const authored = rows(suites['math-exercise'].authored);
  assert.equal(authored.length, 1);
  assert.equal(authored[0].call, 'authored');
  assert.deepEqual(authored[0].output, {calls: [true], outcome: 'pass', responses: [{}]});
  assert.equal(rows(suites['math-exercise'].sources).length, 2, 'checker and tests by hash');
  for (const line of [...suites['ctm-demo'].requests, ...suites['math-exercise'].authored])
    assert.equal(line, capture.canonical(capture.pythonJson(line)), 'canonical: sorted keys, compact');
});

test('a request that gives two outputs in one runtime is a conflict', () => {
  const collect = capture.collector();
  const call = text => ({call: 'check', input: {_math_student: '1'}, text});
  collect.request('umbrella', false, 'keys', [call('{"status": "correct", "score": 1.0}')], '3.13');
  collect.request('umbrella', false, 'challenge', [call('{"status": "wrong", "score": 0.0}')], '3.13');
  assert.equal(collect.suites().conflicts.length, 1);
});

test('the capture is split by provenance: only exportable corpora go to export/', () => {
  const collect = capture.collector();
  const call = {call: 'check', input: {_math_student: '1'}, text: '{"status": "correct", "score": 1.0}'};
  for (const corpus of ['math-exercise', 'ctm-demo', 'umbrella']) collect.request(corpus, false, 'keys', [call], '3.13');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-capture-'));
  try {
    const corpora = {'math-exercise': {repository: 'Erasmus-CTM/math-exercise', licence: 'AGPL-3.0-or-later', export: true, commit: 'a'.repeat(40)},
      'ctm-demo': {repository: 'aacchhee/ctm-demo', licence: 'course', export: false}, umbrella: {repository: 'Erasmus-CTM/ctm-assessment', export: false}};
    const manifest = capture.write(dir, collect.suites().suites, corpora, {format: 1});
    assert.deepEqual(Object.keys(manifest.files).sort(), ['export/math_exercise/requests-math-exercise.jsonl',
      'umbrella/math_exercise/requests-ctm-demo.jsonl', 'umbrella/math_exercise/requests-umbrella.jsonl']);
    assert.equal(manifest.files['export/math_exercise/requests-math-exercise.jsonl'].export, true);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'export')).sort(), ['PROVENANCE.md', 'math_exercise']);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'export', 'PROVENANCE.md'), 'utf8'), /ctm-demo/);
    assert.match(fs.readFileSync(path.join(dir, 'PROVENANCE.md'), 'utf8'), /\| `umbrella\/math_exercise\/requests-ctm-demo\.jsonl` \| ctm-demo \| 1 \|/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).format, 1);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('boundary probes: half-way values next to the rounding, answers at and around the tolerance', () => {
  const {boundaryProbes, keyValue} = require('../integration/pyodide-parity/cases.cjs');
  // Either neighbour's tie can decide the tie rule: 0.325 rounds to 0.33 half up, to 0.32 half even.
  assert.deepEqual(boundaryProbes('1/3', {decplaces: '2'}), ['0.325', '0.335']);
  assert.deepEqual(boundaryProbes('1234', {sigfigs: '3'}), ['1225', '1235']);
  assert.deepEqual(boundaryProbes('pi', {decplaces: '3'}), ['3.1415', '3.1425']);
  assert.deepEqual(boundaryProbes('-2.5', {decplaces: '0'}), ['-3.5', '-2.5']);
  assert.deepEqual(boundaryProbes('9.996', {sigfigs: '3'}), ['9.995'], 'a tie past a power of ten is left out');
  // Decimal places win over a tolerance, as in math-exercise's _num_equal.
  assert.deepEqual(boundaryProbes('1/3', {decplaces: '2', tolerance: '0.1'}), ['0.325', '0.335']);
  // At the tolerance only where the binary difference equals it (key 0), and just inside and outside.
  assert.deepEqual(boundaryProbes('0', {tolerance: '0.01'}), ['0.01', '0.00999', '0.01001', '-0.01', '-0.00999', '-0.01001']);
  assert.deepEqual(boundaryProbes('1', {tolerance: '0.01'}), ['1.00999', '1.01001', '0.99001', '0.98999']);
  assert.deepEqual(boundaryProbes('x + 1', {decplaces: '2'}), []);
  assert.deepEqual(keyValue('3/4'), {value: 0.75, exact: true});
  assert.equal(keyValue('2 pi'), null);
});

test('responses for cells without keys are what the page can send: text per field, a fitting shape per dynamic matrix', () => {
  const {JSDOM} = require('jsdom');
  const {pageShaped, matrixProblem} = require('../integration/pyodide-parity/cases.cjs');
  const {window} = new JSDOM(`<div class="math-exercise-cell"><input class="math-input" id="a"><span class="math-dynamic-matrix-wrap">
    <span class="math-dynamic-mat" data-matrix-name="Z" data-min-rows="3" data-max-rows="3" data-min-cols="0" data-max-cols="3">
    <input class="math-input" id="z11"></span></span></div>`);
  const cell = window.document.querySelector('.math-exercise-cell');
  const fields = [...cell.querySelectorAll('input')];
  const Z = (rows, cols, raw) => ({Z: {rows, cols, raw}});
  assert.deepEqual(pageShaped(cell, fields, ['2'], Z(3, 1, ['-1', '-1', '1'])), {values: ['2'], matrices: Z(3, 1, ['-1', '-1', '1'])});
  assert.deepEqual(pageShaped(cell, fields, ['2'], Z(0, 0, [])), {values: ['2'], matrices: Z(0, 0, [])}, 'the canonical empty matrix');
  assert.match(pageShaped(cell, fields, ['2'], Z(1, 1, ['0'])).problem, /outside rows 3-3/);
  assert.match(pageShaped(cell, fields, [], Z(3, 1, ['1', '2', '3'])).problem, /1 text values expected/);
  assert.match(pageShaped(cell, fields, ['2'], {}).problem, /dynamic matrices Z expected/);
  assert.match(pageShaped(cell, fields, ['2'], Z(3, 1, ['1', '', '3'])).problem, /empty/);
  assert.equal(matrixProblem({rows: {min: 1, max: 3}, cols: {min: 1, max: 3}}, {rows: 0, cols: 0, raw: []}), 'empty, but neither axis may reach zero');
});

test('build comparison: expected differences are accepted, others and stale expectations fail', () => {
  const {readExpected, applyExpected} = require('../integration/pyodide-parity/run.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-expected-'));
  try {
    const file = path.join(dir, 'expected.json');
    fs.writeFileSync(file, JSON.stringify({differences: [
      {path: 'math-exercise/examples.html', case: '/#11:ex-custom-monotonicity\\|/', reason: 'new feedback text'},
      {case: 'authored:math-exercise:examples.qmd#q', reason: 'test edited'},
      {path: 'ctm-demo', reason: 'course re-pinned', required: false},
      {path: 'umbrella/example.html', reason: 'gone already'}]}));
    const entries = readExpected(file);
    const d = (id, p) => ({id, path: p});
    const {accepted, unexpected, stale} = applyExpected(entries, [
      d('math-exercise/examples.html#11:ex-custom-monotonicity|single|response:3', 'math-exercise/examples.html'),
      d('math-exercise/examples.html#12:other|single|response:0', 'math-exercise/examples.html'),
      d('authored:math-exercise:examples.qmd#q', 'math-exercise/examples.qmd')]);
    assert.deepEqual(accepted.map(a => a.reason), ['new feedback text', 'test edited']);
    assert.deepEqual(unexpected.map(u => u.id), ['math-exercise/examples.html#12:other|single|response:0']);
    assert.deepEqual(stale.map(s => s.reason), ['gone already'], 'a required entry that matches nothing fails; optional ones do not');
    fs.writeFileSync(file, JSON.stringify({differences: [{case: 'x'}]}));
    assert.throws(() => readExpected(file), /needs a reason/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a case without a result, a timeout or a harness error makes a run incomplete, also when both runs share it', () => {
  const {inventory, coverage} = require('../integration/pyodide-parity/run.cjs');
  const job = {cases: [{id: 'p#0:a|single|response:0', page: 'p', position: 0}, {id: 'p#0:a|single|response:1', page: 'p', position: 0},
    {id: 'p#1:b|single|response:0', page: 'p', position: 1}], authored: [{name: 't', files: ['x.qmd']}], python: null,
  cells: [{page: 'p', position: 0, label: 'a', mode: 'custom', keyless: true, diagram: false, corpus: 'c'},
    {page: 'p', position: 1, label: 'b', mode: 'equivalent', keyless: false, diagram: false, corpus: 'c'}]};
  const records = new Map([
    ['p#0:a|single|response:0', {results: [{status: 'correct', score: 1}]}],
    ['p#0:a|single|response:1', {results: [{status: 'wrong', score: 0}, {status: 'harness-error', detail: 'no dynamic matrix Z'}]}],
    ['authored:all', {results: [{status: 'done'}]}], ['authored:t:x.qmd#q', {results: [{status: 'pass'}]}]]);
  const {ids, incomplete} = inventory(job, records);
  assert.ok(ids.has('authored:t:x.qmd#q'));
  assert.deepEqual(incomplete.map(i => i.id), ['p#0:a|single|response:1', 'p#1:b|single|response:0']);
  assert.match(incomplete[0].why, /^harness-error: no dynamic matrix Z/);
  assert.deepEqual(inventory({...job, cases: []}, new Map()).incomplete.map(i => i.id), ['authored:all']);
  const covered = coverage(job, records);
  assert.equal(covered.cells.length, 1, 'only cells with custom checkers, without keys or with a diagram');
  assert.deepEqual(covered.cells[0].verdicts, ['correct', 'harness-error', 'wrong']);
  assert.deepEqual(covered.byCorpus.c, {cells: 1, labels: 1, graded: 1, correct: 1, partial: 0, wrong: 1});
});
