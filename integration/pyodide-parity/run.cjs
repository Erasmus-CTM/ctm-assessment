#!/usr/bin/env node
// Pyodide parity harness, the gate for a Pyodide upgrade (design D4, §13 A6),
// the build comparison of step 2 (L2, design step 2 §6.1) and the golden
// capture for ctm-checkers (step 2 §6.2-6.4, §13): every math-exercise of the
// given rendered sites, every variant, graded with the page's own
// math-exercise.js in jsdom (Node builds of Pyodide; SymPy, mpmath and
// NetworkX from each version's verified wheels): the answer keys,
// perturbations of each key, the October 2026 audit's challenge answers,
// boundary probes of numeric cells, the generated variants' fixtures, and for
// cells without keys or with a diagram response the teacher answers of
// answers.json (with the verdict each must get), probes and the responses of
// their authored tests (cases.cjs); the authored question tests of the given
// source trees (in Pyodide: through ctm-checkers when the build has it next to
// math-exercise, else question-tests.py); and the umbrella's Python programs
// (py-exercise's MODULE_PY). math-exercise 0.10 (its own checker module) and
// 0.11 (ctm-checkers, called through ctm-libs) are graded alike, so --builds
// compares them.
//
// Two runs are compared:
// - versions (default): the same sites under two Pyodide versions; any
//   difference in status or score fails, other differences are reported.
// - --builds base=DIR,head=DIR: two builds of the same sites (site, source and
//   extension paths are relative to each build's DIR) under one Pyodide
//   version; any difference fails (status, score, details, feedback text, a
//   case only one build has), unless --expected FILE lists it.
// Either way the run fails when a case has no result, timed out or ended in a
// harness error (in either run), when a teacher answer gets another verdict
// than its `expect`, does not fit its cell, or its label is on no page of its
// corpus (for a build comparison: in the head build).
//
//   node integration/pyodide-parity/run.cjs --site umbrella=.feedback-workspace/site/_site \
//     [--site NAME=SITE_DIR ...] [--sources NAME=SOURCE_DIR ...] [--python ROOT] \
//     --extensions .feedback-workspace/site/_extensions --out DIR \
//     [--versions 0.27.2,0.28.3 | --builds base=DIR,head=DIR [--versions 0.28.3] [--expected FILE]]
//     [--capture DIR] [--hash-seed N]
//   node integration/pyodide-parity/run.cjs --corpora DIR/corpora-built.json --out DIR ...
//
// --corpora FILE: the corpora build-corpora.py built (sites, source trees,
// package, Python programs; with --builds a path inside each build). A site
// belongs to the corpus (corpora.json) named there, else to the source tree
// of the same name, or whose name it starts with (ctm-demo-review: ctm-demo).
// A course that follows its branch (no pinned commit) has its teacher
// answers' expectations reported, not enforced.
// --capture DIR writes the golden suites (capture.cjs), split by provenance.
// --hash-seed N: Python's PYTHONHASHSEED in every run (default 0; CI captures
// twice with different seeds and compares).
// --expected FILE (builds): the differences a pull request causes on purpose,
// {"differences": [{"path", "case", "reason", "required"}]}: `path` a page
// ("math-exercise/examples.html") or authored source ("math-exercise/examples.qmd"),
// or its folder; `case` a case id or "/regex/"; `reason` why; `required`
// (default true) fails the run when the entry matches no difference. The
// narrowest matching entry gives a difference its reason (exact case id,
// then pattern, then path alone).
// PYODIDE_PARITY_CACHE: wheel cache (default DIR/wheels); PYODIDE_PARITY_WHEELS:
// a local folder <dir>/<version>/<wheel> instead of jsDelivr (hashes are checked either way).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const {isDeepStrictEqual} = require('node:util');
const {ensureWheels} = require('./wheels.cjs');
const {pageCases, pagesUnder, authoredSources, ANSWERS} = require('./cases.cjs');
const capture = require('./capture.cjs');
const variantCoverage = require('./variant-coverage.cjs');

function parse(argv) {
  const options = {site: [], sources: [], versions: null, builds: null, timeout: 240, python: null, extensions: null, out: null, capture: null,
    hashSeed: 0, expected: null, corpora: null};
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--site' || flag === '--sources') { options[flag.slice(2)].push(value); i++; }
    else if (flag === '--versions') { options.versions = value.split(','); i++; }
    else if (flag === '--builds') { options.builds = value.split(',').map(entry => { const [name, dir] = entry.split('='); return {name, root: path.resolve(dir)}; }); i++; }
    else if (flag === '--hash-seed') { options.hashSeed = Number(value); i++; }
    else if (['--python', '--extensions', '--out', '--timeout', '--capture', '--expected', '--corpora'].includes(flag)) { options[flag.slice(2)] = flag === '--timeout' ? Number(value) : value; i++; }
    else throw new Error('Unknown option ' + flag);
  }
  if (options.builds) {
    options.versions ||= ['0.28.3'];
    if (options.builds.length !== 2 || options.versions.length !== 1 || options.builds.some(b => !b.name || !b.root))
      throw new Error('--builds takes two builds, base=DIR,head=DIR, and one Pyodide version');
  } else options.versions ||= ['0.27.2', '0.28.3'];
  if (!Number.isInteger(options.hashSeed) || options.hashSeed < 0 || options.hashSeed > 4294967295) throw new Error('--hash-seed takes an integer 0-4294967295');
  if (options.expected && !options.builds) throw new Error('--expected applies to --builds');
  if (!options.out || !(options.extensions || options.corpora) || (!options.builds && options.versions.length !== 2)) throw new Error('Usage: see the header of run.cjs');
  const pairs = list => list.map(entry => { const [name, dir] = entry.split('='); return {name, dir}; });
  return withCorpora({...options, site: pairs(options.site), sources: pairs(options.sources)});
}

// --corpora FILE (build-corpora.py's corpora-built.json): its sites (with
// their corpus), source trees, package and Python programs, paths relative to
// the file; with --builds the file is a path inside each build (read from the
// head build) and so are its paths.
function withCorpora(options) {
  if (!options.corpora) return options;
  const file = options.builds ? path.resolve(options.builds[1].root, options.corpora) : path.resolve(options.corpora);
  const built = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = options.builds ? path.dirname(options.corpora) : path.dirname(file);
  const join = dir => path.join(base, dir);
  return {...options, courseCommits: built.courses || {},
    site: [...built.sites.map(s => ({name: s.name, dir: join(s.dir), corpus: s.corpus})), ...options.site],
    sources: [...built.sources.map(s => ({name: s.name, dir: join(s.dir)})), ...options.sources],
    extensions: options.extensions || (built.extensions ? join(built.extensions) : null), python: options.python || (built.python ? join(built.python) : null)};
}

// The runs: two Pyodide versions over one build, or two builds under one version.
function runsOf(options) {
  if (options.builds) return options.builds.map(b => ({name: b.name, version: options.versions[0], root: b.root}));
  return options.versions.map(v => ({name: v, version: v, root: process.cwd()}));
}
// A path of a run, links resolved (Pyodide's NODEFS mounts real folders only).
const at = (run, dir) => { const full = path.resolve(run.root, dir); return fs.existsSync(full) ? fs.realpathSync(full) : full; };
// The wheel of ctm-checkers next to math-exercise in an extensions folder
// (math-exercise 0.11 grades with it; its authored tests run through it), or null.
function checkersWheel(extensions) {
  const manifest = path.join(extensions, 'ctm-checkers', 'checkers.json');
  if (!fs.existsSync(manifest)) return null;
  return path.join(extensions, 'ctm-checkers', JSON.parse(fs.readFileSync(manifest, 'utf8')).wheel);
}

// The runtimes as the workers report them: "Pyodide <v> (Python <v>, SymPy <v>, PYTHONHASHSEED <n>)".
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

// What a case grades: exercise, variant, response or fixture.
const caseContent = c => JSON.stringify([c.position, c.label, c.variantKey, c.kind, c.values, c.matrices, c.payload, c.fixture]);
// What a page's cases grade.
function casesSignature(cases) {
  return require('node:crypto').createHash('sha256').update(JSON.stringify(cases.map(caseContent))).digest('hex');
}

const sameScore = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-12);

function read(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    map.set(record.id, record);   // a later line (after a restart) wins
  }
  return map;
}

// What a run had to grade, and what it did not grade (step-2 review S6): a
// case without a result, a timeout or a harness error fails the run, also
// when the other run has the same hole.
function inventory(job, records) {
  const ids = new Set(job.cases.map(c => c.id));
  const incomplete = [];
  if (job.python) {
    for (const c of job.python.cases) ids.add(`python:${c.label}:${c.name}`);
    if (!records.has('python:all')) incomplete.push({id: 'python:all', why: 'the Python programs did not finish'});
  }
  if (job.authored.length && !records.has('authored:all')) incomplete.push({id: 'authored:all', why: 'the authored tests did not finish'});
  for (const id of records.keys()) if (id.startsWith('authored:') && id !== 'authored:all') ids.add(id);
  for (const id of ids) {
    const record = records.get(id);
    const failed = record && record.results.find(r => r.status === 'timeout' || r.status === 'harness-error');
    if (!record) incomplete.push({id, why: 'no result'});
    else if (failed) incomplete.push({id, why: failed.status + (failed.detail ? ': ' + String(failed.detail).slice(0, 300) : '')});
  }
  return {ids, incomplete};
}

// The page or source a result belongs to.
function pathOf(id, c) {
  if (c) return c.page;
  const authored = /^authored:([^:]+):(.*)#/.exec(id);
  if (authored) return authored[1] + '/' + authored[2];
  return id.startsWith('python:') ? 'python' : id;
}

// Versions: status and score decide; other differences are notes. Builds
// (strict): any difference in results (status, score, details) or feedback,
// and cases that only one build has or that grade other responses.
function compare(runs, jobs, results, inventories, strict) {
  const [before, after] = runs.map(r => results[r.name]);
  const [casesA, casesB] = jobs.map(job => new Map(job.cases.map(c => [c.id, c])));
  const [idsA, idsB] = inventories.map(inv => inv.ids);
  const differences = [], notes = [];
  for (const id of [...new Set([...idsA, ...idsB])].sort()) {
    const c = casesB.get(id) || casesA.get(id) || null;
    const where = pathOf(id, c);
    if (!idsA.has(id) || !idsB.has(id)) {
      differences.push({id, path: where, why: 'only in ' + (idsA.has(id) ? runs[0].name : runs[1].name), case: c});
      continue;
    }
    if (casesA.has(id) && caseContent(casesA.get(id)) !== caseContent(casesB.get(id))) {
      differences.push({id, path: where, why: 'the builds grade different responses', case: {[runs[0].name]: casesA.get(id), [runs[1].name]: casesB.get(id)}});
      continue;
    }
    const a = before.get(id), b = after.get(id);
    if (!a || !b) continue;   // reported as incomplete
    const graded = r => r.results.map(x => ({status: x.status, score: x.score ?? null}));
    const ga = graded(a), gb = graded(b);
    const same = ga.length === gb.length && ga.every((x, i) => x.status === gb[i].status && sameScore(x.score, gb[i].score));
    const identical = isDeepStrictEqual(a.results, b.results) && isDeepStrictEqual(a.feedback, b.feedback) && isDeepStrictEqual(a.responses, b.responses);
    const entry = {id, path: where, case: c, [runs[0].name]: {results: a.results, feedback: a.feedback}, [runs[1].name]: {results: b.results, feedback: b.feedback}};
    if (!same || (strict && !identical)) differences.push(entry);
    else if (!identical) notes.push(entry);
  }
  return {differences, notes};
}

// The expected differences of a build comparison (--expected).
function readExpected(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = data.differences;
  if (!Array.isArray(entries)) throw new Error(file + ': {"differences": [...]} expected');
  return entries.map((entry, i) => {
    const unknown = Object.keys(entry).filter(key => !['path', 'case', 'reason', 'required', 'onlyIn'].includes(key));
    if (unknown.length || typeof entry.reason !== 'string' || !entry.reason.trim() || !(entry.path || entry.case))
      throw new Error(`${file}: entry ${i + 1} needs a reason and a path or case (path, case, reason, required)`);
    if (entry.onlyIn !== undefined && !['base', 'head'].includes(entry.onlyIn)) throw new Error(file + ': onlyIn must be base or head');
    const pattern = typeof entry.case === 'string' && /^\/.*\/$/.test(entry.case) ? new RegExp(entry.case.slice(1, -1)) : null;
    // The narrower entry wins a difference: an exact case id, then a case pattern, then a path alone; the longer path, then the
    // longer pattern, then the earlier entry.
    const rank = [entry.case ? (pattern ? 2 : 3) : 1, (entry.path || '').length, (entry.case || '').length];
    return {...entry, required: entry.required !== false, index: i, rank,
      matches: d => (!entry.onlyIn || d.why === 'only in ' + entry.onlyIn) && (!entry.path || d.path === entry.path || d.path.startsWith(entry.path.replace(/\/?$/, '/')))
        && (!entry.case || (pattern ? pattern.test(d.id) : d.id === entry.case))};
  });
}
const narrower = (a, b) => {
  for (let k = 0; k < a.rank.length; k++) if (a.rank[k] !== b.rank[k]) return b.rank[k] - a.rank[k];
  return a.index - b.index;
};
// Every entry is matched against every difference (round-2 review N2): the
// narrowest matching entry gives the reason, and an entry is stale only when
// it matches no difference at all.
function applyExpected(entries, differences) {
  const used = entries.map(() => 0), accepted = [], unexpected = [];
  for (const d of differences) {
    const matching = entries.filter(entry => entry.matches(d));
    if (!matching.length) { unexpected.push(d); continue; }
    for (const entry of matching) used[entry.index]++;
    const best = [...matching].sort(narrower)[0];
    accepted.push({...d, reason: best.reason, entry: best.index + 1});
  }
  const stale = entries.filter((entry, i) => entry.required && !used[i]).map(({path: p, case: c, reason}) => ({path: p, case: c, reason}));
  return {accepted, unexpected, stale};
}

// Custom-checker coverage by cell (step-2 review S1): every cell that decides
// without answer keys or with a diagram response, or runs a custom checker,
// with the verdicts its cases reached in a run.
function coverage(job, records) {
  const cells = new Map();
  for (const cell of job.cells) {
    if (cell.mode === 'custom' || cell.keyless || cell.diagram) cells.set(cell.page + '#' + cell.position, {...cell, cases: 0, verdicts: new Set()});
  }
  for (const c of job.cases) {
    const cell = cells.get(c.page + '#' + c.position);
    if (!cell) continue;
    cell.cases++;
    for (const r of records.get(c.id)?.results || []) cell.verdicts.add(r.status);
  }
  const list = [...cells.values()].map(cell => ({...cell, verdicts: [...cell.verdicts].sort()}));
  const byCorpus = {};
  for (const cell of list) {
    const entry = byCorpus[cell.corpus] ||= {cells: 0, labels: new Set(), graded: 0, correct: 0, partial: 0, wrong: 0};
    entry.cells++; entry.labels.add(cell.label);
    if (cell.cases) entry.graded++;
    for (const verdict of ['correct', 'partial', 'wrong']) if (cell.verdicts.includes(verdict)) entry[verdict]++;
  }
  for (const entry of Object.values(byCorpus)) entry.labels = entry.labels.size;
  return {cells: list, byCorpus, withoutCorrect: list.filter(cell => !cell.verdicts.includes('correct'))
    .map(({page, position, label, cases, verdicts}) => ({page, position, label, cases, verdicts}))};
}

// The corpus of a site: the one --corpora names, the source tree of that name, or the longest whose name the site's starts with.
const siteCorpus = (site, options, corpora) => site.corpus || corpusOf(site.name, options.sources, corpora);
// A course that follows its branch (no pinned commit): its teacher answers' expectations are reported, not enforced.
const followsBranch = (corpus, corpora) => Boolean(corpora[corpus] && corpora[corpus].course && !corpora[corpus].commit);
// The teacher answers of a corpus (answers.json; "answers" in corpora.json names another corpus's).
const answersOf = (corpus, corpora) => ANSWERS[(corpora[corpus] || {}).answers || corpus] || {};
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
  const job = {wheels, hashSeed: options.hashSeed, pages: {}, cases: [], skipped: [], cells: [], unshaped: [], misfits: [], authored: [], python: null, duplicates: [],
    mathExtension: path.join(at(run, options.extensions), 'math-exercise'), checkersWheel: checkersWheel(at(run, options.extensions)),
    capture: Boolean(options.capture)};
  const seen = new Map(), generated = [];
  for (const site of options.site) {
    const root = at(run, site.dir), corpus = siteCorpus(site, options, corpora);
    for (const file of pagesUnder(root)) {
      const relative = site.name + '/' + file.split(path.sep).join('/');
      const {cases, skipped, cells, unshaped, misfits, generated: manifests} = pageCases(path.join(root, file), relative, authoredResponses[corpus] || {}, answersOf(corpus, corpora));
      generated.push(...manifests.map(cell => ({...cell, corpus})));
      const signature = casesSignature(cases);
      if (cases.length && seen.has(signature)) {
        // Graded once, as the earlier page; its teacher answers count as found for this corpus too.
        job.duplicates.push({page: relative, same: seen.get(signature), corpus, answered: [...new Set(cases.filter(c => c.source === 'answer').map(c => c.label))]});
        continue;
      }
      if (cases.length) seen.set(signature, relative);
      job.pages[relative] = {root, file};
      job.cases.push(...cases.map(c => ({...c, corpus})));
      job.skipped.push(...skipped); job.unshaped.push(...unshaped); job.misfits.push(...misfits.map(m => ({...m, corpus})));
      job.cells.push(...cells.map(cell => ({...cell, corpus})));
    }
  }
  for (const tree of options.sources) {
    const root = at(run, tree.dir);
    const files = authoredSources(root);
    job.authored.push({name: tree.name, root, files});
    // Duplicate rendered pages share the already graded page's cases.
    const manifests = generated.map(cell => ({...cell, page: job.duplicates.find(d => d.page === cell.page)?.same || cell.page}));
    (job.variantRecipes ||= []).push(...variantCoverage.coverage(root, files, corpusOf(tree.name, options.sources, corpora),
      job.mathExtension, job.checkersWheel, manifests, job.cases));
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

async function main() {
  const options = parse(process.argv.slice(2));
  if (!options.site.length && !options.sources.length && !options.python) {
    // build-corpora.py --courses following when no course follows a branch (or its branch is gone).
    console.log('Nothing to grade: no sites, source trees or Python programs.');
    process.exit(0);
  }
  const out = path.resolve(options.out);
  fs.mkdirSync(out, {recursive: true});
  const log = line => console.log(line);
  const runs = runsOf(options), strict = Boolean(options.builds);
  const corpora = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpora.json'), 'utf8')).corpora;
  const expected = options.expected ? readExpected(options.expected) : null;
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
    const prepass = {wheels, hashSeed: options.hashSeed, pages: {}, cases: [], python: null, responsesOnly: true,
      authored: options.sources.map(t => ({name: t.name, root: at(first, t.dir), files: authoredSources(at(first, t.dir))})),
      mathExtension: path.join(at(first, options.extensions), 'math-exercise'), checkersWheel: checkersWheel(at(first, options.extensions))};
    const prepassFile = path.join(out, 'authored-responses-job.json'), prepassResults = path.join(out, 'authored-responses.jsonl');
    fs.writeFileSync(prepassFile, JSON.stringify(prepass));
    fs.rmSync(prepassResults, {force: true});
    await grade({...first, name: first.name + ' (authored responses)'}, prepassFile, prepassResults, options.timeout, log);
    const learned = read(prepassResults);
    if (!learned.has('authored:all')) throw new Error('The authored tests did not finish in the first pass');
    for (const [id, record] of learned) {
      const m = /^authored:([^:]+):.*#(.*)$/.exec(id);
      if (!m || !record.responses || !record.responses.length) continue;
      const corpus = corpusOf(m[1], options.sources, corpora);
      ((authoredResponses[corpus] ||= {})[m[2]] ||= []).push(...record.responses);
    }
  }

  // Phase 2: the cases of each run (one list for both versions; per build).
  const jobs = strict ? runs.map(run => buildJob(run, options, wheels, authoredResponses, corpora))
    : Array(2).fill(buildJob(runs[0], options, wheels, authoredResponses, corpora));
  const job = jobs[jobs.length - 1];
  const count = kind => job.cases.filter(c => c.kind === kind).length;
  const bySource = {};
  for (const c of job.cases) if (c.kind === 'response') bySource[c.source] = (bySource[c.source] || 0) + 1;
  log(`Cases: ${count('response')} responses (${Object.entries(bySource).map(([s, n]) => `${s} ${n}`).join(', ')}) and ${count('fixture')} fixtures `
    + `in ${Object.keys(job.pages).length} pages (${job.duplicates.length} pages with the same exercises as a page above not repeated); `
    + `${job.authored.reduce((n, t) => n + t.files.length, 0)} source files with authored tests; ${job.python ? job.python.cases.length : 0} Python programs; `
    + `${job.skipped.length} cells or variants without anything to grade`);
  // Every teacher answer of a corpus in the run must fit and reach its exercise
  // (in the head of a build comparison: the base may predate an answer).
  const misfitsAll = job.misfits.map(m => ({corpus: m.corpus, text: `${m.page} cell ${m.position} (${m.label}, ${m.variant}), answers.json entry ${m.entry}: ${m.problem}`}));
  const runCorpora = new Set(options.site.map(s => siteCorpus(s, options, corpora)));
  const answered = (corpus, label) => job.cases.some(c => c.corpus === corpus && c.source === 'answer' && c.label === label)
    || job.duplicates.some(d => d.corpus === corpus && d.answered.includes(label));
  const unusedAll = [...runCorpora].flatMap(corpus => Object.keys(answersOf(corpus, corpora))
    .filter(label => !answered(corpus, label)).map(label => ({corpus, text: corpus + ': ' + label})));
  // Enforced for pinned corpora; for a course that follows its branch, reported.
  const enforced = item => !followsBranch(item.corpus, corpora);
  const answersMisfit = misfitsAll.filter(enforced).map(m => m.text), answersUnused = unusedAll.filter(enforced).map(u => u.text);
  const answerNotes = [...misfitsAll, ...unusedAll].filter(item => !enforced(item)).map(item => item.text);

  // Phase 3: both runs, in parallel processes.
  const resultFiles = Object.fromEntries(runs.map(r => [r.name, path.join(out, `results-${r.name}.jsonl`)]));
  await Promise.all(runs.map((run, i) => {
    const jobFile = path.join(out, `job-${run.name}.json`);
    fs.writeFileSync(jobFile, JSON.stringify(jobs[i]));
    fs.rmSync(resultFiles[run.name], {force: true});
    return grade(run, jobFile, resultFiles[run.name], options.timeout, log);
  }));
  const results = Object.fromEntries(runs.map(r => [r.name, read(resultFiles[r.name])]));
  const inventories = runs.map((r, i) => inventory(jobs[i], results[r.name]));
  const incomplete = runs.flatMap((r, i) => inventories[i].incomplete.map(item => ({run: r.name, ...item})));
  const byId = new Map(job.cases.map(c => [c.id, c]));
  const compared = compare(runs, jobs, results, inventories, strict);
  const {notes} = compared;
  const {accepted, unexpected: differences, stale} = expected ? applyExpected(expected, compared.differences) : {accepted: [], unexpected: compared.differences, stale: []};

  // Summary.
  const last = results[runs[1].name];
  const kindOf = id => id.startsWith('authored:') ? 'authored tests' : id.startsWith('python:') ? 'Python programs'
    : (byId.get(id)?.kind === 'fixture' ? 'fixtures' : byId.get(id)?.probe ? 'cells without keys' : 'responses');
  const statuses = {};
  for (const [id, record] of last) {
    if (id.endsWith(':all') || (!byId.has(id) && !id.startsWith('authored:') && !id.startsWith('python:'))) continue;
    const kind = kindOf(id), status = ['responses', 'fixtures', 'cells without keys'].includes(kind)
      ? (record.results.map(r => r.status).sort().filter((s, i, a) => a.indexOf(s) === i).join('+') || 'empty fields (graded without Python)')
      : record.results[0].status.split(':')[0];
    (statuses[kind] ||= {})[status] = (statuses[kind][status] || 0) + 1;
  }
  const verdictOf = record => [...new Set((record?.results || []).map(r => r.status))].sort().join('+') || 'none';
  // Teacher answers: the verdict each must get (both versions; the head of a build comparison).
  const checked = strict ? [runs[1]] : runs;
  const unexpectedAll = job.cases.filter(c => c.expect).flatMap(c => checked.map(r => ({c, run: r.name, got: verdictOf(results[r.name].get(c.id))})))
    .filter(({c, got}) => got !== c.expect).map(({c, run, got}) => ({id: c.id, corpus: c.corpus, run, expected: c.expect, got}));
  const answersUnexpected = unexpectedAll.filter(enforced);
  answerNotes.push(...unexpectedAll.filter(item => !enforced(item)).map(a => `${a.run}: ${a.id}: expected ${a.expected}, got ${a.got}`));
  const keysNotCorrect = job.cases.filter(c => c.source === 'keys' && !(last.get(c.id)?.results || []).every(r => r.status === 'correct')).map(c => c.id);
  const fixtureMismatch = variantCoverage.fixtureMismatches(job, runs, results);
  const pythonExpectations = job.python ? job.python.cases.map(c => ({c, got: runs.map(r => results[r.name].get(`python:${c.label}:${c.name}`)?.results[0].status)}))
    .filter(({c, got}) => got.some(status => status !== c.expected)) : [];
  const authored = [...last.keys()].filter(id => id.startsWith('authored:') && id !== 'authored:all');
  const authoredFailing = authored.filter(id => last.get(id).results[0].status !== 'pass');
  const timeouts = runs.map(r => [...results[r.name].values()].filter(x => x.results.some(y => y.status === 'timeout')).length);
  const covered = coverage(job, last);
  const summary = {mode: strict ? 'builds' : 'versions', runs: runs.map(r => ({name: r.name, version: r.version, runtime: runtimes[r.name] || null})),
    pythonHashSeed: options.hashSeed, minutes: Math.round((Date.now() - started) / 600) / 100,
    sites: options.site.map(s => s.name), sources: options.sources.map(s => s.name),
    pages: Object.keys(job.pages).length, duplicatePages: job.duplicates.length, cells: new Set(job.cases.map(c => c.page + '#' + c.position)).size,
    variants: new Set(job.cases.map(c => c.page + '#' + c.position + '|' + c.variantKey)).size,
    responses: count('response'), responsesBySource: bySource, fixtures: count('fixture'),
    customCells: covered.cells.length, customCoverage: covered.byCorpus, customWithoutCorrect: covered.withoutCorrect.length,
    authoredResponsesNotPageShaped: job.unshaped.length, teacherAnswers: job.cases.filter(c => c.expect).length,
    teacherAnswersUnexpected: answersUnexpected.length, teacherAnswersUnused: answersUnused.length, teacherAnswersMisfit: answersMisfit.length,
    teacherAnswerNotes: answerNotes.length, courseCommits: options.courseCommits || null,
    authoredTests: authored.length, authoredNotPassing: authoredFailing.length, variantRecipes: (job.variantRecipes || []).length,
    pythonPrograms: job.python ? job.python.cases.length : 0, pythonUnexpected: pythonExpectations.length,
    skipped: job.skipped.length, timeouts: Object.fromEntries(runs.map((r, i) => [r.name, timeouts[i]])), incomplete: incomplete.length,
    statuses, keysNotCorrect: keysNotCorrect.length, fixturesUnexpected: fixtureMismatch.length,
    differences: differences.length, expectedDifferences: accepted.length, staleExpectations: stale.length, notes: notes.length};

  // The golden capture.
  let captured = null;
  if (options.capture) {
    const collect = capture.collector();
    for (const run of runs) {
      const python = capture.minor(/Python ([\d.]+)/.exec(runtimes[run.name] || '')?.[1] || run.version);
      for (const [id, record] of results[run.name]) {
        if (record.authored) {
          const m = /^authored:([^:]+):/.exec(id);
          collect.authored(corpusOf(m[1], options.sources, corpora), record.authored, python);   // a source tree is named as its corpus
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
      // The commit built (a run on demand or a course that follows its branch may differ from the pin).
      corporaInfo[name] = {...(corpora[name] || {}),
        commit: (tree && commitOf(at(runs[runs.length - 1], tree.dir))) || (corpora[name] || {}).commit || (component && component.commit) || null,
        sites: options.site.filter(s => siteCorpus(s, options, corpora) === name).map(s => s.name)};
    }
    // The harness's checkout and the package the sites were built with, recorded both (they are one commit in CI).
    const umbrella = commitOf(process.cwd());
    const pkg = record && record.repositories && record.repositories['ctm-assessment'] ? record.repositories['ctm-assessment'].commit || null : null;
    if (umbrella && pkg && umbrella !== pkg) log(`Note: the harness runs from ${umbrella.slice(0, 12)}, the sites were built with the package of ${pkg.slice(0, 12)}`);
    // An incomplete run, or rows with two outputs in one runtime, writes no export/ (round-2 review N3).
    const withhold = incomplete.length ? `${incomplete.length} cases without a result, timed out or with a harness error`
      : conflicts.length ? `${conflicts.length} rows with different outputs in one runtime` : null;
    captured = capture.write(dir, suites, corporaInfo, {format: 1, harness: 'ctm-assessment integration/pyodide-parity/run.cjs --capture',
      umbrella, package: pkg, pythonHashSeed: options.hashSeed, runs: summary.runs, components: record && record.repositories
        ? Object.fromEntries(Object.entries(record.repositories).map(([name, r]) => [name, r.commit || null])) : null,
      corpora: corporaInfo, conflicts, incomplete}, {withhold});
    summary.capture = Object.fromEntries(Object.entries(captured.files).map(([file, info]) => [file, info.rows]));
    summary.captureConflicts = conflicts.length;
    summary.exportWithheld = withhold;
  }

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({summary, differences, expectedDifferences: accepted, staleExpectations: stale, notes, incomplete,
    teacherAnswersUnexpected: answersUnexpected, teacherAnswersUnused: answersUnused, teacherAnswersMisfit: answersMisfit, teacherAnswerNotes: answerNotes, customWithoutCorrect: covered.withoutCorrect, customCells: covered.cells,
    authoredResponsesNotPageShaped: job.unshaped, skipped: job.skipped, duplicates: job.duplicates, keysNotCorrect, fixtureMismatch,
    variantRecipes: Object.fromEntries(runs.map((run, i) => [run.name, jobs[i].variantRecipes || []])),
    authoredNotPassing: authoredFailing.map(id => ({id, outcome: last.get(id).results[0].status})), pythonUnexpected: pythonExpectations}, null, 1));
  const title = strict
    ? `## Build comparison: ${runs.map(r => r.name).join(' vs ')} under ${runtimes[runs[1].name] || 'Pyodide ' + runs[1].version}`
    : `## Pyodide parity: ${runs.map(r => runtimes[r.name] || 'Pyodide ' + r.version).join(' vs ')}`;
  const cov = Object.entries(covered.byCorpus);
  const md = [title, '',
    `${summary.pages} pages (and ${summary.duplicatePages} with the same exercises), ${summary.cells} exercises, ${summary.variants} exercise variants: ${summary.responses} graded responses `
    + `(${Object.entries(bySource).map(([s, n]) => `${s} ${n}`).join(', ')}) and ${summary.fixtures} variant fixtures; `
    + `${summary.authoredTests} authored question tests; ${summary.pythonPrograms} Python programs. ${summary.minutes} min.`, '',
    strict
      ? `**Differences (status, score, details, feedback or cases): ${differences.length}.** Expected (--expected): ${accepted.length}; expected but not found: ${stale.length}.`
      : `**Differences in status or score: ${differences.length}.** Other differences (messages, feedback text): ${notes.length}.`,
    `**Cases without a result, timed out or with a harness error: ${incomplete.length}** (timeouts: ${runs.map(r => r.name + ' ' + summary.timeouts[r.name]).join(', ')}). `
    + `**Teacher answers graded unlike their expectation: ${answersUnexpected.length}** (of ${summary.teacherAnswers}); answers.json entries that do not fit their cell: `
    + `${answersMisfit.length}; labels on no page of their corpus: ${answersUnused.length}`
    + (answerNotes.length ? `; in courses that follow their branch (reported only): ${answerNotes.length}` : '') + '.', '',
    `Cells with custom checkers, without keys or with a diagram response: ${summary.customCells}; by corpus (cells, labels: reaching correct / partial / wrong): `
    + cov.map(([name, e]) => `${name} ${e.cells} (${e.labels} labels): ${e.correct} / ${e.partial} / ${e.wrong}`).join('; ') + '. '
    + `Without a correct verdict: ${covered.withoutCorrect.length ? covered.withoutCorrect.map(c => '`' + c.page + '#' + c.position + ':' + c.label + '`').join(', ') : 'none'}. `
    + `Authored responses the page cannot send (left out): ${job.unshaped.length}.`, '',
    ...Object.entries(statuses).map(([kind, counts]) => `- ${kind} (${runs[1].name}): ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ')}`), '',
    `Authored tests not passing: ${authoredFailing.length}. Variant fixtures graded unlike their expectation: ${fixtureMismatch.length}. `
    + `Python programs graded unlike their expectation: ${pythonExpectations.length}. Answer keys not graded correct (generated variants whose checker `
    + `decides, or keys that are examples): ${keysNotCorrect.length}. Cells or variants with nothing to grade: ${summary.skipped}.`];
  if (captured) md.push('', `Golden capture (PYTHONHASHSEED ${options.hashSeed}): ${Object.entries(captured.files).map(([file, info]) => `\`${file}\` ${info.rows}`).join(', ')}; `
    + `rows with different outputs in one runtime: ${summary.captureConflicts}.` + (summary.exportWithheld ? ` **export/ withheld: ${summary.exportWithheld}.**` : ''));
  const list = (heading, items, text) => { if (items.length) md.push('', heading, ...items.slice(0, 50).map(text)); };
  list('Incomplete:', incomplete, i => `- ${i.run}: \`${i.id}\`: ${i.why}`);
  list('Teacher answers graded unlike their expectation:', answersUnexpected, a => `- ${a.run}: \`${a.id}\`: expected ${a.expected}, got ${a.got}`);
  list('Entries of answers.json that do not fit their cell:', answersMisfit, text => `- ${text}`);
  list('Labels of answers.json on no page of their corpus:', answersUnused, label => `- ${label}`);
  list('Teacher answers in courses that follow their branch (reported, not enforced):', answerNotes, text => `- ${text}`);
  list('Expected differences not found (remove them from the expectations):', stale, s => `- ${JSON.stringify(s)}`);
  list('Differences:', differences, d => '- `' + d.id + '`: ' + JSON.stringify(d).slice(0, 600));
  list('Expected differences:', accepted, d => `- \`${d.id}\` (${d.reason})`);
  fs.writeFileSync(path.join(out, 'report.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  const failed = differences.length || stale.length || incomplete.length || answersUnexpected.length || answersUnused.length || answersMisfit.length || fixtureMismatch.length || authoredFailing.length
    || (summary.captureConflicts && !strict);
  process.exit(failed ? 1 : 0);
}

module.exports = {parse, inventory, compare, readExpected, applyExpected, coverage, corpusOf, checkersWheel};
if (require.main === module) main().catch(error => { console.error(error); process.exit(2); });
