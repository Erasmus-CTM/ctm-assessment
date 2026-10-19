// The cases of the parity harness. A rendered page is opened in jsdom with its
// own math-exercise.js and ctm-libs files (test mode, nothing starts by
// itself); every .math-exercise-cell is set up once per variant (pool task or
// generated variant) and gets responses: the answer keys, perturbations of
// each key, the audit's challenge answers for its label, and, for generated
// variants, their authored fixtures. The same page gives the same case list
// for every Pyodide version.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const scripts = require('../feedback/page-scripts.cjs');

const CHALLENGES = require('./challenges.json');
// Keys perturbed per variant: the first fields of a cell (a matrix has many).
const PERTURBED_FIELDS = 4;

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

function pageCases(file, relative) {
  const {w, api} = openPage(file, 'http://localhost/' + relative.split(path.sep).join('/'));
  const cases = [], skipped = [];
  try {
    const cells = [...w.document.querySelectorAll('.math-exercise-cell')];
    cells.forEach((original, position) => {
      const pristine = original.outerHTML, label = original.dataset.label || original.id;
      const base = {page: relative, position, label};
      if ((original.dataset.response || '').trim()) {
        skipped.push({...base, reason: 'response from ' + original.dataset.response});
        return;
      }
      let slot = original;
      for (const variant of variantsOf(original)) {
        const cell = prepare(w, api, slot, pristine, label, variant);
        slot = cell;
        const key = variantKey(variant), counts = {};
        const add = (kind, extra) => {
          counts[kind] = (counts[kind] || 0) + 1;
          cases.push({...base, variant: {kind: variant.kind, id: variant.id, index: variant.index}, variantKey: key, kind, ...extra,
            id: `${relative}#${position}:${label}|${key}|${kind}:${counts[kind] - 1}`});
        };
        const answers = fieldsOf(w, cell).map(el => (el ? el.dataset.answer ?? '' : ''));
        if (answers.length) {
          if (answers.every(answer => answer.trim())) add('response', {values: answers, source: 'keys'});
          answers.slice(0, PERTURBED_FIELDS).forEach((answer, i) => {
            if (!answer.trim()) return;
            for (const value of perturbations(answer)) add('response', {values: answers.map((a, j) => j === i ? value : a), source: 'perturbation'});
          });
          for (const values of CHALLENGES[label] || [])
            if (values.length === answers.length) add('response', {values, source: 'challenge'});
        }
        (variant.tests || []).forEach((fixture, index) => add('fixture', {fixture: index, name: fixture.name || '',
          expected: [].concat(fixture.expected ?? [])}));
        if (!Object.keys(counts).length) skipped.push({...base, variant: key, reason: answers.length ? 'no answer keys (custom checker)' : 'no fields'});
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

module.exports = {openPage, variantsOf, variantKey, prepare, fieldsOf, perturbations, pageCases, pagesUnder, authoredSources};
