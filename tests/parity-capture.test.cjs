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
  const py = {globals: {set: (name, value) => set.push([name, value]), get: name => name},
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
