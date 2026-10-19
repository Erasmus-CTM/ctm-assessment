// The example site moved to the new policy keys (A2): `policy-files` adds up
// across project and page, `policy` selects (the nearest setting wins).
// feedback/page.yml's practice-feedback extends course-feedback, so every
// activity and exercise of the example page keeps the effective policy it had
// with project-policy, page-policy and page-policy-files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const site = process.env.CTM_INTEGRATION_SITE;
const INTEGRATIONS = ['plain-text', 'math-exercise', 'py-exercise', 'pyodide-interaktiv'];
// feedback/page.yml before the migration.
const OLD_PAGE_YML = 'ai-feedback:\n  policies:\n    practice-feedback:\n      max-words: 160\n    brief-practice:\n      extends: practice-feedback\n      max-words: 80\n';

// The page's policy configuration and its selections, per integration.
function read(file) {
  const w = new JSDOM(fs.readFileSync(file, 'utf8'), {runScripts: 'outside-only'}).window;
  w.eval(fs.readFileSync(path.join(path.dirname(site), '_extensions/ctm-libs/feedback/feedback-core.js'), 'utf8'));
  for (const script of w.document.scripts)
    if (/window\.__aiFeedbackPolicies =|\(window\.__pyExercises =|globalThis\.qpyodideCellDetails =/.test(script.textContent)) w.eval(script.textContent);
  const selections = {
    'plain-text': [...w.document.querySelectorAll('script.ai-feedback-data')].map(s => JSON.parse(s.textContent).policySelection),
    'math-exercise': [...w.document.querySelectorAll('.math-exercise-cell')].map(c => JSON.parse(c.dataset.feedbackPolicy)),
    'py-exercise': (w.__pyExercises || []).map(e => e.policySelection),
    'pyodide-interaktiv': (w.qpyodideCellDetails || []).map(c => c.options.policySelection),
  };
  return {w, config: JSON.parse(JSON.stringify(w.__aiFeedbackPolicies)), selections};
}

test('the example page keeps every effective policy after the move to policy-files and policy', {skip: !site}, () => {
  const dir = fs.mkdtempSync(path.join(path.dirname(path.dirname(site)), 'example-policies-'));
  try {
    // The examples' policy setup before the migration, rendered with the same package.
    const root = path.resolve(__dirname, '..', '..');
    fs.cpSync(path.join(path.dirname(site), '_extensions'), path.join(dir, '_extensions'), {recursive: true});
    fs.mkdirSync(path.join(dir, 'feedback'));
    fs.copyFileSync(path.join(root, 'feedback.yml'), path.join(dir, 'feedback.yml'));
    fs.copyFileSync(path.join(root, 'feedback/comparison.yml'), path.join(dir, 'feedback/comparison.yml'));
    fs.writeFileSync(path.join(dir, 'feedback/page.yml'), OLD_PAGE_YML);
    fs.writeFileSync(path.join(dir, '_quarto.yml'), 'project:\n  type: default\n  render: [old.qmd]\nfilters: [ctm-assessment]\n'
      + 'ai-feedback:\n  policy-files: feedback.yml\n  project-policy: course-feedback\n  mode: copy\n');
    fs.writeFileSync(path.join(dir, 'old.qmd'), '---\nformat: html\nai-feedback:\n  page-policy: practice-feedback\n'
      + '  page-policy-files: [feedback/page.yml, feedback/comparison.yml]\n---\n\n::: {.ai-feedback}\nExplain a half.\n:::\n');
    const render = spawnSync(process.env.QUARTO_BIN || 'quarto', ['render'], {cwd: dir, encoding: 'utf8', timeout: 120000});
    assert.equal(render.status, 0, render.stderr);
    assert.match(render.stderr, /page-policy-files \(in old\.qmd\) is deprecated/);
    const before = read(path.join(dir, 'old.html'));
    const after = read(path.join(site, 'example.html'));
    assert.equal(after.config.projectPolicy, 'practice-feedback');
    assert.equal(after.config.pagePolicy, undefined);
    let compared = 0;
    for (const integration of INTEGRATIONS) {
      const selections = [{}, ...after.selections[integration].filter(Boolean)];
      assert.ok(selections.length > 1, integration + ' has selections on the example page');
      for (const selection of selections) {
        const old = before.w.AIFeedback.explainPolicy(integration, 'en', before.config, selection);
        const now = after.w.AIFeedback.explainPolicy(integration, 'en', after.config, selection);
        // Plain data: the two pages' objects come from different windows (realms).
        assert.deepEqual(JSON.parse(JSON.stringify(now.policy)), JSON.parse(JSON.stringify(old.policy)), `${integration} ${JSON.stringify(selection)}`);
        compared++;
      }
    }
    // The page's policy is practice-feedback extending the project's course-feedback.
    const chain = after.w.AIFeedback.explainPolicy('math-exercise', 'en', after.config).scopes.flatMap(scope => scope.chain);
    assert.ok(chain.includes('course-feedback') && chain.includes('practice-feedback'), JSON.stringify(chain));
    assert.ok(compared >= 20, 'compared ' + compared);
    before.w.close(); after.w.close();
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
