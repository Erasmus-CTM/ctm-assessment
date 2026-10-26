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

// The combined gate supplies the current native recipe and its exact receipt.
if (process.env.CTM_PARITY_VARIANT_BUILD) for (const fixture of [
  {source:'math-exercise', label:'variant-triangle', tests:3},
  {source:'umbrella', label:'similar-independence', tests:2}
]) test('native '+fixture.label+': real Pyodide replay passes and forged projections fail', async () => {
  const {boot} = require('../integration/pyodide-parity/runtime.cjs');
  const {ensureWheels} = require('../integration/pyodide-parity/wheels.cjs');
  const {AUTHORED} = require('../integration/pyodide-parity/authored.cjs');
  const build = path.resolve(process.env.CTM_PARITY_VARIANT_BUILD);
  const built = JSON.parse(fs.readFileSync(path.join(build, 'corpora-built.json')));
  const source = path.resolve(build, built.sources.find(tree => tree.name === fixture.source).dir);
  const receipt = JSON.parse(fs.readFileSync(path.join(source, '.ctm-parity-native.json')));
  const question = receipt.questions.find(q => q.label === fixture.label);
  assert.ok(question && question.records.length, fixture.label+' has a source-bound receipt');
  const extensions = path.resolve(build, built.extensions);
  const checkerDir = path.join(extensions, 'ctm-checkers');
  const manifest = JSON.parse(fs.readFileSync(path.join(checkerDir, 'checkers.json')));
  const wheels = await ensureWheels('0.28.3', path.resolve(build, '../variant-regression-wheels'));
  const {py} = await boot('0.28.3', wheels, 0);
  await py.loadPackage('sympy');
  py.FS.mkdirTree('/ctm-parity');
  py.FS.writeFile('/ctm-parity/authored_record.py', fs.readFileSync(path.join(__dirname, '../integration/pyodide-parity/authored_record.py')));
  const wheel = '/ctm-parity/' + manifest.wheel;
  py.FS.writeFile(wheel, fs.readFileSync(path.join(checkerDir, manifest.wheel)));
  py.globals.set('_ctm_parity_wheel', wheel);
  py.runPython(AUTHORED);
  const root = '/ctm-native-'+fixture.label;
  py.FS.mkdirTree(path.posix.dirname(root + '/' + question.file));
  py.FS.writeFile(root + '/' + question.file, fs.readFileSync(path.join(source, question.file)));
  const replay = value => {
    py.FS.writeFile(root + '/.ctm-parity-native.json', JSON.stringify({version:1,questions:[value]}));
    return JSON.parse(py.globals.get('_ctm_authored')(root,py.toPy([question.file]))).map(JSON.parse);
  };
  const [record] = replay(question);
  assert.equal(record.outcome,'pass');
  assert.equal(record.nativeCandidates.length, question.records.length);
  assert.ok(record.nativeCandidates.every(c => c.teacherChecked && c.authoredTests === fixture.tests));
  const forged=structuredClone(question), first=forged.records[0];
  first.teacherInputs[Object.keys(first.teacherInputs)[0]]='0';
  assert.throws(()=>replay(forged),/context\/options differ from tested data/);
  const changed=structuredClone(question);
  changed.sourceSHA256='0'.repeat(64);
  assert.throws(()=>replay(changed),/source changed after resolution/);
});
