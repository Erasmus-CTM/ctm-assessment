const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {recipes, verify, coverage, fixtureMismatches} = require('../integration/pyodide-parity/variant-coverage.cjs');

const expected = {file: 'triangle.qmd', label: 'triangle', fingerprint: 'source-hash', variants: [
  {id: 'v-ab3-offset1', tests: [{name: 'exact', answers: ['4/sqrt(3^2+4^2)'], expected: 'correct'},
    {name: 'rounded', answers: ['0.800'], expected: 'correct'}]},
  {id: 'v-ab4-offset1', tests: [{name: 'exact', answers: ['5/sqrt(4^2+5^2)'], expected: 'correct'},
    {name: 'rounded', answers: ['0.781'], expected: 'correct'}]}]};
const rendered = () => [{page: 'examples.html', position: 0, label: expected.label,
  manifest: {fingerprint: expected.fingerprint, variants: structuredClone(expected.variants)}}];
const cases = () => expected.variants.flatMap(record => record.tests.map((fixture, index) => ({
  id: `${record.id}:${index}`, page: 'examples.html', position: 0, label: expected.label, kind: 'fixture',
  variant: {kind: 'generated', id: record.id}, fixture: index, expected: [fixture.expected]})));

test('every materialized variant and each full concrete fixture must match the source producer', () => {
  verify(expected, rendered(), cases());
  for (const change of [
    cells => cells[0].manifest.variants.pop(),
    cells => cells[0].manifest.variants[1].tests.pop(),
    cells => { cells[0].manifest.variants[1].tests[0].answers = ['0']; },
    cells => { cells[0].manifest.variants[1].tests[0].expected = 'wrong'; },
    cells => { cells[0].manifest.fingerprint = 'stale'; }
  ]) {
    const cells = rendered(); change(cells);
    assert.throws(() => verify(expected, cells, cases()), /variant fixture coverage/);
  }
  assert.throws(() => verify(expected, [], cases()), /no rendered generated cell/);
  assert.throws(() => verify(expected, rendered(), cases().slice(0, -1)), /no matching grading case/);
});

test('ordinary authored blocks remain separate from raw parameter recipes in a mixed source file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-recipes-'));
  try {
    fs.writeFileSync(path.join(dir, 'mixed.qmd'), [
      '```{math-exercise}', '#| label: ordinary', '#| tests:', '#|   - answers: [2]', '#|     expect: correct', '_[2]', '```',
      '```{math-exercise}', '#| label: triangle', '#| parameters:', '#|   ab: [3, 4]', '#| derived:', '#|   bc: ab + 1',
      '#| tests:', "#|   - answers: ['{{bc}}']", '#|     expected: correct', '_[{{bc}}]', '```'].join('\n'));
    const found = recipes(dir, ['mixed.qmd']);
    assert.equal(found.length, 1);
    assert.match(found[0].source, /derived:/);
    assert.doesNotMatch(found[0].source, /label: ordinary/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('identical wrong fixture grades in both runs still violate their authored expectation', () => {
  const job = {cases: cases()}, runs = [{name: 'base'}, {name: 'head'}];
  const records = () => new Map(job.cases.map(c => [c.id, {results: [{status: 'correct'}]}]));
  const results = {base: records(), head: records()};
  assert.deepEqual(fixtureMismatches(job, runs, results), []);
  for (const run of runs) results[run.name].get(job.cases[0].id).results[0].status = 'wrong';
  assert.deepEqual(fixtureMismatches(job, runs, results), [{id: job.cases[0].id, expected: ['correct'], got: [['wrong'], ['wrong']]}]);
});

// The combined gate supplies a real installed package and rendered math site.
// This exercises the source producer, real page adapter and real Pyodide wheel.
if (process.env.CTM_PARITY_VARIANT_BUILD) test('real numeric/derived triangle: every concrete case passes; dropped and bad fixtures fail', async () => {
  const {pageCases, pagesUnder, openPage, prepare} = require('../integration/pyodide-parity/cases.cjs');
  const {checkersWheel} = require('../integration/pyodide-parity/run.cjs');
  const {boot} = require('../integration/pyodide-parity/runtime.cjs');
  const {ensureWheels} = require('../integration/pyodide-parity/wheels.cjs');
  const build = path.resolve(process.env.CTM_PARITY_VARIANT_BUILD);
  const built = JSON.parse(fs.readFileSync(path.join(build, 'corpora-built.json'), 'utf8'));
  const extensions = path.resolve(build, built.extensions), extension = path.join(extensions, 'math-exercise');
  const source = path.resolve(build, built.sources.find(tree => tree.name === 'math-exercise').dir);
  const site = path.resolve(build, built.sites.find(tree => tree.name === 'math-exercise').dir);
  const file = pagesUnder(site).find(file => fs.readFileSync(path.join(site, file), 'utf8').includes('data-label="variant-triangle"'));
  assert.ok(file, 'triangle is rendered');
  const absolute = path.join(site, file), relative = 'math-exercise/' + file.split(path.sep).join('/');
  const found = pageCases(absolute, relative);
  const cells = found.generated.filter(cell => cell.label === 'variant-triangle').map(cell => ({...cell, corpus: 'math-exercise'}));
  const triangleCases = found.cases.filter(c => c.label === 'variant-triangle' && c.kind === 'fixture');
  const recipe = coverage(source, ['_includes/variants/triangle.qmd'], 'math-exercise', extension, checkersWheel(extensions), cells, triangleCases)[0];
  assert.match(recipe.source, /derived:/);
  assert.equal(recipe.materializations[0].variants.length, 6);
  assert.equal(triangleCases.length, 18);
  assert.ok(recipe.materializations[0].variants.every(record => !JSON.stringify(record.tests).includes('{{')));
  const damaged = structuredClone(cells);
  damaged[0].manifest.variants[0].tests.pop();
  assert.throws(() => coverage(source, ['_includes/variants/triangle.qmd'], 'math-exercise', extension, checkersWheel(extensions), damaged, triangleCases), /concrete tests differ/);
  assert.throws(() => coverage(source, ['_includes/variants/triangle.qmd'], 'math-exercise', extension, checkersWheel(extensions), cells, triangleCases.slice(0, -1)), /no matching grading case/);

  const wheels = await ensureWheels('0.28.3', path.resolve(build, '../variant-regression-wheels'));
  const {py} = await boot('0.28.3', wheels, 0);
  const {w, api} = openPage(absolute, 'http://localhost/' + relative, py);
  try {
    let slot = w.document.querySelectorAll('.math-exercise-cell')[cells[0].position];
    const pristine = slot.outerHTML, records = new Map();
    for (const [index, record] of cells[0].manifest.variants.entries()) {
      slot = prepare(w, api, slot, pristine, 'variant-triangle', {kind: 'generated', id: record.id, index});
      for (const c of triangleCases.filter(c => c.variant.id === record.id)) {
        const results = await slot.mathExercise.checkFixture(record, record.tests[c.fixture]);
        records.set(c.id, {results: Array.from(results)});
      }
    }
    const runs = [{name: 'actual'}], results = {actual: records};
    assert.deepEqual(fixtureMismatches({cases: triangleCases}, runs, results), []);
    const c = triangleCases[0], record = cells[0].manifest.variants[0];
    slot = prepare(w, api, slot, pristine, 'variant-triangle', {kind: 'generated', id: record.id, index: 0});
    const bad = {...record.tests[0], answers: ['0']};
    const badResults = await slot.mathExercise.checkFixture(record, bad);
    assert.deepEqual(Array.from(badResults, result => result.status), ['wrong']);
    records.set(c.id, {results: Array.from(badResults)});
    assert.equal(fixtureMismatches({cases: triangleCases}, runs, results).length, 1, 'real bad answer fails the same expectation gate as the CLI');
  } finally { w.close(); }
});
