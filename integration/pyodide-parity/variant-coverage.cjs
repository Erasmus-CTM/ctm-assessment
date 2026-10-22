'use strict';
// Parameter recipes are compiled by the component's own producer, then graded
// as concrete fixtures by pageCases/worker. They are not standalone questions.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {isDeepStrictEqual} = require('node:util');

function compile(source, review, extension, wheel) {
  const python = process.env.CTM_PARITY_PYTHON || ['python3', 'python'].find(name => spawnSync(name, ['--version']).status === 0);
  if (!python) throw new Error('Variant fixture coverage needs the render machine\'s Python');
  const result = spawnSync(python, [path.join(extension, 'variants.py')], {
    input: JSON.stringify({source, review}), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: {...process.env, PYTHONUTF8: '1', ...(wheel ? {PYTHONPATH: [wheel, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)} : {})}});
  if (result.error || result.status !== 0) throw new Error('Variant fixture coverage: ' + (result.error || result.stderr));
  return JSON.parse(result.stdout);
}

function recipes(root, files) {
  const found = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/^```\{math-exercise\}\r?\n([\s\S]*?)^```[ \t]*$/gm)) {
      const source = match[1];
      if (/^#\|[ \t]*parameters:/m.test(source) && /^#\|[ \t]*tests:/m.test(source)) found.push({file, source});
    }
  }
  return found;
}

function verify(expected, rendered, cases) {
  const fail = why => { throw new Error(`${expected.file}#${expected.label}: variant fixture coverage: ${why}`); };
  if (!expected.label) fail('a recipe with tests needs a label');
  if (!rendered.length) fail('no rendered generated cell');
  for (const cell of rendered) {
    const manifest = cell.manifest;
    if (manifest.fingerprint !== expected.fingerprint) fail(`${cell.page}: source fingerprint differs`);
    const wanted = expected.variants.map(record => record.id).sort();
    const actual = manifest.variants.map(record => record.id).sort();
    if (!isDeepStrictEqual(actual, wanted)) fail(`${cell.page}: generated variant IDs differ`);
    for (const record of manifest.variants) {
      const recipe = expected.variants.find(item => item.id === record.id);
      if (!isDeepStrictEqual(record.tests, recipe.tests)) fail(`${cell.page} ${record.id}: concrete tests differ`);
      for (const [index, fixture] of recipe.tests.entries()) {
        const graded = cases.filter(c => c.page === cell.page && c.position === cell.position && c.kind === 'fixture'
          && c.variant.kind === 'generated' && c.variant.id === record.id && c.fixture === index);
        if (graded.length !== 1 || !isDeepStrictEqual(graded[0].expected, [].concat(fixture.expected ?? [])))
          fail(`${cell.page} ${record.id} test ${index + 1}: no matching grading case`);
      }
    }
  }
}

// Full source and concrete fixtures stay in the job/report. A recipe cannot
// disappear from standalone discovery without a corresponding rendered test.
function coverage(root, files, corpus, extension, wheel, rendered, cases) {
  return recipes(root, files).map(({file, source}) => {
    const initial = compile(source, true, extension, wheel);
    const label = initial.options.label;
    const cells = rendered.filter(cell => cell.corpus === corpus && cell.label === label);
    const variants = [];
    for (const review of new Set(cells.length ? cells.map(cell => Boolean(cell.manifest.review)) : [false])) {
      const expected = review ? initial : compile(source, false, extension, wheel);
      const group = cells.filter(cell => Boolean(cell.manifest.review) === review);
      verify({file, label, ...expected}, group, cases);
      variants.push({review, fingerprint: expected.fingerprint, variants: expected.variants.map(record => ({id: record.id, tests: record.tests})),
        pages: group.map(cell => ({page: cell.page, position: cell.position}))});
    }
    return {corpus, file, label, source, materializations: variants};
  });
}

function fixtureMismatches(job, runs, results) {
  return job.cases.filter(c => c.kind === 'fixture').map(c => ({c,
    got: runs.map(r => (results[r.name].get(c.id)?.results || []).map(x => x.status))}))
    .filter(({c, got}) => got.some(statuses => !isDeepStrictEqual(statuses, c.expected)))
    .map(({c, got}) => ({id: c.id, expected: c.expected, got}));
}

module.exports = {compile, recipes, verify, coverage, fixtureMismatches};
