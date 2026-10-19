// One Pyodide version (a child process of run.cjs): grades a case list and
// writes one JSON line per case to the results file.
//   node worker.cjs <version> <job.json> <results.jsonl>
// Cases already in the results file are skipped, so run.cjs can restart a
// worker after a case that does not finish (it records that case itself).
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
            const record = JSON.parse(cell.dataset.variants).variants[c.variant.index];
            results = (await cell.mathExercise.checkFixture(record, record.tests[c.fixture])).map(outcome);
          } else {
            const fields = fieldsOf(w, cell);
            fields.forEach((el, i) => { if (el) el.value = c.values[i]; });
            const check = cell.querySelector('.math-check-btn');
            check.click();
            while (check.disabled) await pause(2);
            results = calls.map(outcome);
            feedback = [...cell.querySelectorAll('.math-feedback-area [class^="math-fb-"]')].map(e => e.className + ': ' + e.textContent.trim());
          }
          write({id: c.id, results, feedback, ms: Date.now() - started});
        } catch (error) {
          write({id: c.id, results: [{status: 'harness-error', detail: String(error && error.message || error)}], feedback, ms: Date.now() - started});
        }
      }
    } finally { w.close(); }
  }
}

// question-tests.py, run in Pyodide on the authored tests of a source tree:
// every check() call of the tests is recorded with its result.
const AUTHORED = String.raw`
import json, os, runpy
from pathlib import Path
_qt = runpy.run_path('/ctm-parity/question-tests.py')
_WRAP = '''
_ctm_parity_check = check
def check(*args, **kwargs):
    result = _ctm_parity_check(*args, **kwargs)
    _ctm_parity_calls.append(result)
    return result
'''
def _ctm_plain(value):
    if isinstance(value, dict):
        return {str(k): _ctm_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_ctm_plain(v) for v in value]
    if isinstance(value, (bool, str)) or value is None:
        return value
    try:
        return float(value) if not isinstance(value, int) else value
    except Exception:
        return repr(value)
def _ctm_authored(root, files):
    os.chdir(root)
    runtime = _qt['runtime_namespace']()
    found = []
    for name in files:
        for options in _qt['authored_questions'](Path(root) / name):
            if not options.get('tests', '').strip():
                continue
            calls = []
            runtime['_ctm_parity_calls'] = calls
            options = dict(options, checker=options.get('checker', '') + _WRAP)
            try:
                _qt['run_question'](options, runtime, Path(root))
                result = 'pass'
            except AssertionError as error:
                result = 'assertion failed: ' + str(error)
            except Exception as error:
                result = 'error: ' + type(error).__name__ + ': ' + str(error)
            found.append({'file': name, 'label': options.get('label', ''), 'outcome': result, 'calls': _ctm_plain(calls)})
    return json.dumps(found)
`;

async function authoredCases(py) {
  if (!job.authored.length || done.has('authored:all')) return;
  process.stdout.write('case authored:all\n');
  py.FS.mkdirTree('/ctm-parity');
  for (const name of ['question-tests.py', 'math-exercise.js']) py.FS.writeFile('/ctm-parity/' + name, fs.readFileSync(path.join(job.mathExtension, name)));
  await py.loadPackage('sympy');
  await py.loadPackage('networkx');
  py.runPython(AUTHORED);
  const found = [];
  job.authored.forEach((tree, i) => {
    const mount = '/ctm-parity/src' + i;
    py.FS.mkdirTree(mount);
    py.FS.mount(py.FS.filesystems.NODEFS, {root: tree.root}, mount);
    const results = JSON.parse(py.globals.get('_ctm_authored')(mount, py.toPy(tree.files)));
    for (const r of results) found.push({...r, tree: tree.name});
  });
  for (const r of found) {
    const calls = (r.calls || []).map(outcome);
    write({id: `authored:${r.tree}:${r.file}#${r.label}`, results: [{status: r.outcome}, ...calls], feedback: []});
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
  const {py, python} = await boot(version, job.wheels[version]);
  await py.loadPackage('sympy');
  const sympy = py.runPython('import sympy; sympy.__version__');
  process.stdout.write(`ready Pyodide ${version} (Python ${python}, SymPy ${sympy})\n`);
  await pythonCases(py);
  await authoredCases(py);
  await mathCases(py);
  process.stdout.write('finished\n');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
