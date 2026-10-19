// Golden capture (step-2 design §6.2-6.4, §13): the grading calls the parity
// harness recorded at the runtime boundary become JSONL suites for
// ctm-checkers' golden tables.
//
// Rows: {"suite", "id", "call", "input", "output" | "by_python", "tags"} in
// canonical JSON (sorted keys, compact, non-ASCII as is), sorted by id, one
// row per line. `id` is the first 16 hex digits of the SHA-256 of the row's
// canonical {call, input}: identical requests are stored once. Outputs keep
// Python's JSON spelling (numbers as Python wrote them). An output that holds
// a Python error message (status "error", a "message", an error raised to
// the page, an authored test that does not pass) or that differs between the
// runtimes is stored per Python minor version ("by_python": {"3.12": ...,
// "3.13": ...}). Checker and test sources are stored once per corpus in
// sources-<corpus>.jsonl ({"sha256", "text"}) and referenced as
// {"$source": "<sha256>"}; a request number that JSON cannot hold is
// {"$float": "NaN"}.
//
// Suites per corpus: math_exercise/requests-<corpus> (answer keys,
// perturbations, challenge answers and variant fixtures of cells with keys),
// math_exercise/custom-probes-<corpus> (cells without keys or with a diagram
// response: probes, challenge answers, authored-test responses, fixtures) and
// math_exercise/authored-<corpus> (each `#| tests:` question: options,
// outcome, the result of every check() call, the responses it passed).
//
// Provenance (§13 item 7): only corpora marked `export` in corpora.json
// (math-exercise's own examples) are written under export/, for ctm-checkers
// to commit; every other corpus (the courses, the umbrella's example site)
// is written under umbrella/ and stays in the umbrella.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// A number as Python wrote it ("1.0" stays "1.0").
class Raw { constructor(text) { this.text = text; } }
function pythonJson(text) {
  return JSON.parse(text, (key, value, context) => (typeof value === 'number' && context && typeof context.source === 'string' ? new Raw(context.source) : value));
}
function canonical(value) {
  if (value instanceof Raw) return value.text;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : canonical({$float: String(value)});
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  throw new Error('Not JSON: ' + typeof value);
}
const sha256 = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const minor = python => (String(python).match(/\d+\.\d+/) || [String(python)])[0];

// Python's error messages vary between versions: such outputs are kept per version.
function hasMessage(value) {
  if (value instanceof Raw || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasMessage);
  if (value.status === 'error' || value.status === 'raised' || 'message' in value || 'raised' in value) return true;
  if (typeof value.outcome === 'string' && value.outcome !== 'pass') return true;
  return Object.values(value).some(hasMessage);
}

function collector() {
  const corpora = new Map();
  const corpus = name => {
    if (!corpora.has(name)) corpora.set(name, {rows: new Map(), sources: new Map()});
    return corpora.get(name);
  };
  // Sources (checkers, tests) by hash.
  const source = (store, text) => {
    if (typeof text !== 'string' || !text) return text;
    const hash = sha256(text);
    store.sources.set(hash, text);
    return {$source: hash};
  };
  function add(name, kind, call, input, output, python, tag) {
    const store = corpus(name);
    const key = canonical({call, input});
    const id = sha256(key).slice(0, 16);
    let row = store.rows.get(id);
    if (!row) store.rows.set(id, row = {id, call, input, outputs: new Map(), tags: new Set(), kinds: new Set()});
    row.kinds.add(kind);
    if (tag) row.tags.add(tag);
    const text = canonical(output);
    const previous = row.outputs.get(python);
    if (previous !== undefined && previous !== text) row.conflict = true;
    row.outputs.set(python, text);
  }
  return {
    // A math case's grading calls (one run).
    request(name, probe, tag, calls, python) {
      const store = corpus(name);
      for (const c of calls) {
        const input = {...c.input};
        if ('_math_checker' in input) input._math_checker = source(store, input._math_checker);
        const output = 'raised' in c ? {raised: c.raised} : (() => { try { return pythonJson(c.text); } catch (_) { return {$unparsed: c.text}; } })();
        add(name, probe ? 'custom-probes' : 'requests', c.call, input, output, python, tag);
      }
    },
    // An authored question (one run): the record as Python wrote it.
    authored(name, text, python) {
      const store = corpus(name);
      const record = pythonJson(text);
      const options = {...record.options};
      for (const key of ['checker', 'tests']) if (key in options) options[key] = source(store, options[key]);
      add(name, 'authored', 'authored', {options}, {outcome: record.outcome, calls: record.calls, responses: record.responses}, python, null);
    },
    // Suites: {corpus: {kind: [row lines]}, sources: {corpus: [lines]}}, conflicts.
    suites() {
      const out = {}, conflicts = [];
      for (const [name, store] of corpora) {
        const files = out[name] = {requests: [], 'custom-probes': [], authored: [], sources: []};
        for (const row of [...store.rows.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
          // A request seen for a keyed cell belongs to requests, else to custom-probes.
          const kind = row.kinds.has('authored') ? 'authored' : row.kinds.has('requests') ? 'requests' : 'custom-probes';
          const outputs = [...row.outputs.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
          const same = outputs.every(([, text]) => text === outputs[0][1]);
          const first = JSON.parse(outputs[0][1]);
          const line = {suite: 'math_exercise/' + kind + '-' + name, id: row.id, call: row.call, input: row.input, tags: [...row.tags].sort()};
          if (same && !hasMessage(first)) line.output = new RawJson(outputs[0][1]);
          else line.by_python = Object.fromEntries(outputs.map(([python, text]) => [python, new RawJson(text)]));
          if (row.conflict) conflicts.push({corpus: name, id: row.id});
          files[kind].push(canonicalRow(line));
        }
        files.sources = [...store.sources.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([hash, text]) => canonical({sha256: hash, text}));
      }
      return {suites: out, conflicts};
    },
  };
}
// An already canonical JSON text inside a row.
class RawJson { constructor(text) { this.text = text; } }
function canonicalRow(value) {
  if (value instanceof RawJson) return value.text;
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Raw)) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalRow(value[key])).join(',') + '}';
  }
  return canonical(value);
}

// Writes the suites under DIR/export and DIR/umbrella by provenance, with a
// manifest and a provenance notice.
function write(dir, suites, corpora, manifest) {
  const written = {};
  for (const [name, files] of Object.entries(suites)) {
    const info = corpora[name] || {};
    const side = info.export ? 'export' : 'umbrella';
    for (const [kind, lines] of Object.entries(files)) {
      if (!lines.length) continue;
      const file = path.join(side, 'math_exercise', `${kind}-${name}.jsonl`);
      fs.mkdirSync(path.join(dir, path.dirname(file)), {recursive: true});
      fs.writeFileSync(path.join(dir, file), lines.join('\n') + '\n');
      written[file.split(path.sep).join('/')] = {corpus: name, kind, rows: lines.length, export: Boolean(info.export), licence: info.licence || null};
    }
  }
  const full = {...manifest, files: written};
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(full, null, 1) + '\n');
  fs.writeFileSync(path.join(dir, 'PROVENANCE.md'), provenance(corpora, written));
  if (fs.existsSync(path.join(dir, 'export'))) fs.writeFileSync(path.join(dir, 'export', 'PROVENANCE.md'), provenance(corpora, written, 'export'));
  return full;
}

function provenance(corpora, written, only) {
  const lines = ['# Provenance of the captured golden rows', '',
    'Captured by the umbrella\'s parity harness (`integration/pyodide-parity/run.cjs --capture`) from rendered pages, at the runtime',
    'boundary of math-exercise.js. Rule (step-2 design §13 item 7): only rows from math-exercise\'s own examples (AGPL-3.0-or-later)',
    'go to ctm-checkers (`export/`); rows derived from courses and the umbrella\'s example site stay in the umbrella (`umbrella/`),',
    'generated in CI from the pinned repositories. STACK fixture rows are recorded in ctm-checkers itself and keep their',
    'GPL-3.0 licence file (`tests/native_compliance/COPYING.txt`) with a notice per suite.', '',
    '| File | Corpus | Rows | Source | Licence | Exported |', '|---|---|---|---|---|---|'];
  for (const [file, info] of Object.entries(written).sort()) {
    if (only === 'export' && !info.export) continue;
    const c = corpora[info.corpus] || {};
    lines.push(`| \`${only === 'export' ? file.replace(/^export\//, '') : file}\` | ${info.corpus} | ${info.rows} | ${c.repository || '?'}${c.commit ? ' @ `' + c.commit.slice(0, 12) + '`' : ''} | ${c.licence || '?'} | ${info.export ? 'yes' : 'no'} |`);
  }
  return lines.join('\n') + '\n';
}

module.exports = {Raw, pythonJson, canonical, sha256, minor, hasMessage, collector, write};
