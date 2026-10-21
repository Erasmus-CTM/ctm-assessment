// Full CLI comparisons: narrow store additions pass, independent losses fail.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const UI = {
  "clearFailed": "Browser storage could not be cleared or updated. Use your browser settings to remove this course data.",
  "confirmClearCourse": "Delete all your saved answers in this course?",
  "confirmNewVariant": "Replace your filled answers with a new variant?",
  "confirmSaveOff": "This deletes all saved answers in this course and stops saving.",
  "copyAll": "Copy all",
  "correct": "✓ correct",
  "downloadHTML": "Download .html",
  "downloadMarkdown": "Download .md",
  "exercise": "Exercise",
  "exportClose": "Close",
  "exportTitle": "Export my answers",
  "lastResult": "Last result",
  "outdated": "Outdated",
  "partial": "½ partly correct",
  "progressTitle": "Page progress",
  "recordTooLarge": "This answer is too large to save. Copy it before leaving the page.",
  "saveOff": "Do not save on this device",
  "saveOn": "Save again",
  "savingDisabled": "Saving is off for this page.",
  "savingNotice": "Your answers are saved only in this browser.",
  "savingOffNotice": "Saving is off on this device for this course.",
  "showSaved": "Show your saved answer",
  "sourceChanged": "The exercise has changed since you answered.",
  "statusCorrect": "correct",
  "statusInvalid": "invalid",
  "statusPartial": "partly correct",
  "statusWrong": "wrong",
  "storageUnavailable": "Saving is unavailable. Your answers are kept in memory for this page only.",
  "total": "{score} of {count}",
  "unattempted": "– not attempted",
  "variantChanged": "This variant has changed.",
  "variantWithdrawn": "This variant has been withdrawn.",
  "wrong": "✗ wrong",
  "savingLabel": "Saved answers",
  "clearPage": "Delete answers on this page",
  "clearCourse": "Delete all your answers in this course"
};
const MESSAGE_KEYS = ["clearFailed","confirmClearCourse","confirmNewVariant","confirmSaveOff","copyAll","correct","downloadHTML","downloadMarkdown","exercise","exportClose","exportTitle","lastResult","outdated","partial","progressTitle","recordTooLarge","saveOff","saveOn","savingDisabled","savingNotice","savingOffNotice","showSaved","sourceChanged","statusCorrect","statusInvalid","statusPartial","statusWrong","storageUnavailable","total","unattempted","variantChanged","variantWithdrawn","wrong"];
const A = '0123456789abcdef', B = 'fedcba9876543210';
const files = ['ctm-locale-ui/ui.js', 'ctm-copy/ctm-copy.js', 'ctm-store/ctm-store.js',
  'ctm-export/ctm-export.js', 'math-exercise/math-store.js'];
function fixture({save = true, exportEnabled = true, locale = 'en'} = {}) {
  const messages = Object.fromEntries(MESSAGE_KEYS.map(k => [k, UI[k]])); messages.locale = locale;
  const manifest = {v: 1, save, export: exportEnabled, progress: false, quizzes: [], messages, exercises: [
    {component: 'py-exercise', id: 'py', runtimeId: 'ctm-block-1', source: A, save, order: 1},
    {component: 'math-exercise', id: 'math', runtimeId: 'ctm-block-2', source: B, save, order: 2},
    {component: 'pyodide-interaktiv', id: 'cell:' + A, runtimeId: 'ctm-runtime-3', source: A, save, order: 3},
    {component: 'pyodide-interaktiv', id: 'extra:cell:' + A, runtimeId: 'ctm-runtime-4', source: B, save, order: 4}
  ]};
  const attributes = (component, id, source, runtime) => ` data-ctm-component="${component}" data-ctm-id="${id}" data-ctm-source="${source}" data-ctm-runtime-id="${runtime}" data-ctm-save="${save}"`;
  const py = {id: 1, label: 'py', code: 'answer = 2', tests: 'assert answer == 2'};
  const cell = {id: 1, code: 'print(2)', options: {label: ''}};
  const page = (after) => {
    const p = {...py, ...(after ? {storeId: 'py', source: A, save} : {})};
    const c = {...cell, options: {...cell.options, ...(after ? {
      'ctm-store-id': 'cell:' + A, 'ctm-store-source': A, 'ctm-store-save': save,
      'ctm-extra-source': B, 'ctm-extra-save': save, save: ''} : {})}};
    const bar = (save || exportEnabled) ? `<div class="ctm-save-bar" role="region" aria-label="${save ? UI.savingLabel : UI.exportTitle}" hidden><p class="ctm-save-notice">${save ? UI.savingNotice : UI.savingDisabled}</p><div class="ctm-save-actions">${save ? `<button type="button" data-ctm-clear-page>${UI.clearPage}</button><button type="button" data-ctm-clear-course>${UI.clearCourse}</button><button type="button" data-ctm-save-toggle>${UI.saveOff}</button>` : ''}${exportEnabled ? `<button type="button" data-ctm-export>${UI.exportTitle}</button>` : ''}</div><span class="ctm-save-status" role="status" aria-live="polite"></span></div>` : '';
    return '<!doctype html><html><head><title>Example</title><link rel="stylesheet" href="ctm-ui/ctm-ui.css">'
      + (after ? files.filter(f => exportEnabled || !f.startsWith('ctm-export/')).map(f => `<script src="${f}"></script>`).join('') : '')
      + '</head><body><main id="quarto-document-content"><h1>Author heading</h1>'
      + (after ? bar : '') + '<p id="prose">Keep this explanation.</p>'
      + `<div id="py-exercise-1" class="py-exercise-cell"${after ? attributes('py-exercise', 'py', A, 'ctm-block-1') : ''}><noscript>Enable JavaScript.</noscript></div>`
      + `<div id="math-exercise-1" class="math-exercise-cell" data-variants='[{"answer":"2","checker":"NumRelative"}]'${after ? attributes('math-exercise', 'math', B, 'ctm-block-2') : ''}></div>`
      + '<div id="qpyodide-insertion-location-1"></div>'
      + `<script>(window.__pyExercises = window.__pyExercises || []).push(${JSON.stringify(p)});</script>`
      + `<script>globalThis.qpyodideCellDetails = ${JSON.stringify([c])};</script>`
      + (after ? `<script type="application/json" id="ctm-store-manifest">${JSON.stringify(manifest)}</script>` : '')
      + '</main></body></html>';
  };
  return {before: page(false), after: page(true), manifest};
}
function mutate(html, change) {
  const dom = new JSDOM(html);
  change(dom.window.document);
  return dom.serialize();
}
function compare(after, before, {catalogue = UI} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-store-'));
  try {
    for (const [side, html] of [['before', before], ['after', after]]) {
      fs.mkdirSync(path.join(dir, side));
      fs.writeFileSync(path.join(dir, side, 'page.html'), html);
    }
    const ui = path.join(dir, 'after', 'ctm-locale-ui'); fs.mkdirSync(ui);
    fs.writeFileSync(path.join(ui, 'ui.js'), 'CTMLocales.add("ui", /*BEGIN-JSON*/' + JSON.stringify({en: catalogue}) + '/*END-JSON*/);');
    const report = path.join(dir, 'report.json');
    const result = spawnSync(process.execPath, [path.join(ROOT, 'tools/compare-rendered.mjs'),
      '--before', path.join(dir, 'before'), '--after', path.join(dir, 'after'),
      '--expect', path.join(ROOT, 'tools/compare-rendered/expect/step4.yml'), '--report', report], {encoding: 'utf8'});
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    return JSON.parse(fs.readFileSync(report, 'utf8'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
const unexplained = report => report.items.filter(i => !i.category);
function rejects(after, before, reason) {
  assert.ok(unexplained(compare(after, before)).length > 0, reason);
}

test('only the observed store dependencies, metadata, manifest and bar are expected', () => {
  const f = fixture(), report = compare(f.after, f.before);
  assert.equal(report.summary.unexpected, 0, JSON.stringify(unexplained(report)));
  assert.ok(report.items.some(i => i.store === 'bar'));
  assert.ok(report.items.some(i => i.store === 'cell-metadata'));
  assert.ok(report.items.some(i => i.store === 'py-metadata'));
  assert.ok(report.items.some(i => i.store === 'attribute'));
  assert.ok(report.items.some(i => i.store === 'manifest'));
});

test('save off still permits the exact export-only bar; no bar when both are off', () => {
  for (const exportEnabled of [true, false]) {
    const f = fixture({save: false, exportEnabled});
    assert.equal(compare(f.after, f.before).summary.unexpected, 0);
  }
});

test('page controls may not disappear, change role, or absorb unrelated prose', () => {
  const f = fixture();
  for (const change of [
    d => d.querySelector('[data-ctm-clear-page]').remove(),
    d => d.querySelector('[data-ctm-clear-course]').remove(),
    d => d.querySelector('[data-ctm-save-toggle]').remove(),
    d => d.querySelector('[data-ctm-export]').remove(),
    d => d.querySelector('.ctm-save-status').setAttribute('aria-live', 'off'),
    d => { d.querySelector('.ctm-save-actions').append(d.querySelector('#prose')); },
    d => { d.querySelector('[data-ctm-export]').textContent = 'Unrelated author prose'; },
    d => d.querySelector('.ctm-save-bar').remove()
  ]) rejects(mutate(f.after, change), f.before, String(change));
});

test('component metadata must match the manifest, including when all attributes disappear', () => {
  const f = fixture();
  for (const change of [
    d => d.querySelector('.py-exercise-cell').setAttribute('data-ctm-id', 'another-exercise'),
    d => d.querySelector('.math-exercise-cell').setAttribute('data-ctm-source', A),
    d => { const script = d.querySelector('#ctm-store-manifest'), m = JSON.parse(script.textContent);
      m.exercises = m.exercises.filter(e => e.component !== 'math-exercise'); script.textContent = JSON.stringify(m);
      for (const a of [...d.querySelector('.math-exercise-cell').attributes])
        if (a.name.startsWith('data-ctm-')) d.querySelector('.math-exercise-cell').removeAttribute(a.name); },
    d => { for (const a of [...d.querySelector('.py-exercise-cell').attributes])
      if (a.name.startsWith('data-ctm-')) d.querySelector('.py-exercise-cell').removeAttribute(a.name); }
  ]) rejects(mutate(f.after, change), f.before, String(change));
});

test('manifest schema and catalogue are checked instead of accepting an arbitrary JSON island', () => {
  const f = fixture();
  for (const change of [
    m => { m.result = {score: 1}; },
    m => { m.exercises[0].source = 'broken'; },
    m => { m.exercises[0].source = 1234567890123456; },
    m => { m.exercises[0].runtimeId = m.exercises[1].runtimeId; },
    m => { m.messages.savingNotice = 'Unrelated author prose'; },
    m => { m.exercises[0].score = 1; }
  ]) {
    const after = mutate(f.after, d => {
      const node = d.querySelector('#ctm-store-manifest'), m = JSON.parse(node.textContent);
      change(m); node.textContent = JSON.stringify(m);
    });
    rejects(after, f.before, String(change));
  }
  rejects(f.after.replace('id="ctm-store-manifest"', 'id="some-json"'), f.before, 'wrong island id');
});

test('author prose and grading/checker payloads remain ordinary unexplained differences', () => {
  const f = fixture();
  rejects(f.after.replace('Keep this explanation.', 'A different explanation.'), f.before, 'changed prose');
  rejects(f.after.replace('Keep this explanation.', ''), f.before, 'lost prose');
  rejects(f.after.replace('"answer":"2"', '"answer":"3"'), f.before, 'changed mathematical answer');
  rejects(f.after.replace('NumRelative', 'AlwaysTrue'), f.before, 'changed checker');
  rejects(f.after.replace('assert answer == 2', ''), f.before, 'lost Python test');
  rejects(f.after.replace('answer = 2', 'answer = 3'), f.before, 'changed Python starter');
});

test('store rules explain additions only; a previously saved identity cannot silently change', () => {
  const f = fixture();
  rejects(f.after.replaceAll('ctm-block-1', 'ctm-block-99'), f.after, 'changed existing runtime identity');
  rejects(f.after.replaceAll('storeId', 'otherId'), f.before, 'renamed component metadata');
  rejects(f.after.replace('ctm-store/ctm-store.js', 'ctm-store/other.js'), f.before, 'missing store dependency');
});

test('setup-only cells may gain only the empty save option, without a store registration', () => {
  const page = cell => '<!doctype html><html><body><main><p>Setup remains unchanged.</p><script>globalThis.qpyodideCellDetails = '
    + JSON.stringify([cell]) + ';</script></main></body></html>';
  const before = {id: 1, code: 'import math', options: {context: 'setup'}};
  const after = {...before, options: {...before.options, save: ''}};
  assert.equal(compare(page(after), page(before)).summary.unexpected, 0);
  rejects(page({...after, code: ''}), page(before), 'setup code disappeared');
  rejects(page({...after, options: {...after.options, save: true}}), page(before), 'nonempty setup option');
});
