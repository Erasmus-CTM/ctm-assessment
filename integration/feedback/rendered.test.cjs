const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const page = require('./page-scripts.cjs');
const site = process.env.CTM_INTEGRATION_SITE;
assert.ok(site, 'Run scripts/setup-feedback-integration.py --test first.');
const html = fs.readFileSync(path.join(site, 'example.html'), 'utf8');
// ctm-libs (formerly ai-feedback) holds the feedback files; AIFeedback.version is its version.
const libs = path.join(path.dirname(site), '_extensions', 'ctm-libs');
const sharedVersion = require(path.join(libs, 'feedback', 'feedback-core.js')).version;
const legacy = process.env.CTM_LEGACY_AI_FEEDBACK;  // ai-feedback 0.8.1, prepared by the builder

test('common page renders the active extensions and keeps local dependencies resolvable', () => {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll('.ai-feedback-activity').length, 7);
  assert.equal(doc.querySelectorAll('.math-exercise-cell').length, 8);
  assert.equal(doc.querySelectorAll('.py-exercise-cell').length, 6);
  assert.deepEqual([...doc.querySelectorAll('.panel-tabset > ul [role=tab]')].map(n => n.textContent.trim()), ['Plain text', 'Python', 'Mathematics', 'Pyodide', 'JSXGraph']);
  const panels = doc.querySelectorAll('.panel-tabset > .tab-content > .tab-pane');
  assert.equal(panels.length, 5);
  for (const kind of ['exercise', 'policy']) {
    assert.deepEqual([...panels].map(panel => panel.querySelectorAll(`details[data-source-kind="${kind}"]`).length), [6, 6, 7, 3, 2]);
  }
  assert.equal(doc.querySelectorAll('details[data-source-kind="jsxgraph"]').length, 2);
  assert.equal(doc.querySelectorAll('details.math-example-source[open]').length, 0);
  assert.equal(doc.querySelectorAll('details.math-example-source details').length, 0, 'Source panels must be siblings');
  for (const exercise of doc.querySelectorAll('details[data-source-kind="exercise"]')) {
    const group = exercise.parentElement;
    assert.ok(group.classList.contains('ai-feedback-ignore'));
    assert.equal(group.querySelectorAll('details[data-source-kind="exercise"]').length, 1);
    assert.equal(group.querySelectorAll('details[data-source-kind="policy"]').length, 1);
    assert.equal(exercise.querySelectorAll('code.language-yaml').length, 0);
    assert.doesNotMatch(exercise.textContent, /JXG\.JSXGraph|```\{\.jsxgraph/);
    const policy = group.querySelector('details[data-source-kind="policy"]');
    assert.equal(policy.querySelectorAll('code.language-markdown').length, 0);
    const names = [...policy.querySelectorAll('strong')].map(n => n.textContent);
    assert.deepEqual(names, ['AI Feedback defaults (feedback-defaults.yml)', 'feedback/page.yml', 'feedback/comparison.yml']);
    [...policy.querySelectorAll('code')].forEach((code, i) => {
      assert.equal(code.textContent, fs.readFileSync(path.join(site, '..', i === 0 ? '_extensions/ctm-libs/feedback/feedback-defaults.yml' : names[i]), 'utf8'));
    });
  }
  for (const diagram of doc.querySelectorAll('details[data-source-kind="jsxgraph"]')) {
    assert.match(diagram.textContent, /JXG\.QuartoAssessment\.register/);
    assert.doesNotMatch(diagram.textContent, /```\{math-exercise\}|\.ai-feedback|ai-feedback:\n/);
    assert.equal(diagram.parentElement.querySelectorAll('details').length, 3);
  }
  assert.equal(panels[0].querySelectorAll('.ai-feedback-activity').length, 6);
  assert.equal(panels[0].querySelectorAll('.math-exercise-cell').length, 0);
  assert.equal(panels[1].querySelectorAll('.py-exercise-cell').length, 6);
  assert.equal(panels[1].querySelectorAll('[id^="qpyodide-insertion-location-"]').length, 0);
  assert.ok(!fs.existsSync(path.join(site, 'py-exercise-example.html')), 'Python examples must use the same page');
  assert.equal(panels[3].querySelectorAll('[id^="qpyodide-insertion-location-"]').length, 3);
  for (const name of ['feedback-core.js', 'feedback-dom.js', 'ai-feedback.js']) {
    assert.equal([...doc.scripts].filter(s => s.src.endsWith('/' + name)).length, 1, name + ' must load once');
  }
  // D1: the components' scripts and ctm-libs' runtime are files, each loaded once, none inlined.
  for (const [name, file] of [['math-exercise', 'math-exercise.js'], ['py-exercise', 'py-exercise.js'], ['ctm-runtime', 'pyodide-runtime.js'],
    ['ctm-locale', 'ctm-locale.js'], ['ctm-locale-math-exercise', 'math-exercise.js'], ['ctm-locale-py-exercise', 'py-exercise.js']]) {
    assert.equal(page.scriptsOf(doc, name, file).length, 1, name + '/' + file + ' must load once');
  }
  for (const marker of ['var ME_CFG =', 'function setupExercise(exerciseData)']) {
    assert.equal([...doc.scripts].filter(s => !s.src && s.textContent.includes(marker)).length, 0, marker + ' must not be inlined');
  }
  for (const node of doc.querySelectorAll('script[src],link[rel="stylesheet"][href]')) {
    const resource = node.getAttribute('src') || node.getAttribute('href');
    if (/^(https?:|data:|\/\/)/.test(resource)) continue;
    assert.ok(fs.existsSync(path.resolve(site, resource.split('?')[0])), 'Missing ' + resource);
  }
  const record = JSON.parse(fs.readFileSync(path.join(site, 'resolved-repos.json'), 'utf8'));
  assert.deepEqual(Object.keys(record.repositories).sort(), ['ctm-assessment', 'ctm-checkers', 'ctm-libs', 'ctm-stack', 'jsxgraph', 'math-exercise', 'py-exercise', 'pyodide-interaktiv']);
  assert.equal(panels[2].querySelectorAll('.math-exercise-cell').length, 7);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'repos.json'), 'utf8'));
  for (const [name, source] of Object.entries(record.repositories)) {
    assert.equal(source.branch, manifest.repositories[name].branch);
    // A --follow-branches build (Track component branches) records branch tips.
    if (!record.follow_branches && !source.local_override && !source.ref_override && manifest.repositories[name].commit) {
      assert.equal(source.commit, manifest.repositories[name].commit);
      assert.equal(source.pinned, true, name);
    }
    if (!source.local_override && !source.ref_override && !manifest.repositories[name].commit) {
      assert.equal(source.requested_ref, manifest.repositories[name].branch);
      assert.equal(source.pinned, false);
    }
  }
  assert.ok(record.extension_sha256['py-exercise']['py-exercise-feedback.js']);
  for (const file of ['feedback-core.js','feedback-dom.js','ai-feedback.js','ai-feedback.css']) {
    assert.equal(record.extension_sha256['pyodide-interaktiv']['ai-feedback/'+file],undefined);
  }
  // ctm-libs packages its library only: the ai-feedback alias of 0.9 and 0.10
  // is no longer packaged (step 3, U3b), and no folder of that name is built.
  assert.deepEqual(record.repositories['ctm-libs'].extensions, ['ctm-libs']);
  assert.equal(record.extension_sha256['ai-feedback'], undefined);
  assert.ok(!fs.existsSync(path.join(path.dirname(site), '_extensions', 'ai-feedback')), 'no ai-feedback folder in the build');
  // pyodide-interaktiv 1.9 loads ctm-libs through the shared bootstrap; its loader is gone.
  assert.ok(record.extension_sha256['pyodide-interaktiv']['ctm-bootstrap.lua']);
  assert.equal(record.extension_sha256['pyodide-interaktiv']['feedback-loader.lua'], undefined);
  for (const file of ['feedback/feedback-core.js', 'lua/ctm.lua', 'runtime/pyodide-runtime.js', 'locales/ctm-locale.js', 'ctm-libs-end.lua'])
    assert.ok(record.extension_sha256['ctm-libs'][file], file);
  for (const [name, source] of Object.entries(record.repositories)) {
    assert.match(source.commit, /^[0-9a-f]{40}$/);
    for (const folder of source.extensions) assert.ok(Object.keys(record.extension_sha256[folder]).length > 0, folder);
  }
  // JSXGraph is the upstream extension, not a copy from another component.
  assert.ok(record.extension_sha256.jsxgraph['lua/jsxgraph.lua']);
  assert.ok(record.extension_sha256.jsxgraph['resources/js/jsxgraphcore.js']);
  dom.window.close();
});

test('shared text feedback works on the combined page without running Python or making API calls', async () => {
  const dom = new JSDOM(html, {url: 'https://integration.invalid/', runScripts: 'outside-only'});
  const w = dom.window;
  for (const script of w.document.scripts) if (script.textContent.includes('window.__aiFeedbackPolicies =')) w.eval(script.textContent);
  w.AbortController = AbortController;
  w.fetch = () => { throw new Error('Copy mode must not call a provider'); };
  for (const name of ['feedback-core.js', 'feedback-dom.js', 'ai-feedback.js']) {
    const script = [...w.document.scripts].find(s => s.src.endsWith('/' + name));
    w.eval(fs.readFileSync(path.resolve(site, script.getAttribute('src')), 'utf8'));
  }
  w.AIFeedback.initialize();
  const activity = w.document.querySelector('#spanish-writing');
  activity.querySelector('button').click();
  for (let i = 0; i < 20 && !activity.querySelector('pre'); i++) await new Promise(resolve => setImmediate(resolve));
  assert.match(activity.querySelector('pre').textContent, /Yo vive en Trondheim/);
  assert.doesNotMatch(activity.querySelector('pre').textContent, /assert add|submissionKey|integration-math/);
  assert.equal(w.document.querySelectorAll('dialog.ai-feedback-settings').length, 1);
  dom.window.close();
});

test('copied examples reproduce only their declared drafts, with complete linked applet source', () => {
  const {spawnSync} = require('node:child_process');
  const os = require('node:os');
  const doc = new JSDOM(html).window.document;
  const expected = {'integration-math':[''], 'practice-math-fields':['',''],
    'practice-math-vector':['',''], 'practice-math-matrix':['','','',''],
    'practice-math-basis':['','',''], 'policy-question':['3'], 'policy-worked':['3'],
    'integration-jsxgraph-length':['']};
  const snippets = Object.keys(expected).map(label => {
    const source = [...doc.querySelectorAll('details[data-source-kind="exercise"] code.language-markdown')]
      .find(code => code.textContent.includes('#| label: ' + label + '\n'));
    assert.ok(source, label);
    assert.doesNotMatch(source.textContent, /<script>|math-drafts|MutationObserver|const drafts/);
    if (label === 'integration-jsxgraph-length') {
      assert.doesNotMatch(source.textContent, /assessment_id=|JXG\.QuartoAssessment/);
      const diagram = source.closest('.example-author-notes').querySelector('details[data-source-kind="jsxgraph"] code');
      assert.match(diagram.textContent, /assessment_id="assessment-triangle"/);
      assert.match(diagram.textContent, /JXG.QuartoAssessment.register/);
      assert.match(source.textContent, /context: task-jsxgraph-math, jsxgraph:assessment-triangle/);
      assert.doesNotMatch(source.textContent, /practice-math-fields/);
    } else assert.doesNotMatch(source.textContent, /assessment-triangle|assessment-german-shapes/);
    const diagram = source.closest('.example-author-notes').querySelector('details[data-source-kind="jsxgraph"] code');
    return (diagram ? diagram.textContent + '\n\n' : '') + source.textContent;
  });
  const shapes = [...doc.querySelectorAll('details[data-source-kind="exercise"] code.language-markdown')]
    .find(code => code.textContent.includes('#german-shapes'));
  assert.doesNotMatch(shapes.textContent, /assessment_id=|JXG\.QuartoAssessment/);
  const shapeDiagram = shapes.closest('.example-author-notes').querySelector('details[data-source-kind="jsxgraph"] code');
  assert.match(shapeDiagram.textContent, /assessment_id="assessment-german-shapes"/);
  assert.match(shapeDiagram.textContent, /JXG.QuartoAssessment.register/);
  const shapeSource = shapeDiagram.textContent + '\n\n' + shapes.textContent;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-copied-source-'));
  let dom;
  try {
    const original = path.resolve(site, '..');
    fs.cpSync(path.join(original, '_extensions'), path.join(dir, '_extensions'), {recursive:true});
    fs.cpSync(path.join(original, 'feedback'), path.join(dir, 'feedback'), {recursive:true});
    fs.copyFileSync(path.join(original, 'feedback.yml'), path.join(dir, 'feedback.yml'));
    const metadata = '---\nformat: html\nfilters: [ctm-assessment]\nai-feedback:\n  policy-files: [feedback.yml, feedback/page.yml, feedback/comparison.yml]\n  policy: practice-feedback\n---\n\n';
    fs.writeFileSync(path.join(dir, 'copies.qmd'), metadata + snippets.join('\n\n') + '\n\n' + shapeSource +
      '\n\n```{math-exercise}\n#| label: ordinary-empty\nNo draft: _[42].\n```\n');
    const render = spawnSync('quarto', ['render','copies.qmd'], {cwd:dir,encoding:'utf8',timeout:120000});
    assert.equal(render.status,0,render.stderr || render.error?.message);
    const copies = path.join(dir,'copies.html');
    dom = new JSDOM(fs.readFileSync(copies,'utf8'), {url:'https://copies.invalid/',runScripts:'outside-only'});
    const w = dom.window; w.document.addEventListener = () => {}; w.AbortController = AbortController;
    w.__mathExerciseTestMode = true;
    // The page's files in page order: feedback, runtime, catalogues, matrix-input.js, math-exercise.js.
    page.run(w, copies, page.MATH);
    for (const cell of w.document.querySelectorAll('.math-exercise-cell')) {
      w.__mathExerciseTestApi.setupCell(cell);
      assert.deepEqual([...cell.querySelectorAll('.math-input')].map(field => field.value), expected[cell.dataset.label] || ['']);
      assert.equal(cell.hasAttribute('data-initial-values'), ['policy-question','policy-worked'].includes(cell.dataset.label), cell.dataset.label);
    }
    assert.equal(w.document.querySelector('[data-label="integration-math"] input').dataset.answer,'42');
    assert.equal(w.document.querySelectorAll('iframe').length,2);
  } finally {dom?.window.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('mathematics feedback excludes the author note from learning context', () => {
  const dom = new JSDOM(html, {url: 'https://integration.invalid/', runScripts: 'outside-only'});
  const w = dom.window;
  w.__mathExerciseTestMode = true;
  // Exercise the real resolver/prompt builder without starting consumer runtimes.
  w.document.addEventListener = () => {};
  page.run(w, path.join(site, 'example.html'), page.MATH);
  const cell = w.document.querySelector('.math-exercise-cell');
  const api = w.__mathExerciseTestApi;
  assert.equal(cell.dataset.contextMode, 'none');
  assert.equal(api.resolveContexts(cell).length, 0);
  const question = api.questionText(cell, [], () => 'Answer');
  const prompt = w.AIFeedback.buildPrompt(w.AIFeedback.applyPolicy('math-exercise', {profile:'mathematics', task:question, responses:[{id:'answer',value:'42'}], materials:api.resolveContexts(cell)}, 1));
  assert.match(prompt, /6.*7/);
  assert.match(prompt, /42/);
  assert.doesNotMatch(prompt, /For course authors|Feature:|shared adapter|legacy settings|learning_context/);
  dom.window.close();
});

test('Python practice keeps five incomplete starters and their tasks separate from author notes', () => {
  const dom = new JSDOM(html, {runScripts: 'outside-only'});
  const w = dom.window;
  for (const script of w.document.scripts) if (script.textContent.includes('window.__aiFeedbackPolicies =')) w.eval(script.textContent);
  // Only the declarative exercise data is evaluated, not the Python runtime.
  for (const script of w.document.scripts) {
    if (script.textContent.trim().startsWith('(window.__pyExercises =')) w.eval(script.textContent);
  }
  assert.equal(w.__pyExercises.length, 6);
  const practice = w.__pyExercises.filter(x => x.label.startsWith('practice-'));
  assert.equal(practice.length, 5);
  assert.equal(new Set(w.__pyExercises.map(x => x.label)).size, 6);
  assert.equal(w.document.querySelectorAll('.example-learner-task:has(.py-exercise-cell)').length, 5);
  for (const task of w.document.querySelectorAll('.example-learner-task:has(.py-exercise-cell)')) {
    assert.equal(task.querySelectorAll('.py-exercise-cell').length, 1);
    assert.equal(task.querySelectorAll('.example-author-notes:not(:has(details.math-example-source))').length, 0);
    const prose = task.cloneNode(true);
    prose.querySelectorAll('script,.ai-feedback-ignore').forEach(s => s.remove());
    assert.doesNotMatch(prose.textContent, /For course authors|Feature:|shared.feedback adapter|assert /);
  }
  for (const data of practice) {
    assert.ok(data.task.length > 30, 'Feedback needs the actual assignment');
    assert.match(data.starter, /def \w+\(/);
    assert.match(data.starter, /TODO/);
    assert.doesNotMatch(data.starter, /## TESTS ##|assert /);
    assert.match(data.tests, /assert /);
  }
  for (const node of w.document.querySelectorAll('a[href$=".html"]')) {
    const href = node.getAttribute('href');
    if (/^https?:/.test(href)) continue;
    assert.ok(fs.existsSync(path.resolve(site, href)), 'Missing page: ' + href);
  }
  dom.window.close();
});

test('individually listed math-exercise loads one usable runtime; an old ai-feedback listed next to it stops', async () => {
  // The package is installed (ctm-assessment, ctm-libs, math-exercise) and
  // the page lists filters itself, as documented for pages that do not use
  // filters: [ctm-assessment]. The package has no ai-feedback alias any more
  // (step 3, U3b); an old ai-feedback 0.8.1 listed next to the components
  // stops with the migration message (L3, §18.4).
  const {spawnSync} = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(path.dirname(path.dirname(site)), 'filter-order-'));
  try {
    const source = path.join(path.dirname(site), '_extensions');
    // ctm-checkers: math-exercise 0.11 and later grade with it (unused with 0.10).
    for (const name of ['ctm-assessment', 'ctm-libs', 'math-exercise', 'ctm-checkers'])
      fs.cpSync(path.join(source, name), path.join(dir, '_extensions', name), {recursive: true});
    if (legacy) fs.cpSync(legacy, path.join(dir, '_extensions/Erasmus-CTM/ai-feedback'), {recursive: true});
    const orders = [['math-exercise']];
    if (legacy) orders.push(['Erasmus-CTM/ai-feedback', 'math-exercise'], ['math-exercise', 'Erasmus-CTM/ai-feedback']);
    for (const [i, filters] of orders.entries()) {
      fs.writeFileSync(path.join(dir, `order-${i}.qmd`), `---\nformat: html\nfilters: [${filters.join(', ')}]\n---\n\n::: {#context .ai-context}\nUse $x^2$.\n:::\n\n\x60\x60\x60{math-exercise}\n#| label: order\n#| context: context\nCompute $2+2$: _[SECRET_ANSWER]\n\x60\x60\x60\n`);
      const render = spawnSync(process.env.QUARTO_BIN || 'quarto', ['render', `order-${i}.qmd`], {cwd: dir, encoding: 'utf8', timeout: 120000});
      if (filters.some(name => name.startsWith('Erasmus-CTM/'))) {
        // ai-feedback 0.8.1 listed next to the package's components: a page uses one version.
        assert.notEqual(render.status, 0, filters.join(', '));
        assert.match(render.stderr, /combines filters that use different ai-feedback versions/);
        assert.match(render.stderr, /remove ai-feedback from filters: and delete the old folder/);
        continue;
      }
      assert.equal(render.status, 0, render.stderr);
      const file = path.join(dir, `order-${i}.html`);
      const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {url: 'https://order.invalid/', runScripts: 'outside-only'});
      const w = dom.window;
      w.document.addEventListener = () => {}; w.__mathExerciseTestMode = true;
      for (const [name, script] of [['ai-feedback', 'feedback-core.js'], ['ai-feedback', 'feedback-dom.js'], ['ai-feedback', 'ai-feedback.js'],
        ['ctm-runtime', 'pyodide-runtime.js'], ['math-exercise', 'math-exercise.js']])
        assert.equal(page.scriptsOf(w.document, name, script).length, 1, `${filters}: ${name}/${script}`);
      page.run(w, file, page.MATH);
      assert.equal(w.AIFeedback.version, sharedVersion);
      w.AIFeedback.initialize();
      const cell = w.document.querySelector('.math-exercise-cell');
      w.__mathExerciseTestApi.setupCell(cell); cell.querySelector('.math-input').value = '3';
      cell.querySelector('.math-feedback-btn').click();
      for (let n = 0; n < 30 && !cell.querySelector('pre'); n++) await new Promise(resolve => setImmediate(resolve));
      const prompt = cell.querySelector('pre')?.textContent;
      assert.ok(prompt, filters.join(', ')); assert.match(prompt, /x\^2/); assert.doesNotMatch(prompt, /SECRET_ANSWER/);
      w.AIFeedback.openSettings();
      assert.equal(w.document.querySelectorAll('dialog.ai-feedback-settings').length, 1);
      dom.window.close();
    }
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('Pyodide through ctm-libs without the alias: [pyodide-interaktiv], [ctm-assessment] and feedback off render correctly', () => {
  // pyodide-interaktiv 1.9 runs on ctm-libs through the shared bootstrap: no
  // ai-feedback folder is installed (step 3, U3b), in either layout.
  const {spawnSync} = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(path.dirname(path.dirname(site)), 'pyodide-order-'));
  try {
    fs.cpSync(path.join(path.dirname(site), '_extensions'), path.join(dir, '_extensions'), {recursive: true});
    assert.ok(!fs.existsSync(path.join(dir, '_extensions', 'ai-feedback')));
    for (const [i, [filters, feedback]] of [[['pyodide-interaktiv'], true], [['ctm-assessment'], true], [['pyodide-interaktiv'], false]].entries()) {
      const blocks = ['interactive', 'setup', 'output'].map(context => '```{pyodide-python}\n#| context: ' + context + '\n#| task: Print the value.\nprint(1)\n```').join('\n\n');
      fs.writeFileSync(path.join(dir, `order-${i}.qmd`), `---\nformat: html\nfilters: [${filters.join(', ')}]\npyodide:\n  feedback: ${feedback}\n---\n\n${blocks}\n`);
      const render = spawnSync(process.env.QUARTO_BIN || 'quarto', ['render', `order-${i}.qmd`], {cwd: dir, encoding: 'utf8', timeout: 120000});
      assert.equal(render.status, 0, render.stderr);
      assert.doesNotMatch(render.stderr, /ai-feedback\] is deprecated/);
      const file = path.join(dir, `order-${i}.html`);
      const w = new JSDOM(fs.readFileSync(file, 'utf8'), {url: 'https://order.invalid/', runScripts: 'outside-only'}).window;
      for (const name of ['feedback-core.js', 'feedback-dom.js', 'ai-feedback.js']) {
        const scripts = [...w.document.scripts].filter(s => s.src.endsWith('/' + name));
        assert.equal(scripts.length, feedback ? 1 : 0, `${filters}: ${name}`);
        if (feedback) w.eval(fs.readFileSync(path.join(dir, scripts[0].getAttribute('src')), 'utf8'));
      }
      if (feedback) { assert.equal(w.AIFeedback.version, sharedVersion); w.AIFeedback.openSettings(); assert.equal(w.document.querySelectorAll('dialog.ai-feedback-settings').length, 1); }
      // The worker and the cells' scripts are ctm-libs' and pyodide-interaktiv's files, each once (D1).
      for (const [name, script] of [['ctm-worker', 'pyodide-worker.js'], ['pyodide-interaktiv', 'qpyodide-cell-classes.js']])
        assert.equal(page.scriptsOf(w.document, name, script).length, 1, `${filters}: ${name}/${script}`);
      assert.equal(w.document.querySelectorAll('[id^="qpyodide-insertion-location-"]').length, 3);
      const dataScript = [...w.document.scripts].find(s => s.textContent.includes('globalThis.qpyodideCellDetails ='));
      assert.ok(dataScript); w.eval(dataScript.textContent);
      assert.deepEqual(Array.from(w.qpyodideCellDetails, c => c.options.context), ['interactive', 'setup', 'output']);
      if (feedback) assert.ok(w.qpyodideCellDetails.every(c => c.options.task === 'Print the value.'), String(filters));
      w.close();
    }
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('explicit file selection and inherited overrides preserve effective policy', () => {
  const F = require(path.join(libs,'feedback','feedback-core.js'));
  const c={layers:[{policies:{base:{'base-prompt':String.raw`Use \(x^2\).`,steps:[{'step-prompt':'Question'},{'step-prompt':'Solution','allow-full-solution':true}]},brief:{extends:'base','max-words':80}}}]};
  assert.equal(F.resolvePolicy('math-exercise','en',{},c).steps.length,4);
  c.pagePolicy='brief';
  let p=F.resolvePolicy('math-exercise','en',{},c);
  assert.equal(p['max-words'],80);assert.equal(p.steps.length,2);assert.ok(p['base-prompt'].includes(String.raw`\(x^2\)`));
  c.pageLayers=[{policies:{brief:{steps:[{'step-prompt':'Replacement'}]}}}];
  p=F.resolvePolicy('math-exercise','en',{},c);assert.equal(p.steps.length,1);assert.equal(p['allow-full-solution'],false);
});
