// The cases of the parity harness. A rendered page is opened in jsdom with its
// own math-exercise.js and ctm-libs files (test mode, nothing starts by
// itself); every .math-exercise-cell is set up once per variant (pool task or
// generated variant) and gets responses: the answer keys, perturbations of
// each key, the audit's challenge answers for its label, and, for generated
// variants, their authored fixtures. Cells that decide without answer keys
// (custom checkers; step-2 review finding 1) get probes as well: fields
// without a key get a fixed probe set, and the responses that the cell's
// authored tests pass to its checker; a cell whose response comes from a
// diagram (`data-response`) gets those responses and its variants' fixtures.
// The same page gives the same case list for every Pyodide version and build.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const scripts = require('../feedback/page-scripts.cjs');

const CHALLENGES = require('./challenges.json');
// Keys perturbed per variant: the first fields of a cell (a matrix has many).
const PERTURBED_FIELDS = 4;
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
  if (mainPyodide) w.mainPyodide = mainPyodide;
  w.document.addEventListener = () => {};   // no DOMContentLoaded set-up, no preload
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
  api.setupCell(cell);
  return cell;
}

function fieldsOf(w, cell) {
  return JSON.parse(cell.dataset.fields || '[]').map(id => w.document.getElementById(id));
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

// `authored`: the responses the authored tests of the page's source tree
// pass to each checker, by label (JSON values; see worker.cjs).
function pageCases(file, relative, authored = {}) {
  const {w, api} = openPage(file, 'http://localhost/' + relative.split(path.sep).join('/'));
  const cases = [], skipped = [];
  try {
    const cells = [...w.document.querySelectorAll('.math-exercise-cell')];
    cells.forEach((original, position) => {
      const pristine = original.outerHTML, label = original.dataset.label || original.id;
      const base = {page: relative, position, label};
      const diagram = (original.dataset.response || '').trim();
      const responses = authored[label] || [];
      let slot = original;
      for (const variant of variantsOf(original)) {
        const cell = prepare(w, api, slot, pristine, label, variant);
        slot = cell;
        const key = variantKey(variant), counts = {};
        // `probe`: a case for a cell the harness could not grade before (no keys, or a diagram).
        const add = (kind, extra, probe = false) => {
          counts[kind] = (counts[kind] || 0) + 1;
          cases.push({...base, variant: {kind: variant.kind, id: variant.id, index: variant.index}, variantKey: key, kind, ...extra,
            ...(probe ? {probe: true} : {}), id: `${relative}#${position}:${label}|${key}|${kind}:${counts[kind] - 1}`});
        };
        const answers = diagram ? [] : fieldsOf(w, cell).map(el => (el ? el.dataset.answer ?? '' : ''));
        const keyless = answers.length > 0 && answers.some(answer => !answer.trim());
        if (diagram) {
          // The diagram's response, as the authored tests give it to the checker.
          for (const payload of responses) add('response', {payload, source: 'authored'}, true);
        } else if (answers.length) {
          if (!keyless) add('response', {values: answers, source: 'keys'});
          answers.slice(0, PERTURBED_FIELDS).forEach((answer, i) => {
            if (!answer.trim()) return;
            for (const value of perturbations(answer)) add('response', {values: answers.map((a, j) => j === i ? value : a), source: 'perturbation'});
          });
          for (const values of CHALLENGES[label] || [])
            if (values.length === answers.length) add('response', {values, source: 'challenge'}, keyless);
          if (keyless) {
            // Keyless fields take the probes; fields with a key keep it.
            const blanks = answers.map((answer, i) => (answer.trim() ? -1 : i)).filter(i => i >= 0);
            PROBES.forEach((_, k) => add('response', {values: answers.map((a, i) => (a.trim() ? a : PROBES[(k + blanks.indexOf(i)) % PROBES.length])), source: 'probe'}, true));
            for (const response of responses) {
              const raw = response && response.kind === 'expressions' && Array.isArray(response.raw) ? response.raw : null;
              if (raw && raw.length === answers.length && raw.every(value => typeof value === 'string' && value.trim()))
                add('response', {values: raw, source: 'authored'}, true);
            }
          }
        }
        (variant.tests || []).forEach((fixture, index) => add('fixture', {fixture: index, name: fixture.name || '',
          expected: [].concat(fixture.expected ?? [])}, Boolean(diagram)));
        if (!Object.keys(counts).length) skipped.push({...base, variant: key,
          reason: diagram ? 'response from ' + diagram + ' without authored tests or fixtures' : answers.length ? 'no answer keys (custom checker)' : 'no fields'});
      }
    });
  } finally { w.close(); }
  return {cases, skipped};
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

module.exports = {openPage, variantsOf, variantKey, prepare, fieldsOf, perturbations, pageCases, pagesUnder, authoredSources, PROBES};
