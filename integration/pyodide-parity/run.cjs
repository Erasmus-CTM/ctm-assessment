#!/usr/bin/env node
// Pyodide parity harness, the gate for a Pyodide upgrade (design D4, §13 A6):
// every math-exercise of the given rendered sites, every variant, graded with
// the page's own math-exercise.js in jsdom under each Pyodide version (Node
// builds of Pyodide; SymPy, mpmath and NetworkX from each version's verified
// wheels): the answer keys, perturbations of each key, the October 2026
// audit's challenge answers and the generated variants' fixtures; the authored
// question tests of the given source trees (question-tests.py in Pyodide); and
// the umbrella's Python programs (py-exercise's MODULE_PY). Any difference in
// status or score between the versions fails the run.
//
//   node integration/pyodide-parity/run.cjs --site umbrella=.feedback-workspace/site/_site \
//     [--site NAME=SITE_DIR ...] [--sources NAME=SOURCE_DIR ...] [--python ROOT] \
//     --extensions .feedback-workspace/site/_extensions --out DIR [--versions 0.27.2,0.28.3]
//
// PYODIDE_PARITY_CACHE: wheel cache (default DIR/wheels); PYODIDE_PARITY_WHEELS:
// a local folder <dir>/<version>/<wheel> instead of jsDelivr (hashes are checked either way).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {ensureWheels} = require('./wheels.cjs');
const {pageCases, pagesUnder, authoredSources} = require('./cases.cjs');

function parse(argv) {
  const options = {site: [], sources: [], versions: ['0.27.2', '0.28.3'], timeout: 240, python: null, extensions: null, out: null};
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--site' || flag === '--sources') { options[flag.slice(2)].push(value); i++; }
    else if (flag === '--versions') { options.versions = value.split(','); i++; }
    else if (['--python', '--extensions', '--out', '--timeout'].includes(flag)) { options[flag.slice(2)] = flag === '--timeout' ? Number(value) : value; i++; }
    else throw new Error('Unknown option ' + flag);
  }
  if (!options.out || !options.extensions || options.versions.length !== 2) throw new Error('Usage: see the header of run.cjs');
  const pairs = list => list.map(entry => { const [name, dir] = entry.split('='); return {name, root: path.resolve(dir)}; });
  return {...options, site: pairs(options.site), sources: pairs(options.sources)};
}

// Runs one version's worker; restarts it after a case that does not finish.
function grade(version, jobFile, results, timeout, log) {
  return new Promise((resolve, reject) => {
    let restarts = 0;
    const start = () => {
      const child = spawn(process.execPath, [path.join(__dirname, 'worker.cjs'), version, jobFile, results], {stdio: ['ignore', 'pipe', 'pipe']});
      let current = null, last = Date.now(), buffer = '', stderr = '';
      const timer = setInterval(() => {
        if (Date.now() - last < timeout * 1000) return;
        clearInterval(timer);
        child.kill('SIGKILL');
        if (current) fs.appendFileSync(results, JSON.stringify({id: current, results: [{status: 'timeout', detail: `no result within ${timeout} s`}], feedback: []}) + '\n');
        log(`${version}: ${current || 'start-up'} did not finish within ${timeout} s; restarting`);
        if (++restarts > 25) reject(new Error(version + ': too many restarts'));
        else start();
      }, 1000);
      child.stdout.on('data', chunk => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          last = Date.now();
          if (line.startsWith('case ')) current = line.slice(5);
          else log(`${version}: ${line}`);
        }
      });
      child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 20000) stderr = stderr.slice(-20000); });
      child.on('exit', code => {
        if (child.killed) return;
        clearInterval(timer);
        if (code === 0) resolve();
        else reject(new Error(`${version}: worker exited with ${code}\n${stderr}`));
      });
    };
    start();
  });
}

// The page's exercises as rendered (render noise such as JSXGraph's random board names removed).
function exercisesSignature(file) {
  const {JSDOM} = require('jsdom');
  const doc = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
  const cells = [...doc.querySelectorAll('.math-exercise-cell')].map(cell => cell.outerHTML.replace(/JXG[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{8}/g, 'JXG'));
  return require('node:crypto').createHash('sha256').update(cells.join('\n')).digest('hex');
}

const sameScore = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-12);

function compare(cases, versions, results) {
  const [before, after] = versions.map(v => results[v]);
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  const differences = [], notes = [];
  for (const id of ids) {
    const a = before.get(id), b = after.get(id);
    if (!a || !b) { differences.push({id, why: 'result missing for ' + (a ? versions[1] : versions[0])}); continue; }
    const graded = r => r.results.map(x => ({status: x.status, score: x.score ?? null}));
    const ga = graded(a), gb = graded(b);
    const same = ga.length === gb.length && ga.every((x, i) => x.status === gb[i].status && sameScore(x.score, gb[i].score));
    if (!same) differences.push({id, case: cases.get(id) || null, [versions[0]]: a.results, [versions[1]]: b.results});
    else if (JSON.stringify(a.results) !== JSON.stringify(b.results) || JSON.stringify(a.feedback) !== JSON.stringify(b.feedback))
      notes.push({id, [versions[0]]: {results: a.results, feedback: a.feedback}, [versions[1]]: {results: b.results, feedback: b.feedback}});
  }
  return {differences, notes};
}

function read(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    map.set(record.id, record);   // a later line (after a restart) wins
  }
  return map;
}

(async () => {
  const options = parse(process.argv.slice(2));
  const out = path.resolve(options.out);
  fs.mkdirSync(out, {recursive: true});
  const log = line => console.log(line);
  const cache = process.env.PYODIDE_PARITY_CACHE || path.join(out, 'wheels');
  const wheels = {};
  for (const version of options.versions) wheels[version] = await ensureWheels(version, cache);
  // Phase 1: the cases, from the pages and sources (the same list for both versions).
  const job = {wheels, pages: {}, cases: [], skipped: [], authored: [], python: null,
    mathExtension: path.join(path.resolve(options.extensions), 'math-exercise')};
  // A page whose exercises are those of a page already included (a second
  // build of a course, such as a review profile that renders every page) is
  // graded once.
  const seen = new Map();
  job.duplicates = [];
  for (const site of options.site) {
    for (const file of pagesUnder(site.root)) {
      const relative = site.name + '/' + file.split(path.sep).join('/');
      const signature = exercisesSignature(path.join(site.root, file));
      if (seen.has(signature)) { job.duplicates.push({page: relative, same: seen.get(signature)}); continue; }
      seen.set(signature, relative);
      job.pages[relative] = {root: site.root, file};
      const {cases, skipped} = pageCases(path.join(site.root, file), relative);
      job.cases.push(...cases); job.skipped.push(...skipped);
    }
  }
  for (const tree of options.sources) job.authored.push({name: tree.name, root: tree.root, files: authoredSources(tree.root)});
  if (options.python) {
    const {cases, browserPython} = require('../../tests/python-examples.cases.cjs');
    const list = cases(path.resolve(options.python)).list;
    const source = fs.readFileSync(path.join(path.resolve(options.extensions), 'py-exercise', 'py-exercise.js'), 'utf8');
    job.python = {cases: list.map(({label, name, expected}) => ({label, name, expected})),
      input: {module: browserPython(source, 'MODULE_PY'), cases: list.map(({code, tests, forbiddenImports, forbiddenKeywords}) => ({code, tests, forbiddenImports, forbiddenKeywords}))}};
  }
  const jobFile = path.join(out, 'job.json');
  fs.writeFileSync(jobFile, JSON.stringify(job));
  const count = kind => job.cases.filter(c => c.kind === kind).length;
  log(`Cases: ${count('response')} responses and ${count('fixture')} fixtures in ${Object.keys(job.pages).length} pages `
    + `(${job.duplicates.length} pages with the same exercises as a page above not repeated); `
    + `${job.authored.reduce((n, t) => n + t.files.length, 0)} source files with authored tests; ${job.python ? job.python.cases.length : 0} Python programs; `
    + `${job.skipped.length} cells or variants without gradable fields`);
  // Phase 2: both versions, in parallel processes.
  const resultFiles = Object.fromEntries(options.versions.map(v => [v, path.join(out, `results-${v}.jsonl`)]));
  const started = Date.now();
  await Promise.all(options.versions.map(v => grade(v, jobFile, resultFiles[v], options.timeout, log)));
  const results = Object.fromEntries(options.versions.map(v => [v, read(resultFiles[v])]));
  const byId = new Map(job.cases.map(c => [c.id, c]));
  const {differences, notes} = compare(byId, options.versions, results);
  // Summary.
  const last = results[options.versions[1]];
  const kindOf = id => id.startsWith('authored:') ? 'authored tests' : id.startsWith('python:') ? 'Python programs' : (byId.get(id)?.kind === 'fixture' ? 'fixtures' : 'responses');
  const statuses = {};
  for (const [id, record] of last) {
    if (id.endsWith(':all')) continue;
    const kind = kindOf(id), status = kind === 'responses' || kind === 'fixtures' ? record.results.map(r => r.status).sort().filter((s, i, a) => a.indexOf(s) === i).join('+') : record.results[0].status.split(':')[0];
    (statuses[kind] ||= {})[status] = (statuses[kind][status] || 0) + 1;
  }
  const keysNotCorrect = job.cases.filter(c => c.source === 'keys' && !(last.get(c.id)?.results || []).every(r => r.status === 'correct')).map(c => c.id);
  const fixtureMismatch = job.cases.filter(c => c.kind === 'fixture').map(c => ({c, got: options.versions.map(v => (results[v].get(c.id)?.results || []).map(r => r.status))}))
    .filter(({c, got}) => got.some(statusList => JSON.stringify(statusList) !== JSON.stringify(c.expected))).map(({c, got}) => ({id: c.id, expected: c.expected, got}));
  const pythonExpectations = job.python ? job.python.cases.map(c => ({c, got: options.versions.map(v => results[v].get(`python:${c.label}:${c.name}`)?.results[0].status)}))
    .filter(({c, got}) => got.some(status => status !== c.expected)) : [];
  const authored = [...last.keys()].filter(id => id.startsWith('authored:') && id !== 'authored:all');
  const authoredFailing = authored.filter(id => last.get(id).results[0].status !== 'pass');
  const timeouts = options.versions.map(v => [...results[v].values()].filter(r => r.results.some(x => x.status === 'timeout')).length);
  const summary = {versions: options.versions, minutes: Math.round((Date.now() - started) / 600) / 100,
    sites: options.site.map(s => s.name), sources: options.sources.map(s => s.name),
    pages: Object.keys(job.pages).length, duplicatePages: job.duplicates.length, cells: new Set(job.cases.map(c => c.page + '#' + c.position)).size,
    variants: new Set(job.cases.map(c => c.page + '#' + c.position + '|' + c.variantKey)).size,
    responses: count('response'), fixtures: count('fixture'), authoredTests: authored.length, authoredNotPassing: authoredFailing.length,
    pythonPrograms: job.python ? job.python.cases.length : 0, pythonUnexpected: pythonExpectations.length,
    skipped: job.skipped.length, timeouts: Object.fromEntries(options.versions.map((v, i) => [v, timeouts[i]])),
    statuses, keysNotCorrect: keysNotCorrect.length, fixturesUnexpected: fixtureMismatch.length, differences: differences.length, notes: notes.length};
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({summary, differences, notes, skipped: job.skipped, duplicates: job.duplicates, keysNotCorrect, fixtureMismatch,
    authoredNotPassing: authoredFailing.map(id => ({id, outcome: last.get(id).results[0].status})), pythonUnexpected: pythonExpectations}, null, 1));
  const md = [`## Pyodide parity: ${options.versions[0]} vs ${options.versions[1]}`, '',
    `${summary.pages} pages (and ${summary.duplicatePages} with the same exercises), ${summary.cells} exercises, ${summary.variants} exercise variants: ${summary.responses} graded responses and ${summary.fixtures} variant fixtures; `
    + `${summary.authoredTests} authored question tests; ${summary.pythonPrograms} Python programs. ${summary.minutes} min.`, '',
    `**Differences in status or score: ${differences.length}.** Other differences (messages, feedback text): ${notes.length}. `
    + `Timeouts: ${options.versions.map(v => v + ' ' + summary.timeouts[v]).join(', ')}.`, '',
    ...Object.entries(statuses).map(([kind, counts]) => `- ${kind} (${options.versions[1]}): ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ')}`), '',
    `Authored tests not passing: ${authoredFailing.length}. Variant fixtures graded unlike their expectation: ${fixtureMismatch.length}. `
    + `Python programs graded unlike their expectation: ${pythonExpectations.length}. Answer keys not graded correct (generated variants whose checker `
    + `decides, or keys that are examples): ${keysNotCorrect.length}. Cells or variants without gradable fields (responses from a diagram, custom checkers `
    + `without keys; their authored tests run above): ${summary.skipped}.`];
  for (const d of differences.slice(0, 50)) md.push('', '- `' + d.id + '`: ' + JSON.stringify(d).slice(0, 600));
  fs.writeFileSync(path.join(out, 'report.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  process.exit(differences.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(2); });
