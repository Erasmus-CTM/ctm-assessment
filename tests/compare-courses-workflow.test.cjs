// Course PRs reuse the umbrella implementation while keeping its refs separate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const workflow = yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows/compare-courses.yml'), 'utf8'));
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const SHA = {tools: '1'.repeat(40), course: '2'.repeat(40), courseBase: 'a0a34ee508fdd4d00e78e7ea782b00a343fcf682',
  package: '3d9ebd94565ca302724dc619092ad9d043c1497f', packageBase: '4'.repeat(40)};
const inputs = {'tooling-ref': SHA.tools, course: 'aacchhee/ingmat3a_ntnu', 'course-ref': SHA.course,
  'course-base-ref': SHA.courseBase, base: 'pin', head: SHA.package, convert: false,
  expect: 'step4-migration.yml', browser: true, browsers: 'chromium firefox webkit', shards: '4', 'review-refs': ''};
const github = {repository: 'aacchhee/ingmat3a_ntnu', event_name: 'pull_request', sha: 'synthetic-course-merge',
  event: {pull_request: {base: {sha: SHA.courseBase}, head: {sha: SHA.course}}}};

function value(expression, context) {
  // The refs under test use GHA's &&/||/! string expressions, which have
  // equivalent truthiness here. Do not run workflow shell code in this test.
  return vm.runInNewContext(expression.slice(3, -3), context);
}
function matrixFor(event, supplied) {
  const step = workflow.jobs.courses.steps.find(item => item.id === 'list');
  const context = {inputs: supplied, github: {...github, event_name: event}};
  const env = {...process.env};
  delete env.GITHUB_OUTPUT;
  for (const [name, expression] of Object.entries(step.env)) {
    const resolved = value(expression, context);
    env[name] = resolved == null ? '' : String(resolved);
  }
  const result = spawnSync(python, ['tools/ci/compare-matrix.py'], {cwd: ROOT, env, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return Object.fromEntries(result.stdout.trim().split('\n').filter(line => /^(matrix|browsers|engines)=/.test(line))
    .map(line => [line.slice(0, line.indexOf('=')), JSON.parse(line.slice(line.indexOf('=') + 1))]));
}

test('reusable contract requires explicit tooling, course head and package refs', () => {
  const contract = workflow.on.workflow_call.inputs;
  for (const name of ['tooling-ref', 'course', 'course-ref', 'base', 'head']) {
    assert.equal(contract[name].required, true, name);
    assert.equal(contract[name].type, 'string', name);
  }
  for (const [name, input] of Object.entries(contract)) {
    if (name === 'tooling-ref') continue;
    assert.ok(workflow.on.workflow_dispatch.inputs[name], name);
    if (!input.required) assert.equal(input.default, workflow.on.workflow_dispatch.inputs[name].default, name);
  }
});

test('a course PR makes one actual-source comparison and four shards in all three engines', () => {
  const result = matrixFor('pull_request', inputs);
  assert.equal(result.matrix.length, 1);
  const entry = result.matrix[0];
  assert.equal(entry.course, inputs.course);
  assert.equal(entry.ref, SHA.course);
  assert.equal(entry.base_ref, SHA.courseBase);
  assert.equal(entry.base, 'pin');
  assert.equal(entry.head, SHA.package);
  assert.equal(entry.convert, false);
  assert.equal(entry.expect, 'step4-migration.yml');
  assert.equal(entry.informational, false);
  assert.deepEqual(result.browsers.map(item => item.shard), ['1/4', '2/4', '3/4', '4/4']);
  assert.deepEqual(result.engines, ['chromium', 'firefox', 'webkit']);
  assert.ok(entry.key.includes(SHA.course), 'artifacts identify the actual course head');
});

test('dispatch retains its existing single-course defaults', () => {
  const supplied = Object.fromEntries(Object.entries(workflow.on.workflow_dispatch.inputs).map(([name, entry]) => [name, entry.default]));
  const result = matrixFor('workflow_dispatch', supplied);
  assert.equal(result.matrix.length, 1);
  assert.equal(result.matrix[0].course, 'aacchhee/ctm-demo');
  assert.equal(result.matrix[0].ref, 'main');
  assert.equal(result.matrix[0].base, 'pin');
  assert.equal(result.matrix[0].convert, false);
  assert.deepEqual(result.browsers, []);
});

test('package refs cannot come from the caller course PR', () => {
  const env = workflow.jobs.compare.env;
  const context = {inputs, github, matrix: {base: 'pin', head: SHA.package}};
  assert.equal(value(env.BASE, context), 'pin');
  assert.equal(value(env.HEAD, context), SHA.package);
  assert.equal(value(env.PR_BASE, context), '');
  // Even a missing matrix field must never fall back to a course SHA.
  context.matrix = {};
  assert.equal(value(env.BASE, context), 'main');
  assert.equal(value(env.HEAD, context), SHA.tools);
  const checkout = workflow.jobs.compare.steps.find(step => step.name === 'Check out ctm-assessment before and after');
  assert.ok(checkout.run.includes('https://github.com/$UMBRELLA_REPOSITORY.git'));
  assert.ok(!checkout.run.includes('github.repository'));
  assert.equal(workflow.env.UMBRELLA_REPOSITORY, 'Erasmus-CTM/ctm-assessment');
});

test('umbrella PR defaults still use the package PR base and head', () => {
  const context = {inputs: {}, github: {...github, repository: 'Erasmus-CTM/ctm-assessment',
    event: {pull_request: {base: {sha: SHA.packageBase}, head: {sha: SHA.package}}}}, matrix: {}};
  assert.equal(value(workflow.jobs.compare.env.BASE, context), SHA.packageBase);
  assert.equal(value(workflow.jobs.compare.env.HEAD, context), SHA.package);
  assert.equal(value(workflow.jobs.compare.env.PR_BASE, context), SHA.packageBase);
});

test('every job checks out the umbrella tools and retains first-visit and reveal checks', () => {
  for (const job of Object.values(workflow.jobs)) {
    const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.repository, 'Erasmus-CTM/ctm-assessment');
    assert.equal(value(checkout.with.ref, {inputs}), SHA.tools);
    assert.equal(value(checkout.with.ref, {inputs: {}}), undefined);
    assert.equal(checkout.with['persist-credentials'], false);
  }
  const commands = workflow.jobs.browser.steps.map(step => step.run || '').join('\n');
  assert.ok(commands.includes('--first-visit --checks links'));
  assert.ok(commands.includes('--reveal-ends'));
  assert.ok(commands.includes('--expect tools/compare-rendered/expect/step4-migration.yml'));
  const compare = workflow.jobs.compare.steps.find(step => step.id === 'compare').run;
  for (const file of ['step2.yml', 'step3.yml', 'step4.yml']) assert.ok(compare.includes('/expect/' + file));
  assert.ok(compare.includes('/expect/$name.yml'));
});
