// The cases of the parity harness. A rendered page is opened in jsdom with its
// own math-exercise.js and ctm-libs files (test mode, nothing starts by
// itself); every .math-exercise-cell is set up once per variant (pool task or
// generated variant) and gets responses:
// - cells with answer keys: the keys, perturbations of each key (for a custom
//   checker also of all keys at once), the audit's
//   challenge answers for its label, for numeric cells with decimal places,
//   significant figures or a tolerance boundary probes in their first two
//   variants (half-way values, answers at the tolerance; step-2 review S7),
//   and the variants' fixtures;
// - cells that decide without answer keys (custom checkers, dynamic matrices;
//   step-2 review finding 1 and S1): the teacher answers of answers.json with
//   the verdict each must get, the challenge answers, a fixed probe set in
//   the fields without a key, the responses its authored tests give the
//   checker (as the page would send them: text per field, shape and entries
//   per dynamic matrix), and the variants' fixtures;
// - cells whose response comes from a diagram (`data-response`): the teacher
//   answers of answers.json, the responses of its authored tests, and the
//   variants' fixtures.
// The same page gives the same case list for every Pyodide version and build.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const scripts = require('../feedback/page-scripts.cjs');

const CHALLENGES = require('./challenges.json');
const ANSWERS = require('./answers.json');   // by corpus
// Keys perturbed per variant: the first fields of a cell (a matrix has many).
const PERTURBED_FIELDS = 4;
// Variants of a cell that get boundary probes: they share the cell's
// comparison options, and a pool can have hundreds of variants.
const BOUNDARY_VARIANTS = 2;
// Probe answers for a field without an answer key: numbers, symbols,
// expressions, collections, a matrix, invalid input and a dunder (refused).
// A cell's keyless fields take them rotated, so each field gets every probe
// once and fields of one cell differ.
const PROBES = ['0', '1', '-1', '2', '1/2', '0.5', '-7/3', '3.14159', '1e-3', '100',
  'x', '-x', 'x + 1', '2*x', 'x^2', 'x**2 - 1', '(x + 1)*(x - 1)', 'y', 't', 'n',
  'sqrt(2)', 'pi', 'E', 'oo', 'sin(x)', 'exp(x)', 'log(x)',
  '[1, 2]', '(1, 2)', '{1, 2}', 'Matrix([[1, 0], [0, 1]])',
  'x +', '2 x', '1,5', 'abc def', '__import__("os")'];

// A page in test mode: math-exercise.js and ctm-libs' files evaluated in page
// order, cells set up only when asked. `mainPyodide`: the page's Python.
function openPage(file, url, mainPyodide) {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {url, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  w.__mathExerciseTestMode = true;
  w.AbortController = AbortController;
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  if (mainPyodide) w.mainPyodide = mainPyodide;
  // The harness already has the complete rendered document. Make parsed-content
  // initialization synchronous, so a queued layout callback cannot outlive close().
  Object.defineProperty(w.document, 'readyState', {value: 'interactive', configurable: true});
  w.document.addEventListener = () => {};   // no automatic cell set-up or preload
  w.console.warn = () => {};
  scripts.run(w, file, scripts.MATH);
  if (!w.__mathExerciseTestApi) throw new Error(file + ': math-exercise.js did not load');
  return {w, api: w.__mathExerciseTestApi};
}

function variantsOf(cell) {
  if (cell.dataset.variants) {
    return JSON.parse(cell.dataset.variants).variants.map((record, index) => ({kind: 'generated', id: record.id, index, tests: record.tests || []}));
  }
  if (cell.dataset.pool) return JSON.parse(cell.dataset.pool).map((task, index) => ({kind: 'pool', index}));
  return [{kind: 'single'}];
}
function variantKey(variant) {
  return variant.kind === 'generated' ? 'variant:' + variant.id : variant.kind === 'pool' ? 'task:' + variant.index : 'single';
}

// Sets up a fresh copy of a cell for one variant in place of `slot`.
function prepare(w, api, slot, pristine, label, variant) {
  const key = 'math-pool|' + w.location.pathname + '|' + label;
  w.sessionStorage.clear();
  if (variant.kind === 'generated') w.sessionStorage.setItem(key + '|id', variant.id);
  if (variant.kind === 'pool') w.sessionStorage.setItem(key, String(variant.index));
  const template = w.document.createElement('template');
  template.innerHTML = pristine;
  const cell = template.content.firstElementChild;
  slot.replaceWith(cell);
  // New ordinary pools use the canonical numbered deep link instead of the
  // retired positional session key. Older builds keep the session path above.
  const descriptors = JSON.parse(cell.dataset.storageVariants || '[]');
  const choice = variant.kind === 'pool' && descriptors[variant.index];
  const url = new URL(w.location.href);
  url.searchParams.delete('variant');
  if (choice && Number.isSafeInteger(choice.n) && choice.n > 0) url.searchParams.set('variant', label + ':' + choice.n);
  w.history.replaceState(null, '', url);
  api.setupCell(cell);
  if (variant.kind === 'generated' && cell.mathExercise && typeof cell.mathExercise.selectVariant === 'function') {
    cell.mathExercise.selectVariant(variant.id);
    if (cell.dataset.variantId !== variant.id) throw new Error('Parity did not select the exact generated variant: ' + variant.id);
  }
  return cell;
}

function fieldsOf(w, cell) {
  return JSON.parse(cell.dataset.fields || '[]').map(id => w.document.getElementById(id));
}
// The fields that are not entries of a dynamic matrix (the "text" fields).
const inDynamicMatrix = el => Boolean(el && el.closest('.math-dynamic-matrix-wrap'));

// A cell's dynamic matrices: name and the shapes the page lets a learner choose.
function dynamicMatrices(cell) {
  return [...cell.querySelectorAll('.math-dynamic-mat')].map(m => ({name: m.dataset.matrixName,
    rows: {min: Number(m.dataset.minRows), max: Number(m.dataset.maxRows)}, cols: {min: Number(m.dataset.minCols), max: Number(m.dataset.maxCols)}}));
}
// Why the page cannot hold this matrix value ('' when it can): a shape within
// the bounds, or the canonical empty matrix when an axis may reach zero, and
// a non-empty text per entry.
function matrixProblem(spec, value) {
  if (!value || !Number.isInteger(value.rows) || !Number.isInteger(value.cols) || !Array.isArray(value.raw) || value.raw.length !== value.rows * value.cols)
    return 'not a rows × cols list of entries';
  if (value.raw.some(entry => typeof entry !== 'string' || !entry.trim())) return 'an empty or non-text entry';
  const empty = value.rows === 0 || value.cols === 0;
  const inside = (n, axis) => (empty ? n >= 0 : n >= axis.min) && n <= axis.max;
  if (empty && spec.rows.min > 0 && spec.cols.min > 0) return 'empty, but neither axis may reach zero';
  if (!inside(value.rows, spec.rows) || !inside(value.cols, spec.cols))
    return `${value.rows} × ${value.cols} outside rows ${spec.rows.min}-${spec.rows.max}, columns ${spec.cols.min}-${spec.cols.max}`;
  return '';
}
// A response as the case of a cell without keys: `values` for the text fields
// and `matrices` for its dynamic matrices, or {problem} when the page cannot send it.
function pageShaped(cell, fields, values, matrices) {
  const dynamic = dynamicMatrices(cell);
  const text = fields.filter(el => !inDynamicMatrix(el)).length;
  if (!dynamic.length) {
    if (matrices && Object.keys(matrices).length) return {problem: 'matrices, but the cell has no dynamic matrix'};
    if (!Array.isArray(values) || values.length !== fields.length) return {problem: `${fields.length} values expected`};
  } else {
    values = values || [];
    if (!Array.isArray(values) || values.length !== text) return {problem: `${text} text values expected besides the dynamic matrices`};
    const names = Object.keys(matrices || {}).sort(), expected = dynamic.map(m => m.name).sort();
    if (JSON.stringify(names) !== JSON.stringify(expected)) return {problem: `dynamic matrices ${expected.join(', ')} expected, got ${names.join(', ') || 'none'}`};
    for (const spec of dynamic) {
      const problem = matrixProblem(spec, matrices[spec.name]);
      if (problem) return {problem: spec.name + ': ' + problem};
    }
  }
  if (values.some(value => typeof value !== 'string' || !value.trim())) return {problem: 'an empty or non-text value'};
  return dynamic.length ? {values, matrices: Object.fromEntries(dynamic.map(m => [m.name, matrices[m.name]]))} : {values};
}
// An authored test's response (worker.cjs: page-shaped JSON) as a case of a cell without keys.
function authoredCase(cell, fields, response) {
  if (!response || typeof response !== 'object' || response.kind !== 'expressions') return {problem: 'not an expressions response'};
  const dynamic = dynamicMatrices(cell).length;
  const inputs = response.inputs && typeof response.inputs === 'object' ? response.inputs : {};
  const matrices = Object.fromEntries(Object.entries(inputs).filter(([, item]) => item && item.type === 'matrix')
    .map(([name, item]) => [name, {rows: item.rows, cols: item.cols, raw: item.raw}]));
  // Tests of a cell with only dynamic matrices give the matrices; the page adds the entries' text itself.
  const raw = Array.isArray(response.raw) ? response.raw : [];
  const text = fields.filter(el => !inDynamicMatrix(el)).length;
  return pageShaped(cell, fields, dynamic && !text ? [] : raw, matrices);
}

// Plausible wrong (or differently written) answers derived from a key.
function perturbations(answer) {
  const list = [`(${answer})+1`, `2*(${answer})`, `-(${answer})`];
  if (/^-?\d+(\.\d+)?$/.test(answer.trim())) {
    const value = Number(answer);
    list.push(String(value + (Number.isInteger(value) ? 0.5 : 0.001)));
    if (Number.isInteger(value)) list.push(answer.trim() + '.0');
  }
  return list;
}

// Decimal numbers for the boundary probes: {m, e} is m × 10^e (m a BigInt).
function decimal(text) {
  const match = /^([-+]?)(\d*)(?:\.(\d*))?(?:e([-+]?\d+))?$/i.exec(String(text).trim());
  if (!match || !(match[2] + (match[3] || ''))) return null;
  const fraction = match[3] || '';
  return {m: BigInt(match[1] + (match[2] + fraction || '0')), e: Number(match[4] || 0) - fraction.length};
}
// math-exercise's _round_places: the value's 15 significant digits, rounded
// to `places` decimal places, half away from zero.
function roundHalfUp(x, places) {
  const drop = -places - x.e;
  if (drop <= 0) return {m: x.m * 10n ** BigInt(-drop), e: -places};
  const unit = 10n ** BigInt(drop), negative = x.m < 0n, magnitude = negative ? -x.m : x.m;
  let q = magnitude / unit;
  if (2n * (magnitude % unit) >= unit) q += 1n;
  return {m: negative ? -q : q, e: -places};
}
function decimalText(x) {
  const negative = x.m < 0n;
  let digits = (negative ? -x.m : x.m).toString(), text;
  if (x.e >= 0) text = digits + '0'.repeat(x.e);
  else {
    digits = digits.padStart(-x.e + 1, '0');
    text = (digits.slice(0, x.e) + '.' + digits.slice(x.e)).replace(/\.?0+$/, '');
  }
  return (negative && /[1-9]/.test(text) ? '-' : '') + text;
}
const significant = text => text.replace(/^-/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length;
// A key's value: exact for a decimal literal or a ratio of integers (as SymPy
// evaluates it), approximate for an expression of numbers, pi and sqrt.
function keyValue(answer) {
  const text = String(answer).trim();
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text)) return {value: Number(text), exact: true};
  const ratio = /^([-+]?\d{1,15})\s*\/\s*(\d{1,15})$/.exec(text);
  if (ratio && Number(ratio[2]) !== 0) return {value: Number(ratio[1]) / Number(ratio[2]), exact: true};
  if (!/^(?:[\d\s.+\-*/()^]|pi|sqrt)+$/.test(text)) return null;
  try {
    const value = Function('"use strict"; return (' + text.replace(/\^/g, '**').replace(/pi/g, '(Math.PI)').replace(/sqrt/g, 'Math.sqrt') + ');')();
    return typeof value === 'number' && Number.isFinite(value) ? {value, exact: false} : null;
  } catch (_) { return null; }
}
const decimalPlacesFor = (value, figures) => figures - Math.floor(Math.log10(Math.abs(value))) - 1;
// Boundary probes for one key of a numeric cell (math-exercise's _num_equal:
// decimal places, else significant figures, else the tolerance): the two
// half-way values next to the key's rounding (one of them tells the tie rule),
// and the answers exactly at the tolerance (where the difference in binary
// equals it) and just inside and outside it.
function boundaryProbes(answer, {decplaces = '', sigfigs = '', tolerance = ''}) {
  const key = keyValue(answer);
  if (!key) return [];
  const probes = [];
  const integer = text => (/^\s*[-+]?\d+\s*$/.test(text) ? parseInt(text, 10) : null);
  if (decplaces.trim() || sigfigs.trim()) {
    const places = decplaces.trim() ? integer(decplaces) : integer(sigfigs);
    if (places === null || (!decplaces.trim() && key.value === 0)) return [];
    const d = decplaces.trim() ? places : decimalPlacesFor(key.value, places);
    const rounded = roundHalfUp(decimal(key.value.toPrecision(15)), d);
    for (const step of [-5n, 5n]) {
      const text = decimalText({m: rounded.m * 10n + step, e: rounded.e - 1});
      const value = Number(text);
      if (significant(text) > 15 || value === 0) continue;
      if (!decplaces.trim() && decimalPlacesFor(value, places) !== d) continue;   // a power of ten crossed
      probes.push(text);
    }
    return probes;
  }
  const spec = tolerance.trim();
  if (!spec) return [];
  const tol = spec.endsWith('%') ? Math.abs(key.value) * Number(spec.slice(0, -1)) / 100 : Number(spec);
  if (!Number.isFinite(tol) || tol <= 0) return [];
  for (const sign of [1, -1]) {
    const edge = key.value + sign * tol;
    const text = decimalText(decimal(String(edge)));
    if (key.exact && Math.abs(edge - key.value) === tol && Number(text) === edge && significant(text) <= 15) probes.push(text);
    for (const [factor, inside] of [[0.999, true], [1.001, false]]) {
      const near = decimalText(decimal(Number((key.value + sign * tol * factor).toPrecision(12)).toString()));
      const distance = Math.abs(Number(near) - key.value);
      if (inside ? distance < tol : distance > tol) probes.push(near);
    }
  }
  return [...new Set(probes)];
}

// The cases of one page. `authored`: the responses the authored tests of the
// page's source tree pass to each checker, by label (worker.cjs); `answers`:
// the teacher answers of the page's corpus (answers.json), by label. Returns
// the cases, the cell variants without anything to grade, every cell (for the
// coverage report), the authored responses that are not page-shaped and the
// teacher answers that do not fit their cell.
function pageCases(file, relative, authored = {}, answers = {}) {
  const {w, api} = openPage(file, 'http://localhost/' + relative.split(path.sep).join('/'));
  const cases = [], skipped = [], cells = [], unshaped = [], misfits = [], generated = [];
  try {
    [...w.document.querySelectorAll('.math-exercise-cell')].forEach((original, position) => {
      const pristine = original.outerHTML, label = original.dataset.label || original.id;
      const base = {page: relative, position, label};
      if (original.dataset.variants) generated.push({...base, manifest: JSON.parse(original.dataset.variants)});
      const diagram = (original.dataset.response || '').trim();
      const mode = original.dataset.mode || 'equivalent';
      const responses = authored[label] || [];
      const teacher = answers[label] || [];
      const info = {...base, mode, diagram: Boolean(diagram), keyless: false, variants: 0};
      cells.push(info);
      let slot = original, boundaryVariants = 0;
      for (const variant of variantsOf(original)) {
        const cell = prepare(w, api, slot, pristine, label, variant);
        slot = cell;
        info.variants++;
        const key = variantKey(variant), counts = {}, seen = new Set();
        // `probe`: a case of a cell that decides without keys or with a diagram
        // (its rows go to the custom-probes suite); identical responses once.
        const add = (kind, extra, probe = false) => {
          const content = JSON.stringify([kind, extra.values, extra.matrices, extra.payload, extra.fixture]);
          if (seen.has(content)) return;
          seen.add(content);
          counts[kind] = (counts[kind] || 0) + 1;
          cases.push({...base, variant: {kind: variant.kind, id: variant.id, index: variant.index}, variantKey: key, kind, ...extra,
            ...(probe ? {probe: true} : {}), id: `${relative}#${position}:${label}|${key}|${kind}:${counts[kind] - 1}`});
        };
        const fields = diagram ? [] : fieldsOf(w, cell);
        const keys = fields.map(el => (el ? el.dataset.answer ?? '' : ''));
        const dynamic = !diagram && dynamicMatrices(cell).length > 0;
        const keyless = !diagram && (dynamic || (keys.length > 0 && keys.some(answer => !answer.trim())));
        if (keyless) info.keyless = true;
        const custom = Boolean(diagram) || keyless;
        // Teacher answers first, so their expected verdicts stay with them.
        teacher.forEach((entry, index) => {
          if (entry.variant && entry.variant !== key) return;
          const misfit = problem => misfits.push({...base, variant: key, entry: index + 1, problem});
          if (!custom) return misfit('the cell has answer keys; answers.json is for cells without them');
          if (diagram) {
            if (!('payload' in entry)) return misfit('a diagram cell takes a payload');
            add('response', {payload: entry.payload, source: 'answer', expect: entry.expect}, true);
            return;
          }
          const shaped = pageShaped(cell, fields, entry.values, entry.matrices);
          if (shaped.problem) return misfit(shaped.problem);
          add('response', {...shaped, source: 'answer', expect: entry.expect}, true);
        });
        if (diagram) {
          // The diagram's response, as the authored tests give it to the checker.
          for (const payload of responses) add('response', {payload, source: 'authored'}, true);
        } else if (keyless) {
          for (const values of CHALLENGES[label] || [])
            if (!dynamic && values.length === keys.length) add('response', {values, source: 'challenge'}, true);
          // Keyless fields take the probes; fields with a key keep it.
          const blanks = keys.map((answer, i) => (answer.trim() ? -1 : i)).filter(i => i >= 0);
          if (blanks.length) PROBES.forEach((_, k) => add('response', {values: keys.map((a, i) => (a.trim() ? a : PROBES[(k + blanks.indexOf(i)) % PROBES.length])), source: 'probe'}, true));
          for (const response of responses) {
            const shaped = authoredCase(cell, fields, response);
            if (shaped.problem) unshaped.push({...base, variant: key, problem: shaped.problem});
            else add('response', {...shaped, source: 'authored'}, true);
          }
        } else if (keys.length) {
          add('response', {values: keys, source: 'keys'});
          keys.slice(0, PERTURBED_FIELDS).forEach((answer, i) => {
            for (const value of perturbations(answer)) add('response', {values: keys.map((a, j) => j === i ? value : a), source: 'perturbation'});
          });
          // A custom checker with keys gets every field wrong at once too (one
          // wrong field mostly earns partial credit).
          if (mode === 'custom' && keys.length > 1) add('response', {values: keys.map(answer => `(${answer})+1`), source: 'perturbation'});
          for (const values of CHALLENGES[label] || [])
            if (values.length === keys.length) add('response', {values, source: 'challenge'});
          if (mode === 'numeric' && boundaryVariants < BOUNDARY_VARIANTS) {
            const options = {decplaces: cell.dataset.decplaces, sigfigs: cell.dataset.sigfigs, tolerance: cell.dataset.tolerance};
            const probes = keys.map(answer => boundaryProbes(answer, options));
            probes.forEach((values, i) => {
              for (const value of values) add('response', {values: keys.map((a, j) => j === i ? value : a), source: 'boundary'});
            });
            if (probes.some(values => values.length)) boundaryVariants++;
          }
        }
        (variant.tests || []).forEach((fixture, index) => add('fixture', {fixture: index, name: fixture.name || '',
          expected: [].concat(fixture.expected ?? [])}, custom));
        if (!Object.keys(counts).length) skipped.push({...base, variant: key,
          reason: diagram ? 'response from ' + diagram + ' without teacher answers, authored tests or fixtures' : keys.length || dynamic ? 'no answer keys (custom checker)' : 'no fields'});
      }
    });
  } finally { w.close(); }
  return {cases, skipped, cells, unshaped, misfits, generated};
}

// Rendered HTML pages with math-exercise cells under `root` (a site folder).
function pagesUnder(root) {
  return fs.readdirSync(root, {recursive: true}).map(String)
    .filter(name => name.endsWith('.html') && !name.split(path.sep).includes('site_libs'))
    .filter(name => fs.readFileSync(path.join(root, name), 'utf8').includes('math-exercise-cell'))
    .sort();
}

// Source files with authored question tests (`#| tests:` in a math-exercise block).
function authoredSources(root) {
  return fs.readdirSync(root, {recursive: true}).map(String)
    .filter(name => name.endsWith('.qmd') && !name.split(/[\\/]/).some(part => part.startsWith('.') || ['_site', '_extensions', 'node_modules'].includes(part)))
    .filter(name => /^#\|\s*tests:\s*\S/m.test(fs.readFileSync(path.join(root, name), 'utf8')))
    .sort();
}

module.exports = {openPage, variantsOf, variantKey, prepare, fieldsOf, perturbations, pageCases, pagesUnder, authoredSources, PROBES,
  boundaryProbes, keyValue, pageShaped, matrixProblem, dynamicMatrices, ANSWERS};
