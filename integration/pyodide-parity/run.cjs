#!/usr/bin/env node
// Pyodide parity harness, the gate for a Pyodide upgrade (design D4, §13 A6),
// the build comparison of step 2 (L2, design step 2 §6.1) and the golden
// capture for ctm-checkers (step 2 §6.2-6.4, §13): every math-exercise of the
// given rendered sites, every variant, graded with the page's own
// math-exercise.js in jsdom (Node builds of Pyodide; SymPy, mpmath and
// NetworkX from each version's verified wheels): the answer keys,
// perturbations of each key, the October 2026 audit's challenge answers, the
// generated variants' fixtures, and for cells without keys or with a diagram
// response probes and the responses of their authored tests (cases.cjs); the
// authored question tests of the given source trees (question-tests.py in
// Pyodide); and the umbrella's Python programs (py-exercise's MODULE_PY).
//
// Two runs are compared:
// - versions (default): the same sites under two Pyodide versions; any
//   difference in status or score fails, other differences are reported.
// - --builds base=DIR,head=DIR: two builds of the same sites (site, source and
//   extension paths are relative to each build's DIR) under one Pyodide
//   version; the case lists must be identical, and any difference (status,
//   score, details, feedback text) fails.
//
//   node integration/pyodide-parity/run.cjs --site umbrella=.feedback-workspace/site/_site \
//     [--site NAME=SITE_DIR ...] [--sources NAME=SOURCE_DIR ...] [--python ROOT] \
//     --extensions .feedback-workspace/site/_extensions --out DIR \
//     [--versions 0.27.2,0.28.3 | --builds base=DIR,head=DIR [--versions 0.28.3]] [--capture DIR]
//
// A site belongs to the corpus (corpora.json) of the source tree of the same
// name, or whose name it starts with (ctm-demo-review: ctm-demo).
// --capture DIR writes the golden suites (capture.cjs), split by provenance.
// PYODIDE_PARITY_CACHE: wheel cache (default DIR/wheels); PYODIDE_PARITY_WHEELS:
// a local folder <dir>/<version>/<wheel> instead of jsDelivr (hashes are checked either way).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const {isDeepStrictEqual} = require('node:util');
const {ensureWheels} = require('./wheels.cjs');
const {pageCases, pagesUnder, authoredSources} = require('./cases.cjs');
const capture = require('./capture.cjs');

function parse(argv) {
  const options = {site: [], sources: [], versions: null, builds: null, timeout: 240, python: null, extensions: null, out: null, capture: null};
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--site' || flag === '--sources') { options[flag.slice(2)].push(value); i++; }
    else if (flag === '--versions') { options.versions = value.split(','); i++; }
    else if (flag === '--builds') { options.builds = value.split(',').map(entry => { const [name, dir] = entry.split('='); return {name, root: path.resolve(dir)}; }); i++; }
    else if (['--python', '--extensions', '--out', '--timeout', '--capture'].includes(flag)) { options[flag.slice(2)] = flag === '--timeout' ? Number(value) : value; i++; }
    else throw new Error('Unknown option ' + flag);
  }
  if (options.builds) {
    options.versions ||= ['0.28.3'];
    if (options.builds.length !== 2 || options.versions.length !== 1 || options.builds.some(b => !b.name || !b.root))
      throw new Error('--builds takes two builds, base=DIR,head=DIR, and one Pyodide version');
  } else options.versions ||= ['0.27.2', '0.28.3'];
  if (!options.out || !options.extensions || (!options.builds && options.versions.length !== 2)) throw new Error('Usage: see the header of run.cjs');
  const pairs = list => list.map(entry => { const [name, dir] = entry.split('='); return {name, dir}; });
  return {...options, site: pairs(options.site), sources: pairs(options.sources)};
}

// The runs: two Pyodide versions over one build, or two builds under one version.
function runsOf(options) {
  if (options.builds) return options.builds.map(b => ({name: b.name, version: options.versions[0], root: b.root}));
  return options.versions.map(v => ({name: v, version: v, root: process.cwd()}));
}
// A path of a run, links resolved (Pyodide's NODEFS mounts real folders only).
const at = (run, dir) => { const full = path.resolve(run.root, dir); return fs.existsSync(full) ? fs.realpathSync(full) : full; };

// The runtimes as the workers report them: "Pyodide <v> (Python <v>, SymPy <v>)".
const runtimes = {};

// Runs one worker; restarts it after a case that does not finish.
function grade(run, jobFile, results, timeout, log) {
  return new Promise((resolve, reject) => {
    let restarts = 0;
    const start = () => {
      const child = spawn(process.execPath, [path.join(__dirname, 'worker.cjs'), run.version, jobFile, results], {stdio: ['ignore', 'pipe', 'pipe']});
      let current = null, last = Date.now(), buffer = '', stderr = '';
      const timer = setInterval(() => {
        if (Date.now() - last < timeout * 1000) return;
        clearInterval(timer);
        child.kill('SIGKILL');
        if (current) fs.appendFileSync(results, JSON.stringify({id: current, results: [{status: 'timeout', detail: `no result within ${timeout} s`}], feedback: []}) + '\n');
        log(`${run.name}: ${current || 'start-up'} did not finish within ${timeout} s; restarting`);
        if (++restarts > 25) reject(new Error(run.name + ': too many restarts'));
        else start();
      }, 1000);
      child.stdout.on('data', chunk => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          last = Date.now();
          if (line.startsWith('case ')) current = line.slice(5);
          else {
            if (line.startsWith('ready ')) runtimes[run.name] = line.slice(6);
            log(`${run.name}: ${line}`);
          }
        }
      });
      child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 20000) stderr = stderr.slice(-20000); });
      child.on('exit', code => {
        if (child.killed) return;
        clearInterval(timer);
        if (code === 0) resolve();
        else reject(new Error(`${run.name}: worker exited with ${code}\n${stderr}`));
      });
    };
    start();
  });
}

// What a page's cases grade: exercises, variants, responses and fixtures.
function casesSignature(cases) {
  const content = cases.map(c => [c.position, c.label, c.variantKey, c.kind, c.values, c.payload, c.fixture]);
  return require('node:crypto').createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

const sameScore = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-12);

// Versions: status and score decide; other differences are notes. Builds
// (strict): any difference in results (status, score, details) or feedback.
function compare(cases, runs, results, strict) {
  const [before, after] = runs.map(r => results[r.name]);
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  const differences = [], notes = [];
  for (const id of ids) {
    const a = before.get(id), b = after.get(id);
    if (!a || !b) { differences.push({id, why: 'result missing for ' + (a ? runs[1].name : runs[0].name)}); continue; }
    const graded = r => r.results.map(x => ({status: x.status, score: x.score ?? null}));
    const ga = graded(a), gb = graded(b);
    const same = ga.length === gb.length && ga.every((x, i) => x.status === gb[i].status && sameScore(x.score, gb[i].score));
    const identical = isDeepStrictEqual(a.results, b.results) && isDeepStrictEqual(a.feedback, b.feedback) && isDeepStrictEqual(a.responses, b.responses);
    const entry = {id, case: cases.get(id) || null, [runs[0].name]: {results: a.results, feedback: a.feedback}, [runs[1].name]: {results: b.results, feedback: b.feedback}};
    if (!same || (strict && !identical)) differences.push(entry);
    else if (!identical) notes.push(entry);
  }
  return {differences, notes};
}

function read(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    map.set(record.id, record);   // a later line (after a restart) wins
  }
  return map;
}

// The corpus of a site: the source tree of that name, or the longest whose name the site's starts with.
function corpusOf(site, sources, corpora) {
  const names = [...new Set([...sources.map(s => s.name), ...Object.keys(corpora)])];
  if (names.includes(site)) return site;
  return names.filter(name => site.startsWith(name + '-')).sort((a, b) => b.length - a.length)[0] || site;
}
function commitOf(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch (_) { return null; }
}

// The cases of one build: its pages (a page whose cases are those of a page
// already included, such as a second build of a course, is graded once).
function buildJob(run, options, wheels, authoredResponses, corpora) {
  const job = {wheels, pages: {}, cases: [], skipped: [], authored: [], python: null, duplicates: [],
    mathExtension: path.join(at(run, options.extensions), 'math-exercise'), capture: Boolean(options.capture)};
  const seen = new Map();
  for (const site of options.site) {
    const root = at(run, site.dir), corpus = corpusOf(site.name, options.sources, corpora);
    for (const file of pagesUnder(root)) {
      const relative = site.name + '/' + file.split(path.sep).join('/');
      const {cases, skipped} = pageCases(path.join(root, file), relative, authoredResponses[corpus] || {});
      const signature = casesSignature(cases);
      if (cases.length && seen.has(signature)) { job.duplicates.push({page: relative, same: seen.get(signature)}); continue; }
      if (cases.length) seen.set(signature, relative);
      job.pages[relative] = {root, file};
      job.cases.push(...cases.map(c => ({...c, corpus}))); job.skipped.push(...skipped);
    }
  }
  for (const tree of options.sources) {
    const root = at(run, tree.dir);
    job.authored.push({name: tree.name, root, files: authoredSources(root)});
  }
  if (options.python) {
    const {cases, browserPython} = require('../../tests/python-examples.cases.cjs');
    const list = cases(at(run, options.python)).list;
    const source = fs.readFileSync(path.join(at(run, options.extensions), 'py-exercise', 'py-exercise.js'), 'utf8');
    job.python = {cases: list.map(({label, name, expected}) => ({label, name, expected})),
      input: {module: browserPython(source, 'MODULE_PY'), cases: list.map(({code, tests, forbiddenImports, forbiddenKeywords}) => ({code, tests, forbiddenImports, forbiddenKeywords}))}};
  }
  return job;
}

(async () => {
  const options = parse(process.argv.slice(2));
  const out = path.resolve(options.out);
  fs.mkdirSync(out, {recursive: true});
  const log = line => console.log(line);
  const runs = runsOf(options), strict = Boolean(options.builds);
  const corpora = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpora.json'), 'utf8')).corpora;
  const cache = process.env.PYODIDE_PARITY_CACHE || path.join(out, 'wheels');
  const wheels = {};
  for (const version of new Set(runs.map(r => r.version))) wheels[version] = await ensureWheels(version, cache);
  const started = Date.now();

  // Phase 1: the responses that authored tests pass to their checkers (they
  // become cases of cells without keys or with a diagram response), learned
  // once from the first run's sources.
  const authoredResponses = {};
  if (options.sources.length) {
    const first = runs[0];
    const prepass = {wheels, pages: {}, cases: [], authored: options.sources.map(t => ({name: t.name, root: at(first, t.dir), files: authoredSources(at(first, t.dir))})),
      python: null, responsesOnly: true, mathExtension: path.join(at(first, options.extensions), 'math-exercise')};
    const prepassFile = path.join(out, 'authored-responses-job.json'), prepassResults = path.join(out, 'authored-responses.jsonl');
    fs.writeFileSync(prepassFile, JSON.stringify(prepass));
    fs.rmSync(prepassResults, {force: true});
    await grade({...first, name: first.name + ' (authored responses)'}, prepassFile, prepassResults, options.timeout, log);
    for (const [id, record] of read(prepassResults)) {
      const m = /^authored:([^:]+):.*#(.*)$/.exec(id);
      if (!m || !record.responses || !record.responses.length) continue;
      const corpus = corpusOf(m[1], options.sources, corpora);
      ((authoredResponses[corpus] ||= {})[m[2]] ||= []).push(...record.responses);
    }
  }

  // Phase 2: the cases of each run (the same list for both).
  const jobs = runs.map(run => buildJob(run, options, wheels, authoredResponses, corpora));
  const idsOf = job => job.cases.map(c => c.id + ' ' + JSON.stringify([c.values, c.payload, c.fixture]));
  if (strict && !isDeepStrictEqual(idsOf(jobs[0]), idsOf(jobs[1]))) {
    const [a, b] = jobs.map(job => new Set(idsOf(job)));
    const only = (x, y) => [...x].filter(id => !y.has(id)).slice(0, 20);
    console.error(`The builds give different case lists: only in ${runs[0].name}: ${JSON.stringify(only(a, b))}; only in ${runs[1].name}: ${JSON.stringify(only(b, a))}`);
    process.exit(1);
  }
  const job = jobs[jobs.length - 1];
  const count = kind => job.cases.filter(c => c.kind === kind).length;
  const probes = job.cases.filter(c => c.probe && c.kind === 'response').length;
  log(`Cases: ${count('response')} responses (${probes} probes of cells without keys or with a diagram response) and ${count('fixture')} fixtures `
    + `in ${Object.keys(job.pages).length} pages (${job.duplicates.length} pages with the same exercises as a page above not repeated); `
    + `${job.authored.reduce((n, t) => n + t.files.length, 0)} source files with authored tests; ${job.python ? job.python.cases.length : 0} Python programs; `
    + `${job.skipped.length} cells or variants without anything to grade`);

  // Phase 3: both runs, in parallel processes.
  const resultFiles = Object.fromEntries(runs.map(r => [r.name, path.join(out, `results-${r.name}.jsonl`)]));
  await Promise.all(runs.map((run, i) => {
    const jobFile = path.join(out, `job-${run.name}.json`);
    fs.writeFileSync(jobFile, JSON.stringify(jobs[i]));
    return grade(run, jobFile, resultFiles[run.name], options.timeout, log);
  }));
  const results = Object.fromEntries(runs.map(r => [r.name, read(resultFiles[r.name])]));
  const byId = new Map(job.cases.map(c => [c.id, c]));
  const {differences, notes} = compare(byId, runs, results, strict);

  // Summary.
  const last = results[runs[1].name];
  const kindOf = id => id.startsWith('authored:') ? 'authored tests' : id.startsWith('python:') ? 'Python programs'
    : (byId.get(id)?.kind === 'fixture' ? 'fixtures' : byId.get(id)?.probe ? 'probes' : 'responses');
  const statuses = {};
  for (const [id, record] of last) {
    if (id.endsWith(':all')) continue;
    const kind = kindOf(id), status = ['responses', 'fixtures', 'probes'].includes(kind)
      ? (record.results.map(r => r.status).sort().filter((s, i, a) => a.indexOf(s) === i).join('+') || 'empty fields (graded without Python)')
      : record.results[0].status.split(':')[0];
    (statuses[kind] ||= {})[status] = (statuses[kind][status] || 0) + 1;
  }
  const keysNotCorrect = job.cases.filter(c => c.source === 'keys' && !(last.get(c.id)?.results || []).every(r => r.status === 'correct')).map(c => c.id);
  const fixtureMismatch = job.cases.filter(c => c.kind === 'fixture').map(c => ({c, got: runs.map(r => (results[r.name].get(c.id)?.results || []).map(x => x.status))}))
    .filter(({c, got}) => got.some(statusList => JSON.stringify(statusList) !== JSON.stringify(c.expected))).map(({c, got}) => ({id: c.id, expected: c.expected, got}));
  const pythonExpectations = job.python ? job.python.cases.map(c => ({c, got: runs.map(r => results[r.name].get(`python:${c.label}:${c.name}`)?.results[0].status)}))
    .filter(({c, got}) => got.some(status => status !== c.expected)) : [];
  const authored = [...last.keys()].filter(id => id.startsWith('authored:') && id !== 'authored:all');
  const authoredFailing = authored.filter(id => last.get(id).results[0].status !== 'pass');
  const timeouts = runs.map(r => [...results[r.name].values()].filter(x => x.results.some(y => y.status === 'timeout')).length);
  const coveredCells = new Set(job.cases.filter(c => c.probe).map(c => c.page + '#' + c.position)).size;
  const summary = {mode: strict ? 'builds' : 'versions', runs: runs.map(r => ({name: r.name, version: r.version, runtime: runtimes[r.name] || null})),
    minutes: Math.round((Date.now() - started) / 600) / 100,
    sites: options.site.map(s => s.name), sources: options.sources.map(s => s.name),
    pages: Object.keys(job.pages).length, duplicatePages: job.duplicates.length, cells: new Set(job.cases.map(c => c.page + '#' + c.position)).size,
    variants: new Set(job.cases.map(c => c.page + '#' + c.position + '|' + c.variantKey)).size,
    responses: count('response') - probes, probes,
    probedCells: coveredCells, fixtures: count('fixture'), authoredTests: authored.length, authoredNotPassing: authoredFailing.length,
    pythonPrograms: job.python ? job.python.cases.length : 0, pythonUnexpected: pythonExpectations.length,
    skipped: job.skipped.length, timeouts: Object.fromEntries(runs.map((r, i) => [r.name, timeouts[i]])),
    statuses, keysNotCorrect: keysNotCorrect.length, fixturesUnexpected: fixtureMismatch.length, differences: differences.length, notes: notes.length};

  // The golden capture.
  let captured = null;
  if (options.capture) {
    const collect = capture.collector();
    for (const run of runs) {
      const python = capture.minor(/Python ([\d.]+)/.exec(runtimes[run.name] || '')?.[1] || run.version);
      for (const [id, record] of results[run.name]) {
        if (record.authored) {
          const m = /^authored:([^:]+):/.exec(id);
          collect.authored(corpusOf(m[1], options.sources, corpora), record.authored, python);
        } else if (record.calls && record.calls.length) {
          const c = byId.get(id);
          if (c) collect.request(c.corpus, Boolean(c.probe), c.source || c.kind, record.calls, python);
        }
      }
    }
    const {suites, conflicts} = collect.suites();
    const dir = path.resolve(options.capture);
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir, {recursive: true});
    // The build record (components and commits): in the installed package, or next to the site.
    const extensions = at(runs[runs.length - 1], options.extensions);
    const recordFile = [path.join(extensions, 'ctm-assessment', 'resolved-repos.json'), path.join(extensions, '..', 'resolved-repos.json')].find(file => fs.existsSync(file));
    const record = recordFile ? JSON.parse(fs.readFileSync(recordFile, 'utf8')) : null;
    const corporaInfo = {};
    for (const name of Object.keys(suites)) {
      const tree = options.sources.find(t => t.name === name);
      const component = record && record.repositories && record.repositories[name];
      corporaInfo[name] = {...(corpora[name] || {}),
        commit: (corpora[name] || {}).commit || (tree && commitOf(at(runs[runs.length - 1], tree.dir))) || (component && component.commit) || null,
        sites: options.site.filter(s => corpusOf(s.name, options.sources, corpora) === name).map(s => s.name)};
    }
    captured = capture.write(dir, suites, corporaInfo, {format: 1, harness: 'ctm-assessment integration/pyodide-parity/run.cjs --capture',
      umbrella: commitOf(process.cwd()), runs: summary.runs, components: record && record.repositories
        ? Object.fromEntries(Object.entries(record.repositories).map(([name, r]) => [name, r.commit || null])) : null,
      corpora: corporaInfo, conflicts});
    summary.capture = Object.fromEntries(Object.entries(captured.files).map(([file, info]) => [file, info.rows]));
    summary.captureConflicts = conflicts.length;
  }

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({summary, differences, notes, skipped: job.skipped, duplicates: job.duplicates, keysNotCorrect, fixtureMismatch,
    authoredNotPassing: authoredFailing.map(id => ({id, outcome: last.get(id).results[0].status})), pythonUnexpected: pythonExpectations}, null, 1));
  const title = strict
    ? `## Build comparison: ${runs.map(r => r.name).join(' vs ')} under ${runtimes[runs[1].name] || 'Pyodide ' + runs[1].version}`
    : `## Pyodide parity: ${runs.map(r => runtimes[r.name] || 'Pyodide ' + r.version).join(' vs ')}`;
  const md = [title, '',
    `${summary.pages} pages (and ${summary.duplicatePages} with the same exercises), ${summary.cells} exercises, ${summary.variants} exercise variants: ${summary.responses} graded responses, `
    + `${summary.probes} probes of ${summary.probedCells} cells without keys or with a diagram response, and ${summary.fixtures} variant fixtures; `
    + `${summary.authoredTests} authored question tests; ${summary.pythonPrograms} Python programs. ${summary.minutes} min.`, '',
    strict
      ? `**Differences (status, score, details or feedback): ${differences.length}.** Timeouts: ${runs.map(r => r.name + ' ' + summary.timeouts[r.name]).join(', ')}.`
      : `**Differences in status or score: ${differences.length}.** Other differences (messages, feedback text): ${notes.length}. `
        + `Timeouts: ${runs.map(r => r.name + ' ' + summary.timeouts[r.name]).join(', ')}.`, '',
    ...Object.entries(statuses).map(([kind, counts]) => `- ${kind} (${runs[1].name}): ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ')}`), '',
    `Authored tests not passing: ${authoredFailing.length}. Variant fixtures graded unlike their expectation: ${fixtureMismatch.length}. `
    + `Python programs graded unlike their expectation: ${pythonExpectations.length}. Answer keys not graded correct (generated variants whose checker `
    + `decides, or keys that are examples): ${keysNotCorrect.length}. Cells or variants with nothing to grade (no fields and no response, or a diagram `
    + `without authored tests or fixtures): ${summary.skipped}.`];
  if (captured) md.push('', `Golden capture: ${Object.entries(captured.files).map(([file, info]) => `\`${file}\` ${info.rows}`).join(', ')}; `
    + `rows with different outputs in one runtime: ${summary.captureConflicts}.`);
  for (const d of differences.slice(0, 50)) md.push('', '- `' + d.id + '`: ' + JSON.stringify(d).slice(0, 600));
  fs.writeFileSync(path.join(out, 'report.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  process.exit(differences.length || (summary.captureConflicts && !strict) ? 1 : 0);
})().catch(error => { console.error(error); process.exit(2); });
