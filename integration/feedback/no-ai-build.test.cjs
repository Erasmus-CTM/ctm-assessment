// P22: one source builds a site without AI feedback, with the package and every
// component (fixture: integration/feedback/no-ai), by `--profile no-ai`
// (ai-feedback: enabled: false) or CTM_FEEDBACK=off; and the example site.
// Nothing of AI feedback reaches the pages: no feedback files or styles, no
// configuration (asserted on the assignment `window.__aiFeedbackConfig =`:
// pyodide-interaktiv's inline script mentions root.__aiFeedbackConfig, §16.8),
// no activity data, no Feedback buttons, no criteria, starters or policy
// prompts. Activities keep their visible task. Pages that asked for feedback
// get one build message each; the render succeeds.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const page = require('./page-scripts.cjs');
const site = process.env.CTM_INTEGRATION_SITE;
const QUARTO = process.env.QUARTO_BIN || 'quarto';
const FIXTURE = path.join(__dirname, 'no-ai');
const MARKERS = /CRITERIA_MARKER_3381|STARTER_MARKER_6604|POLICY_MARKER_5126|STEP_MARKER_2087/;
const ABSENT = /window\.__aiFeedbackConfig =|window\.__aiFeedbackPolicies =|class="ai-feedback-data"|data-ai-feedback-context|data-ai-feedback-tex|math-feedback-btn|math-reconfig-btn|py-exercise-feedback|data-stack-feedback=|stack-feedback-button|ai-feedback-gear|ai-feedback-policy-summary/;
const FILES = /(^|\/)(ai-feedback-\d[^/]*|feedback-core\.js|feedback-dom\.js|ai-feedback\.js|ai-feedback\.css|py-exercise-feedback[^/]*)$/;

function project(source) {
  const dir = fs.mkdtempSync(path.join(path.dirname(path.dirname(site)), 'no-ai-'));
  fs.cpSync(source, dir, {recursive: true, filter: file => !/[\\/](_site|\.quarto)$/.test(file)});
  if (!fs.existsSync(path.join(dir, '_extensions'))) fs.cpSync(path.join(path.dirname(site), '_extensions'), path.join(dir, '_extensions'), {recursive: true});
  if (source === FIXTURE) {
    const workspace=path.dirname(path.dirname(site));
    const record=JSON.parse(fs.readFileSync(path.join(workspace,'resolved-repos.json')));
    fs.copyFileSync(path.join(workspace,'src','ctm-checkers-'+record.repositories['ctm-checkers'].commit.slice(0,12),
      'examples/stack/polynomial-expansion.xml'),path.join(dir,'question.xml'));
    fs.appendFileSync(path.join(dir,'all.qmd'),'\n```{#no-ai-stack .stack-question}\n#| label: no-ai-stack\n#| file: question.xml\n#| question: Expand a product (form-sensitive)\n#| feedback: true\n```\n');
  }
  return dir;
}
function render(dir, args = [], env = {}) {
  fs.rmSync(path.join(dir, '_site'), {recursive: true, force: true});
  fs.rmSync(path.join(dir, '.quarto'), {recursive: true, force: true});
  const result = spawnSync(QUARTO, ['render', ...args], {cwd: dir, encoding: 'utf8', timeout: 300000, env: {...process.env, CTM_VARIANTS:'review', ...env}});
  assert.equal(result.status, 0, result.stderr);
  return result.stderr.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
}
// Build messages per page: Quarto prints "[i/n] page.qmd" before each page.
function messages(stderr) {
  const pages = {};
  let page = null;
  for (const line of stderr.split('\n')) {
    const start = /^\[\d+\/\d+\] (\S+)/.exec(line);
    if (start) { page = start[1]; pages[page] = []; continue; }
    // "...(<reason>); shown as text, without automatic feedback (...): <names>. Left out on this page: <items>."
    // or, with nothing shown as text, "...(<reason>); left out on this page: <items>."
    const message = /AI feedback is off for this build \((.*?)\); (.*)\.$/.exec(line);
    if (message && page) pages[page].push({reason: message[1], items: message[2]});
  }
  return pages;
}
function output(dir) {
  return fs.readdirSync(path.join(dir, '_site'), {recursive: true}).map(String).map(name => name.split(path.sep).join('/'));
}
// pyodide-interaktiv (1.9 and later, consolidation step 3) writes none of the
// AI-only cell options without AI feedback, not even empty (E3): no task,
// feedback-policy or feedback-context key, so no hidden #| task: text; and no
// Pyodide feedback script.
const AI_ONLY = ['task', 'feedback-policy', 'feedback-context'];
// The Pyodide cells of a page (its settings script, evaluated), or [].
function pyodideCells(html) {
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(text => text.includes('globalThis.qpyodideCellDetails ='));
  if (!script) return [];
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(script, context);
  return context.qpyodideCellDetails;
}
function checkWithout(dir, pages, reason, stderr) {
  assert.deepEqual(output(dir).filter(name => FILES.test(name)), [], 'feedback files in the site');
  assert.ok(page.atLeast(path.join(dir, '_extensions'), 'pyodide-interaktiv', 1, 9), 'the package ships pyodide-interaktiv 1.9 or later');
  for (const name of pages) {
    const html = fs.readFileSync(path.join(dir, '_site', name.replace(/\.qmd$/, '.html')), 'utf8');
    assert.doesNotMatch(html, ABSENT, name);
    assert.doesNotMatch(html, MARKERS, name);
    assert.doesNotMatch(html, /Print two\.|qpyodide-feedback\.js|"policySelection"|"feedbackContext"/, name);
    for (const cell of pyodideCells(html)) assert.deepEqual(AI_ONLY.filter(key => key in cell.options), [], name + ': AI-only keys of cell ' + cell.id);
  }
  assert.ok(pyodideCells(fs.readFileSync(path.join(dir, '_site', 'all.html'), 'utf8')).length > 0, 'all.html has Pyodide cells');
  const html = fs.readFileSync(path.join(dir, '_site', 'all.html'), 'utf8');
  const doc = new JSDOM(html).window.document;
  const task = doc.querySelector('#essay');
  assert.equal(task.className, 'ai-feedback-task');
  assert.match(task.textContent, /Write two sentences about the notes/);
  assert.match(task.textContent, /Visible source text/);
  assert.equal(task.querySelectorAll('textarea, button, noscript').length, 0);
  assert.equal(doc.querySelectorAll('.math-exercise-cell').length, 1);
  assert.equal(doc.querySelectorAll('.math-check-btn').length, 1, 'math-exercise still checks answers');
  assert.equal(doc.querySelectorAll('.ctm-stack .stack-check').length,1,'STACK still checks answers');
  assert.equal(doc.querySelectorAll('.py-exercise-cell').length, 1);
  assert.deepEqual([...html.matchAll(/qpyodideFeedbackOptions = \{\s*enabled: (\w+)/g)].map(m => m[1]), ['false']);
  const config = [...doc.scripts].find(s => s.textContent.includes('window.__pyExerciseConfig ='));
  assert.equal(JSON.parse(config.textContent.replace(/^\s*window\.__pyExerciseConfig = /, '').replace(/;\s*$/, '')).feedback, false);
  // One message per page that asked for feedback; none for the plain page.
  const found = messages(stderr);
  assert.equal(found['all.qmd'].length, 1, stderr);
  assert.equal(found['all.qmd'][0].reason, reason);
  // The activity only AI feedback can assess: named and shown as text (ctm-libs' without-ai: text).
  assert.match(found['all.qmd'][0].items, /shown as text, without automatic feedback \(without-ai: text/);
  assert.match(found['all.qmd'][0].items, /py-exercise feedback/);
  assert.equal(found['asks.qmd'].length, 1, stderr);
  assert.match(found['asks.qmd'][0].items, /ai-feedback: enabled: true \(asks\.qmd\)/);
  assert.match(found['asks.qmd'][0].items, /math-exercise feedback/);
  assert.deepEqual(found['plain.qmd'], []);
}

test('a site with every component builds without AI feedback (profile and CTM_FEEDBACK=off)', {skip: !site}, () => {
  const dir = project(FIXTURE);
  try {
    const pages = ['all.qmd', 'asks.qmd', 'plain.qmd'];
    // The same source with AI feedback: the markers and the configuration are there.
    let stderr = render(dir);
    const full = fs.readFileSync(path.join(dir, '_site', 'all.html'), 'utf8');
    assert.match(full, /window\.__aiFeedbackConfig =/);
    assert.match(full, /CRITERIA_MARKER_3381/);
    assert.match(full, /math-feedback-btn/);
    assert.ok(output(dir).some(name => FILES.test(name)));
    assert.doesNotMatch(stderr, /AI feedback is off/);
    stderr = render(dir, ['--profile', 'no-ai']);
    checkWithout(dir, pages, 'ai-feedback: enabled: false (_quarto-no-ai.yml)', stderr);
    stderr = render(dir, [], {CTM_FEEDBACK: 'off'});
    checkWithout(dir, pages, 'CTM_FEEDBACK=off', stderr);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('the example site builds without AI feedback: no policy panels, criteria or starters', {skip: !site}, () => {
  // The builder's site folder holds the example sources and the package.
  const dir = project(path.dirname(site));
  try {
    fs.writeFileSync(path.join(dir, '_quarto-no-ai.yml'), 'ai-feedback:\n  enabled: false\n  without-ai: text\n');
    const stderr = render(dir, ['--profile', 'no-ai']);
    assert.match(stderr, /AI feedback is off for this build \(ai-feedback: enabled: false \(_quarto-no-ai\.yml\)\)/);
    assert.deepEqual(output(dir).filter(name => FILES.test(name)), []);
    const html = fs.readFileSync(path.join(dir, '_site', 'example.html'), 'utf8');
    assert.doesNotMatch(html, ABSENT);
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.querySelectorAll('details[data-source-kind="policy"]').length, 0);
    assert.ok(doc.querySelectorAll('details[data-source-kind="exercise"]').length >= 20, 'exercise source panels stay');
    assert.equal(doc.querySelectorAll('.ai-feedback-task').length, 7);
    // Every criterion and starter written in the examples, by its first line.
    const texts = [];
    for (const file of fs.readdirSync(path.join(dir, 'examples')).filter(name => name.endsWith('.qmd'))) {
      const source = fs.readFileSync(path.join(dir, 'examples', file), 'utf8');
      for (const [, body] of source.matchAll(/^::: \{\.feedback-(?:criteria|starter)\}\n([\s\S]*?)\n:::$/gm))
        texts.push(body.split('\n')[0].trim());
    }
    assert.ok(texts.length >= 10, 'criteria and starters found: ' + texts.length);
    const visible = doc.body.innerHTML;
    for (const text of texts) assert.ok(!visible.includes(text) && !html.includes(text), 'still on the page: ' + text);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('E3: a page with only Pyodide cells with #| task: builds without AI feedback, without-ai unset; the cells stay runnable', {skip: !site}, () => {
  // Such cells are runnable code, not exercises only AI can assess (ctm-libs'
  // without-ai rule counts none of them): the build neither stops nor names
  // Pyodide unless the project asked for its feedback.
  const dir = fs.mkdtempSync(path.join(path.dirname(path.dirname(site)), 'no-ai-pyodide-'));
  try {
    fs.cpSync(path.join(path.dirname(site), '_extensions'), path.join(dir, '_extensions'), {recursive: true});
    fs.writeFileSync(path.join(dir, '_quarto.yml'), 'project:\n  type: website\n  render: [cells.qmd]\nfilters: [ctm-assessment]\n');
    fs.writeFileSync(path.join(dir, '_quarto-no-ai.yml'), 'ai-feedback:\n  enabled: false\n');
    fs.writeFileSync(path.join(dir, 'cells.qmd'), '---\ntitle: Cells\n---\n\n```{pyodide-python}\n#| task: Print two.\nprint(0)\n```\n');
    const stderr = render(dir, ['--profile', 'no-ai']);
    // Nothing asked for feedback, so there is no build message at all.
    assert.doesNotMatch(stderr, /AI feedback is off|pyodide/i, stderr);
    const html = fs.readFileSync(path.join(dir, '_site', 'cells.html'), 'utf8');
    assert.doesNotMatch(html, /Print two\./);
    const cells = pyodideCells(html);
    assert.equal(cells.length, 1);
    assert.deepEqual(AI_ONLY.filter(key => key in cells[0].options), []);
    assert.deepEqual(output(dir).filter(name => FILES.test(name)), []);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
