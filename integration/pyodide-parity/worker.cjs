// One run of the harness (a child process of run.cjs): one Pyodide version
// grades a case list and writes one JSON line per case to the results file.
//   node worker.cjs <version> <job.json> <results.jsonl>
// Cases already in the results file are skipped, so run.cjs can restart a
// worker after a case that does not finish (it records that case itself).
// With job.capture, each line also holds the grading calls at the runtime
// boundary (request values and the returned JSON text); with
// job.responsesOnly, only the authored tests run (to learn their responses).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {boot, recording} = require('./runtime.cjs');
const {openPage, prepare, fieldsOf, variantKey} = require('./cases.cjs');

const [version, jobFile, resultsFile] = process.argv.slice(2);
const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
const done = new Set(fs.existsSync(resultsFile)
  ? fs.readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line).id) : []);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function write(record) {
  fs.appendFileSync(resultsFile, JSON.stringify(record) + '\n');
}
function plain(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value, (key, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)));
}
// The grading outcome of one call: status and score decide; the rest is reported.
function outcome(result) {
  if (typeof result === 'string') { try { result = JSON.parse(result); } catch (_) { return {status: 'unparsed', text: result}; } }
  if (!result || typeof result !== 'object') return {status: String(result)};
  const {status, score, ...rest} = result;
  return {status: status ?? null, score: typeof score === 'number' ? score : (score ?? null), detail: plain(rest)};
}
// A recorded call's outcome; a raised error is an outcome too.
const callOutcome = call => ('raised' in call ? {status: 'raised', detail: call.raised} : outcome(call.text));
// Request values as JSON: numbers that JSON cannot hold are tagged.
const requestValue = value => (typeof value === 'number' && !Number.isFinite(value) ? {$float: String(value)} : value);
const captured = calls => calls.map(c => ({call: c.call, input: Object.fromEntries(Object.entries(c.input).map(([k, v]) => [k, requestValue(v)])),
  ...('raised' in c ? {raised: c.raised} : {text: c.text})}));

// A diagram cell asks its JSXGraph frame for the response (math-exercise.js
// requestExternalResponse): the frame here answers with the case's payload.
function answerFor(w, cell, payload) {
  const id = (cell.dataset.response || '').replace(/^jsxgraph:/, '').trim();
  let frame = w.document.getElementById(id);
  if (!frame || frame.tagName !== 'IFRAME' || !frame.contentWindow) {
    const replacement = w.document.createElement('iframe');
    replacement.id = id;
    (frame ? frame.replaceWith(replacement) : w.document.body.append(replacement));
    frame = replacement;
  }
  const target = frame.contentWindow;
  target.postMessage = message => {
    if (!message || message.type !== 'request') return;
    w.setTimeout(() => w.dispatchEvent(new w.MessageEvent('message', {source: target, data: {
      protocol: message.protocol, version: message.version, type: 'response', requestId: message.requestId,
      assessmentId: message.assessmentId, payload, ai: null}})), 0);
  };
}

async function mathCases(py) {
  const byPage = new Map();
  for (const c of job.cases) if (!done.has(c.id)) (byPage.get(c.page) || byPage.set(c.page, []).get(c.page)).push(c);
  for (const [relative, cases] of byPage) {
    const calls = [];
    const {w, api} = openPage(path.join(job.pages[relative].root, job.pages[relative].file), 'http://localhost/' + relative.split(path.sep).join('/'), recording(py, calls));
    const cells = [...w.document.querySelectorAll('.math-exercise-cell')];
    const pristine = cells.map(cell => cell.outerHTML);
    const slots = [...cells];
    let current = null;
    try {
      for (const c of cases) {
        process.stdout.write('case ' + c.id + '\n');
        const key = c.position + '|' + c.variantKey;
        if (!current || current.key !== key) {
          // A fresh copy of the cell for this variant (the cell's own state starts clean).
          const variant = {kind: c.variant.kind, id: c.variant.id, index: c.variant.index};
          slots[c.position] = prepare(w, api, slots[c.position], pristine[c.position], c.label, variant);
          current = {key, cell: slots[c.position]};
          if (variantKey(variant) !== c.variantKey) throw new Error('variant mismatch ' + c.id);
        }
        const cell = current.cell;
        const started = Date.now();
        calls.length = 0;
        let results, feedback = [];
        try {
          if (c.kind === 'fixture') {
            // The fixture's verdicts as the review page reads them (an empty answer is graded without Python).
            const record = JSON.parse(cell.dataset.variants).variants[c.variant.index];
            results = (await cell.mathExercise.checkFixture(record, record.tests[c.fixture])).map(outcome);
          } else {
            if ('payload' in c) answerFor(w, cell, c.payload);
            else if (c.matrices) {
              // Dynamic matrices take their shape and entries (the page then
              // refreshes its fields); the other fields take the values.
              for (const [name, value] of Object.entries(c.matrices)) {
                const matrix = [...cell.querySelectorAll('.math-dynamic-mat')].find(el => el.dataset.matrixName === name);
                if (!matrix || !matrix.parentElement.matrixInput) throw new Error('no dynamic matrix ' + name);
                matrix.parentElement.matrixInput.write({type: 'matrix', rows: value.rows, cols: value.cols, raw: value.raw});
              }
              fieldsOf(w, cell).filter(el => el && !el.closest('.math-dynamic-matrix-wrap')).forEach((el, i) => { el.value = c.values[i] ?? ''; });
            } else fieldsOf(w, cell).forEach((el, i) => { if (el) el.value = c.values[i]; });
            const check = cell.querySelector('.math-check-btn');
            check.click();
            while (check.disabled) await pause(2);
            results = calls.map(callOutcome);
            feedback = [...cell.querySelectorAll('.math-feedback-area [class^="math-fb-"]')].map(e => e.className + ': ' + e.textContent.trim());
          }
          write({id: c.id, results, feedback, ms: Date.now() - started, ...(job.capture ? {calls: captured(calls)} : {})});
        } catch (error) {
          write({id: c.id, results: [...calls.map(callOutcome), {status: 'harness-error', detail: String(error && error.message || error)}], feedback,
            ms: Date.now() - started, ...(job.capture ? {calls: captured(calls)} : {})});
        }
      }
    } finally { w.close(); }
  }
}

// question-tests.py, run in Pyodide on the authored tests of a source tree,
// each question through authored_record.py (the recorder ctm-checkers imports
// as well): every check() call of the tests is recorded with its result and
// with the response it was given, as the page would send it. Each question
// comes back as canonical JSON written by Python (sorted keys, compact), so
// numbers keep Python's spelling.
const AUTHORED = String.raw`
import importlib.util, json, os, runpy
from pathlib import Path
_qt = runpy.run_path('/ctm-parity/question-tests.py')
_spec = importlib.util.spec_from_file_location('_ctm_parity_authored_record', '/ctm-parity/authored_record.py')
_ar = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ar)
def _ctm_authored(root, files):
    os.chdir(root)
    runtime = _qt['runtime_namespace']()
    run = lambda options, base: _qt['run_question'](options, runtime, Path(base))
    found = []
    for name in files:
        for options in _qt['authored_questions'](Path(root) / name):
            if not options.get('tests', '').strip():
                continue
            record = dict(_ar.record(run, options, root), file=name, label=options.get('label', ''), options=options)
            found.append(json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(',', ':')))
    return json.dumps(found)
`;

async function authoredCases(py) {
  if (!job.authored.length || done.has('authored:all')) return;
  process.stdout.write('case authored:all\n');
  py.FS.mkdirTree('/ctm-parity');
  for (const name of ['question-tests.py', 'math-exercise.js']) py.FS.writeFile('/ctm-parity/' + name, fs.readFileSync(path.join(job.mathExtension, name)));
  py.FS.writeFile('/ctm-parity/authored_record.py', fs.readFileSync(path.join(__dirname, 'authored_record.py')));
  await py.loadPackage('sympy');
  await py.loadPackage('networkx');
  py.runPython(AUTHORED);
  const found = [];
  job.authored.forEach((tree, i) => {
    const mount = '/ctm-parity/src' + i;
    py.FS.mkdirTree(mount);
    py.FS.mount(py.FS.filesystems.NODEFS, {root: tree.root}, mount);
    for (const text of JSON.parse(py.globals.get('_ctm_authored')(mount, py.toPy(tree.files)))) found.push({text, record: JSON.parse(text), tree: tree.name});
  });
  for (const {text, record, tree} of found) {
    write({id: `authored:${tree}:${record.file}#${record.label}`, results: [{status: record.outcome}, ...(record.calls || []).map(outcome)], feedback: [],
      responses: record.responses, ...(job.capture ? {authored: text} : {})});
  }
  write({id: 'authored:all', results: [{status: 'done', score: found.length}], feedback: []});
}

// The umbrella's Python programs, graded by py-exercise's MODULE_PY.
async function pythonCases(py) {
  if (!job.python || done.has('python:all')) return;
  process.stdout.write('case python:all\n');
  const {RUN} = require('../../tests/python-examples.cases.cjs');
  py.globals.set('_ctm_job', JSON.stringify(job.python.input));
  const verdicts = JSON.parse(await py.runPythonAsync(RUN.replace('job = json.load(sys.stdin)', 'job = json.loads(_ctm_job)')
    .replace('print(json.dumps(verdicts))', 'json.dumps(verdicts)')));
  job.python.cases.forEach((c, i) => write({id: `python:${c.label}:${c.name}`, results: [{status: verdicts[i]}], feedback: [], expected: c.expected}));
  write({id: 'python:all', results: [{status: 'done', score: verdicts.length}], feedback: []});
}

(async () => {
  const {py, python} = await boot(version, job.wheels[version], job.hashSeed || 0);
  await py.loadPackage('sympy');
  const sympy = py.runPython('import sympy; sympy.__version__');
  process.stdout.write(`ready Pyodide ${version} (Python ${python}, SymPy ${sympy}, PYTHONHASHSEED ${job.hashSeed || 0})\n`);
  if (!job.responsesOnly) await pythonCases(py);
  await authoredCases(py);
  if (!job.responsesOnly) await mathCases(py);
  process.stdout.write('finished\n');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
