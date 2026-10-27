// The broad campaign is explicit; local source checks and main publication remain automatic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const yaml = require('js-yaml');
const ROOT = path.resolve(__dirname, '..');
const PHRASE = 'broad testing campaign';
const load = name => yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8'));
const needs = job => Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : [];
const manual = ['assets-board-inspection.yml', 'compare-assets-baseline.yml', 'measure-loading.yml',
  'offline-browser.yml', 'pyodide-cells-parity.yml', 'pyodide-parity.yml', 'quarto-versions.yml',
  'store-integration.yml'];
const mixed = {'assets.yml': ['official-metadata', 'archive-inspection', 'hook-provenance',
  'stdlib-availability', 'python-subset-candidate'], 'assets-board.yml': ['official-boards'],
  'assets-npm.yml': ['official-npm']};
function value(expression, context) {
  const source = expression.startsWith('${{') ? expression.slice(3, -2) : expression;
  return vm.runInNewContext(source, {cancelled: () => false, ...context});
}
function checkGuard(name) {
  const workflow = load(name), input = workflow.on.workflow_dispatch.inputs.confirmation;
  assert.equal(input.type, 'string', name);
  assert.equal(input.required, true, name);
  const guard = workflow.jobs.campaign;
  assert.deepEqual(guard.steps.map(step => step.uses).filter(Boolean), [], name + ': no checkout/download');
  assert.equal(guard.steps.length, 1, name);
  const step = guard.steps[0];
  assert.equal(step.env.CONFIRMATION, '${{ inputs.confirmation }}');
  // This exact quoted comparison precedes every broad job's dependency boundary.
  assert.ok(step.run.includes(`if [ "$CONFIRMATION" != '${PHRASE}' ]; then`), name);
  assert.ok(step.run.includes('exit 1'), name);
  assert.doesNotMatch(step.run, /checkout|curl|wget|npm|python|quarto|playwright/, name);
  return workflow;
}

test('every workflow is valid YAML with existing job dependencies', () => {
  for (const file of fs.readdirSync(path.join(ROOT, '.github/workflows')).filter(x => /\.ya?ml$/.test(x))) {
    const workflow = load(file);
    assert.ok(workflow.on && workflow.jobs, file);
    for (const [name, job] of Object.entries(workflow.jobs)) {
      for (const dependency of needs(job)) assert.ok(workflow.jobs[dependency], `${file}:${name} needs ${dependency}`);
    }
  }
});

test('broad-only workflows have no automatic triggers and fail an invalid confirmation cheaply', () => {
  for (const file of manual) {
    const workflow = checkGuard(file);
    assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'], file);
    assert.equal(workflow.jobs.campaign.if, undefined, file);
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (name !== 'campaign') assert.ok(needs(job).includes('campaign'), `${file}:${name}`);
    }
  }
});

test('asset contracts remain automatic while all official/network jobs require confirmation', () => {
  for (const [file, broadJobs] of Object.entries(mixed)) {
    const workflow = checkGuard(file);
    assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
    assert.deepEqual(workflow.on.push.branches, ['main'], file + ': a branch push runs only through its pull request');
    assert.equal(workflow.jobs.campaign.if, "github.event_name == 'workflow_dispatch'");
    for (const name of broadJobs) assert.ok(needs(workflow.jobs[name]).includes('campaign'), file + ':' + name);
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (name !== 'campaign' && !broadJobs.includes(name)) assert.ok(!needs(job).includes('campaign'), file + ':' + name);
    }
  }
});

test('reusable course API bypass is explicit; an invalid direct manual run cannot reach comparison', () => {
  const workflow = checkGuard('compare-courses.yml');
  assert.deepEqual(Object.keys(workflow.on).sort(), ['workflow_call', 'workflow_dispatch']);
  assert.equal(workflow.on.workflow_call.inputs.confirmation, undefined);
  assert.equal(workflow.on.workflow_dispatch.inputs['tooling-ref'], undefined,
    'direct dispatch must not impersonate the reusable call discriminator');
  for (const name of ['tooling-ref', 'course', 'course-ref', 'base', 'head']) assert.equal(workflow.on.workflow_call.inputs[name].required, true, name);
  assert.ok(needs(workflow.jobs.courses).includes('campaign'));
  const evaluate = (tooling, result) => Boolean(value(workflow.jobs.courses.if, {
    inputs: {'tooling-ref': tooling}, needs: {campaign: {result}}
  }));
  assert.equal(evaluate('', 'failure'), false);
  assert.equal(evaluate('', 'success'), true);
  assert.equal(evaluate('1'.repeat(40), 'skipped'), true);
  assert.ok(needs(workflow.jobs.compare).includes('courses'));
  assert.ok(needs(workflow.jobs.browser).includes('courses'));
});

test('main still renders and publishes; only a confirmed manual build runs the broad test tail', () => {
  const workflow = checkGuard('examples-pages.yml');
  assert.ok(Object.hasOwn(workflow.on, 'pull_request'));
  assert.ok(workflow.on.push.branches.includes('main'));
  assert.equal(workflow.jobs.source.if, undefined);
  assert.deepEqual(needs(workflow.jobs.build), ['source', 'campaign']);
  const evaluate = (event, ref, result, source = 'success', repin = '') => Boolean(value(workflow.jobs.build.if, {
    github: {event_name: event, ref}, needs: {source: {result: source, outputs: {repin}}, campaign: {result}}
  }));
  assert.equal(evaluate('push', 'refs/heads/main', 'skipped'), true);
  assert.equal(evaluate('pull_request', 'refs/pull/1/merge', 'skipped'), false);
  // A pull request that re-pins the package builds it and runs every component's tests.
  assert.equal(evaluate('pull_request', 'refs/pull/1/merge', 'skipped', 'success', 'true'), true);
  assert.equal(evaluate('pull_request', 'refs/pull/1/merge', 'skipped', 'failure', 'true'), false);
  assert.equal(workflow.jobs.source.outputs.repin, '${{ steps.changes.outputs.repin }}');
  const changes = workflow.jobs.source.steps.find(step => step.id === 'changes');
  assert.equal(changes.if, "github.event_name == 'pull_request'");
  for (const file of ['repos\\.json', 'setup-feedback-integration\\.py']) assert.ok(changes.run.includes(file), file);
  assert.equal(evaluate('push', 'refs/heads/feature/test', 'skipped'), false);
  assert.equal(evaluate('workflow_dispatch', 'refs/heads/feature/test', 'failure'), false);
  assert.equal(evaluate('workflow_dispatch', 'refs/heads/feature/test', 'success'), true);
  assert.equal(evaluate('push', 'refs/heads/main', 'skipped', 'failure'), false);
  const build = workflow.jobs.build.steps;
  const render = build.find(step => step.name === 'Render and exercise the examples').run;
  assert.ok(render.includes('tests=(); [ "${{ github.event_name }}" = push ] || tests=(--test)'));
  assert.ok(render.includes('"${tests[@]}"'));
  for (const name of ['Install Chromium', 'Test all five integration tabs']) assert.equal(build.find(step => step.name === name).if, "github.event_name == 'workflow_dispatch'");
  assert.equal(workflow.jobs.deploy.if, "github.ref == 'refs/heads/main' && github.event_name != 'pull_request'");
  assert.equal(workflow.jobs.deploy.needs, 'build');
  // The fast tier: every unit and source-contract test without Quarto, browser or download.
  assert.ok(workflow.jobs.source.steps.some(step => step.run === 'npm test'));
  assert.ok(workflow.jobs.source.steps.some(step => step.run === "python -m unittest discover -s tests -p 'test_*.py'"));
});

test('nightly branch-tip tracking runs without confirmation, warns only and never deploys', () => {
  const workflow = checkGuard('track-components.yml');
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.equal(workflow.on.schedule.length, 1);
  assert.deepEqual(workflow.permissions, {contents: 'read'});
  assert.equal(workflow.jobs.campaign.if, "github.event_name == 'workflow_dispatch'");
  const job = workflow.jobs['follow-branches'];
  assert.ok(needs(job).includes('campaign'));
  const evaluate = (event, result) => Boolean(value(job.if, {github: {event_name: event}, needs: {campaign: {result}}}));
  assert.equal(evaluate('schedule', 'skipped'), true);
  assert.equal(evaluate('workflow_dispatch', 'failure'), false);
  assert.equal(evaluate('workflow_dispatch', 'success'), true);
  assert.ok(job['timeout-minutes'] <= 40);
  assert.ok(job.steps.some(step => step.run === 'python3 tools/ci/check-component-pins.py' && step.if === 'always()'), 'pin report, warnings only');
  assert.ok(job.steps.every(step => !String(step.uses || '').includes('pages') && !String(step.run || '').includes('--strict')));
});

test('bounded default contracts remain automatic; dispatch refs and expected files stay explicit', () => {
  for (const file of ['assets-compose.yml', 'offline-server.yml', 'jsxgraph-renderer-calibration.yml']) {
    const on = load(file).on;
    assert.ok((Array.isArray(on) && on.includes('pull_request')) || Object.hasOwn(on, 'pull_request'), file);
    assert.ok(!Object.hasOwn(on, 'schedule'), file);
  }
  assert.equal(load('jsxgraph-renderer-calibration.yml').on.push, undefined);
  const baseline = load('compare-assets-baseline.yml');
  for (const name of ['examples', 'main-course', 'demo']) assert.equal(baseline.jobs[name].with['tooling-ref'], '${{ github.event.pull_request.head.sha || github.sha }}');
  const parity = load('pyodide-parity.yml');
  assert.ok(Object.hasOwn(parity.on.workflow_dispatch.inputs, 'base'));
  assert.ok(Object.hasOwn(parity.on.workflow_dispatch.inputs, 'expected'));
  assert.equal(parity.jobs.builds.if, "inputs.base != ''");
  const grade = parity.jobs.builds.steps.find(step => step.name === 'Grade every exercise of both builds under Pyodide 0.28.3');
  assert.equal(grade.env.EXPECTED, '${{ inputs.expected }}');
  assert.ok(grade.run.includes('[ ! -f "$EXPECTED" ]'));
});

test('the weekly campaign builds with every test and re-renders the demo site, warning only', () => {
  const workflow = checkGuard('weekly.yml');
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.equal(workflow.on.schedule.length, 1);
  assert.match(workflow.on.schedule[0].cron, /^\S+ \S+ \* \* [0-6]$/, 'once a week');
  assert.deepEqual(workflow.permissions, {contents: 'read'});
  assert.equal(workflow.jobs.campaign.if, "github.event_name == 'workflow_dispatch'");
  for (const name of ['examples', 'demo']) {
    const job = workflow.jobs[name];
    assert.ok(needs(job).includes('campaign'), name);
    const evaluate = (event, result) => Boolean(value(job.if, {github: {event_name: event}, needs: {campaign: {result}}}));
    assert.equal(evaluate('schedule', 'skipped'), true, name);
    assert.equal(evaluate('workflow_dispatch', 'failure'), false, name);
    assert.equal(evaluate('workflow_dispatch', 'success'), true, name);
  }
  assert.ok(workflow.jobs.examples.steps.some(step => step.run === 'python scripts/setup-feedback-integration.py --test'));
  assert.ok(workflow.jobs.examples.steps.some(step => step.run === 'npm run test:browser'));
  const demo = workflow.jobs.demo;
  assert.equal(demo.uses, './.github/workflows/compare-courses.yml');
  assert.deepEqual({course: demo.with.course, base: demo.with.base, head: demo.with.head, tooling: demo.with['tooling-ref']},
    {course: 'aacchhee/ctm-demo', base: 'pin', head: '${{ github.sha }}', tooling: '${{ github.sha }}'});
  assert.ok(!JSON.stringify(workflow).includes('pages'), 'never deploys');
});
