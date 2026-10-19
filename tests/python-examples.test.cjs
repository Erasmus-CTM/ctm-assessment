// Challenges the combined page's Python exercises with correct and plausible wrong programs.
// The Python that the browser runs (MODULE_PY) is taken from the installed
// py-exercise.js and executed with python3, one top-level test statement at a time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {browserPython, RUN, VARIANTS, cases: allCases} = require('./python-examples.cases.cjs');
const site = process.env.CTM_INTEGRATION_SITE || path.join(__dirname, '../.feedback-workspace/site/_site');
const runtimeFile = path.resolve(site, '../_extensions/py-exercise/py-exercise.js');

test('Python examples accept correct programs and reject plausible mistakes', {skip: !fs.existsSync(runtimeFile)}, () => {
  const source = fs.readFileSync(runtimeFile, 'utf8');
  const {found, list: cases} = allCases();
  assert.deepEqual(Object.keys(found).sort(), Object.keys(VARIANTS).sort());
  const python = spawnSync('python3', ['-c', RUN], {encoding: 'utf8',
    input: JSON.stringify({module: browserPython(source, 'MODULE_PY'),
      cases: cases.map(({code, tests, forbiddenImports, forbiddenKeywords}) => ({code, tests, forbiddenImports, forbiddenKeywords}))})});
  assert.equal(python.status, 0, python.stderr);
  const verdicts = JSON.parse(python.stdout);
  cases.forEach((c, i) => assert.equal(verdicts[i], c.expected, c.label + ': ' + c.name));
});
