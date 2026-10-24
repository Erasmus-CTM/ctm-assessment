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
const hash = value => require('node:crypto').createHash('sha1').update(value).digest('hex').slice(0, 16);
const files = ['ctm-locale-ui/ui.js', 'ctm-copy/ctm-copy.js', 'ctm-store/ctm-store.js',
  'ctm-export/ctm-export.js', 'math-exercise/math-store.js'];
function fixture({save = true, exportEnabled = true, locale = 'en', cellLabel = '', cellStoreId = null} = {}) {
  const cellSource = hash('print(2)\n' + JSON.stringify({label: cellLabel, save: ''}) + '\n');
  const cellIdentity = cellStoreId ?? (cellLabel || 'cell:' + cellSource);
  const cellExtra = hash(cellSource + ':extra');
  const messages = Object.fromEntries(MESSAGE_KEYS.map(k => [k, UI[k]])); messages.locale = locale;
  const manifest = {v: 1, save, export: exportEnabled, progress: false, quizzes: [], messages, exercises: [
    {component: 'py-exercise', id: 'py', runtimeId: 'ctm-block-1', source: A, save, order: 1},
    {component: 'math-exercise', id: 'math', runtimeId: 'ctm-block-2', source: B, save, order: 2},
    {component: 'pyodide-interaktiv', id: cellIdentity, runtimeId: 'ctm-runtime-3', source: cellSource, save, order: 3},
    {component: 'pyodide-interaktiv', id: 'extra:' + cellIdentity, runtimeId: 'ctm-runtime-4', source: cellExtra, save, order: 4}
  ]};
  const attributes = (component, id, source, runtime) => ` data-ctm-component="${component}" data-ctm-id="${id}" data-ctm-source="${source}" data-ctm-runtime-id="${runtime}" data-ctm-save="${save}"`;
  const py = {id: 1, label: 'py', starter: 'answer = 2', tests: 'assert answer == 2'};
  const cell = {id: 1, code: 'print(2)', options: {label: cellLabel}};
  const page = (after) => {
    const p = {...py, ...(after ? {storeId: 'py', source: A, save} : {})};
    const c = {...cell, options: {...cell.options, ...(after ? {
      'ctm-store-id': cellIdentity, 'ctm-store-source': cellSource, 'ctm-store-save': save,
      'ctm-extra-source': cellExtra, 'ctm-extra-save': save, save: ''} : {})}};
    const bar = (save || exportEnabled) ? `<div class="ctm-save-bar" role="region" aria-label="${save ? UI.savingLabel : UI.exportTitle}" hidden><p class="ctm-save-notice">${save ? UI.savingNotice : UI.savingDisabled}</p><div class="ctm-save-actions">${save ? `<button type="button" data-ctm-clear-page>${UI.clearPage}</button><button type="button" data-ctm-clear-course>${UI.clearCourse}</button><button type="button" data-ctm-save-toggle>${UI.saveOff}</button>` : ''}${exportEnabled ? `<button type="button" data-ctm-export>${UI.exportTitle}</button>` : ''}</div><span class="ctm-save-status" role="status" aria-live="polite"></span></div>` : '';
    return '<!doctype html><html><head><title>Example</title><link rel="stylesheet" href="ctm-ui/ctm-ui.css">'
      + (after ? files.filter(f => exportEnabled || !f.startsWith('ctm-export/')).map(f => `<script src="${f}"></script>`).join('') : '')
      + '</head><body><main id="quarto-document-content"><h1>Author heading</h1>'
      + (after ? bar : '') + '<p id="prose">Keep this explanation.</p>'
      + `<div id="py-exercise-1" class="py-exercise-cell"${after ? attributes('py-exercise', 'py', A, 'ctm-block-1') : ''}><noscript>Enable JavaScript.</noscript></div>`
      + `<div id="math-exercise-1" class="math-exercise-cell" data-label="math" data-variants='[{"answer":"2","checker":"NumRelative"}]'${after ? attributes('math-exercise', 'math', B, 'ctm-block-2') : ''}></div>`
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

test('new Python metadata cannot bind one unchanged exercise to another root', () => {
  const f = fixture(), second = {id: 2, label: 'other', starter: 'answer = 3', tests: 'assert answer == 3'};
  const add = (html, after) => mutate(html, d => {
    const root = d.createElement('div'); root.id = 'py-exercise-2'; root.className = 'py-exercise-cell';
    if (after) for (const [key, value] of Object.entries({
      component: 'py-exercise', id: 'other', source: B, 'runtime-id': 'ctm-block-5', save: 'true'}))
      root.setAttribute('data-ctm-' + key, value);
    d.querySelector('main').append(root);
    const script = d.createElement('script');
    script.textContent = '(window.__pyExercises = window.__pyExercises || []).push(' +
      JSON.stringify({...second, ...(after ? {storeId: 'other', source: B, save: true} : {})}) + ');';
    d.querySelector('main').append(script);
    if (after) {
      const node = d.querySelector('#ctm-store-manifest'), m = JSON.parse(node.textContent);
      m.exercises.push({component: 'py-exercise', id: 'other', runtimeId: 'ctm-block-5', source: B, save: true, order: 5});
      node.textContent = JSON.stringify(m);
    }
  });
  const before = add(f.before, false), after = add(f.after, true);
  assert.equal(compare(after, before).summary.unexpected, 0);
  const swapped = mutate(after, d => {
    const scripts = [...d.querySelectorAll('script')].filter(s => s.textContent.startsWith('(window.__pyExercises'));
    const data = scripts.map(s => JSON.parse(s.textContent.slice(s.textContent.indexOf('.push(') + 6, s.textContent.lastIndexOf(');'))));
    for (const key of ['storeId', 'source', 'save']) [data[0][key], data[1][key]] = [data[1][key], data[0][key]];
    scripts.forEach((s, i) => { s.textContent = '(window.__pyExercises = window.__pyExercises || []).push(' + JSON.stringify(data[i]) + ');'; });
  });
  rejects(swapped, before, 'new metadata swapped while original ids/labels/code/tests stay fixed');
});

test('cell identities follow original labels, source hashes and actual insertion roots', () => {
  const labelled = fixture({cellLabel: 'named'});
  assert.equal(compare(labelled.after, labelled.before).summary.unexpected, 0);
  for (const f of [fixture({cellLabel: 'named', cellStoreId: 'another'}),
                   fixture({cellStoreId: 'another'})])
    rejects(f.after, f.before, 'new cell identity contradicts unchanged original label/hash');
  const f = fixture();
  const removeInsertion = d => d.querySelector('#qpyodide-insertion-location-1').remove();
  rejects(mutate(f.after, removeInsertion), mutate(f.before, removeInsertion), 'registration with no actual insertion root on either side');
  rejects(mutate(f.after, d => {
    const node = d.querySelector('#ctm-store-manifest'), m = JSON.parse(node.textContent);
    m.exercises.find(e => e.component === 'math-exercise').id = 'another';
    node.textContent = JSON.stringify(m);
    d.querySelector('.math-exercise-cell').setAttribute('data-ctm-id', 'another');
  }), f.before, 'new maths metadata contradicts the unchanged authored data-label');
  rejects(mutate(f.after, d => {
    d.querySelector('.math-exercise-cell').setAttribute('data-label', 'another');
  }), f.before, 'changed original maths label');
});

test('interactive cells retain their dormant extra slot; output cells have none', () => {
  const f = fixture();
  const missing = mutate(f.after, d => {
    const node = d.querySelector('#ctm-store-manifest'), m = JSON.parse(node.textContent);
    m.exercises = m.exercises.filter(e => !e.id.startsWith('extra:'));
    node.textContent = JSON.stringify(m);
    const script = [...d.querySelectorAll('script')].find(s => s.textContent.startsWith('globalThis.qpyodideCellDetails'));
    const cells = JSON.parse(script.textContent.slice(script.textContent.indexOf('=') + 1, -1));
    delete cells[0].options['ctm-extra-source']; delete cells[0].options['ctm-extra-save'];
    script.textContent = 'globalThis.qpyodideCellDetails = ' + JSON.stringify(cells) + ';';
  });
  rejects(missing, f.before, 'extra metadata and manifest entry disappeared together');
  const output = (html, after) => mutate(html, d => {
    const script = [...d.querySelectorAll('script')].find(s => s.textContent.startsWith('globalThis.qpyodideCellDetails'));
    const cells = JSON.parse(script.textContent.slice(script.textContent.indexOf('=') + 1, -1));
    cells[0].options.context = 'output';
    if (after) {
      delete cells[0].options['ctm-extra-source']; delete cells[0].options['ctm-extra-save'];
      cells[0].options['ctm-store-save'] = false;
      const o = cells[0].options;
      const source = hash(cells[0].code + '\n' + JSON.stringify({context: 'output', label: '', save: ''}) + '\n');
      const oldId = o['ctm-store-id']; o['ctm-store-source'] = source; o['ctm-store-id'] = 'cell:' + source;
      const node = d.querySelector('#ctm-store-manifest'), m = JSON.parse(node.textContent);
      m.exercises = m.exercises.filter(e => !e.id.startsWith('extra:'));
      const entry = m.exercises.find(e => e.component === 'pyodide-interaktiv');
      entry.save = false; entry.source = source; entry.id = 'cell:' + source;
      node.textContent = JSON.stringify(m);
    }
    script.textContent = 'globalThis.qpyodideCellDetails = ' + JSON.stringify(cells) + ';';
  });
  assert.equal(compare(output(f.after, true), output(f.before, false)).summary.unexpected, 0);
});

test('only verified chrome leaves switch-position accounting; real authored moves fail', () => {
  const f = fixture();
  const addSwitch = html => mutate(html, d => {
    const controls = d.createElement('div'); controls.className = 'ctm-modes';
    controls.innerHTML = '<button data-mode="lecture">Explore</button><button data-mode="reading">Read</button>';
    const reveal = d.createElement('details'); reveal.className = 'reading-step';
    reveal.innerHTML = '<summary>More</summary><p>Authored steps.</p>';
    d.querySelector('#prose').after(controls, reveal);
  });
  const before = addSwitch(f.before), after = addSwitch(f.after);
  assert.equal(compare(after, before).summary.unexpected, 0);
  const moved = mutate(after, d => d.querySelector('main').append(d.querySelector('.ctm-modes')));
  assert.ok(compare(moved, before).items.some(i => i.invariant && i.change === 'switch moved'));
  rejects(mutate(after, d => d.querySelector('[data-ctm-export]').append(d.querySelector('#prose'))), before,
    'unverified bar cannot hide absorbed authored prose');
});

test('new metadata cannot swap two unchanged unlabelled cells', () => {
  const f = fixture();
  function add(html, after) { return mutate(html, d => {
    const script = [...d.scripts].find(s => s.textContent.startsWith('globalThis.qpyodideCellDetails'));
    const cells = JSON.parse(script.textContent.slice(script.textContent.indexOf('=') + 1, -1));
    const source = hash('print(3)\n{"label":"","save":""}\n'), id = 'cell:' + source;
    cells.push({id: 2, code: 'print(3)', options: {label: '', ...(after ? {save: '',
      'ctm-store-id': id, 'ctm-store-source': source, 'ctm-store-save': true,
      'ctm-extra-source': hash(source + ':extra'), 'ctm-extra-save': true} : {})}});
    script.textContent = 'globalThis.qpyodideCellDetails = ' + JSON.stringify(cells) + ';';
    const root = d.createElement('div'); root.id = 'qpyodide-insertion-location-2'; d.querySelector('main').append(root);
    if (after) {
      const node = d.querySelector('#ctm-store-manifest'), m = JSON.parse(node.textContent);
      for (const [extra, runtime, order] of [[false, 'ctm-runtime-5', 5], [true, 'ctm-runtime-6', 6]])
        m.exercises.push({component: 'pyodide-interaktiv', id: (extra ? 'extra:' : '') + id,
          source: extra ? hash(source + ':extra') : source, save: true, runtimeId: runtime, order});
      node.textContent = JSON.stringify(m);
    }
  }); }
  const before = add(f.before, false), after = add(f.after, true);
  assert.equal(compare(after, before).summary.unexpected, 0);
  rejects(mutate(after, d => {
    const script = [...d.scripts].find(s => s.textContent.startsWith('globalThis.qpyodideCellDetails'));
    const cells = JSON.parse(script.textContent.slice(script.textContent.indexOf('=') + 1, -1));
    for (const key of ['ctm-store-id','ctm-store-source','ctm-store-save','ctm-extra-source','ctm-extra-save'])
      [cells[0].options[key], cells[1].options[key]] = [cells[1].options[key], cells[0].options[key]];
    script.textContent = 'globalThis.qpyodideCellDetails = ' + JSON.stringify(cells) + ';';
  }), before, 'metadata-only swap across original code and insertion roots');
});

test('read-only primary is disabled while its extra slot remains registered', () => {
  const f = fixture();
  const readonly = (html, after, save = false) => mutate(html, d => {
    const script = [...d.scripts].find(s => s.textContent.startsWith('globalThis.qpyodideCellDetails'));
    const cells = JSON.parse(script.textContent.slice(script.textContent.indexOf('=') + 1, -1));
    const o = cells[0].options; o['read-only'] = 'true';
    if (after) {
      const source = hash('print(2)\n{"label":"","read-only":"true","save":""}\n');
      o['ctm-store-id'] = 'cell:' + source; o['ctm-store-source'] = source; o['ctm-store-save'] = save;
      o['ctm-extra-source'] = hash(source + ':extra');
      const node = d.querySelector('#ctm-store-manifest'), m = JSON.parse(node.textContent);
      for (const e of m.exercises.filter(e => e.component === 'pyodide-interaktiv')) {
        const extra = e.id.startsWith('extra:');
        e.id = (extra ? 'extra:' : '') + 'cell:' + source;
        e.source = extra ? hash(source + ':extra') : source; e.save = extra ? true : save;
      }
      node.textContent = JSON.stringify(m);
    }
    script.textContent = 'globalThis.qpyodideCellDetails = ' + JSON.stringify(cells) + ';';
  });
  assert.equal(compare(readonly(f.after, true), readonly(f.before, false)).summary.unexpected, 0);
  rejects(readonly(f.after, true, true), readonly(f.before, false), 'read-only primary cannot save');
});

test('pool descriptors bind exact existing questions and grading, including legacy variants', () => {
  const f = fixture();
  const grading = {mode:'equivalent',reject:'',tolerance:'',decplaces:'',sigfigs:'',form:'',vars:'',response:'',
    formCredit:'0.5',vecdir:'row',checker:false,packages:[],fieldLabels:[],partialCredit:false};
  // Independent fixture encoder follows the documented typed-key tuple format.
  function encode(v) {
    if (!v || typeof v !== 'object') return JSON.stringify(v);
    const entries = Object.entries(v).map(([k,x]) => [(Array.isArray(v) ? 'number:' + (+k+1) : 'string:' + k),x]);
    return '[' + entries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([k,x])=>'['+JSON.stringify(k)+','+encode(x)+']').join(',') + ']';
  }
  for (const generated of [false, true]) {
    const records = generated ? [{id:'v-first',question:'x+1',solution:'2'}, {id:'v-next',question:'x+2',solution:'3'}] : null;
    const tasks = ['x+1','x+2'];
    const descriptors = tasks.map((question,i) => {
      const record = records?.[i], h = hash(encode({question,solution:record?.solution || '',context:'',
        parameters:false,derived:false,variantId:record?.id || false,grading}));
      return {id:record?.id || 'pool:'+h,hash:h,...(generated?{}:{n:i+1})};
    });
    const decorate = (html, after) => mutate(html,d => {
      const node=d.querySelector('.math-exercise-cell');
      node.setAttribute('data-pool',JSON.stringify(tasks)); node.removeAttribute('data-variants');
      if(records) node.setAttribute('data-variants',JSON.stringify({variants:records}));
      for(const [key,value] of Object.entries(grading)) {
        const attr = {formCredit:'form-credit',fieldLabels:'field-labels',partialCredit:'partial-credit'}[key] || key;
        node.setAttribute('data-'+attr, ['checker','packages','fieldLabels'].includes(key)?JSON.stringify(value):String(value));
      }
      if(after) node.setAttribute('data-storage-variants',JSON.stringify(descriptors));
    });
    const before=decorate(f.before,false), after=decorate(f.after,true);
    assert.equal(compare(after,before).summary.unexpected,0);
    for(const change of [
      ds=>{ds[0].hash=A;},ds=>{ds[0].id='unrelated';},ds=>{ds.pop();},ds=>{ds[0].n=99;}
    ]) rejects(mutate(after,d=>{
      const n=d.querySelector('.math-exercise-cell'),ds=JSON.parse(n.getAttribute('data-storage-variants'));
      change(ds);n.setAttribute('data-storage-variants',JSON.stringify(ds));
    }),before,'invalid descriptor '+String(change));
    rejects(after.replace('data-tolerance=""','data-tolerance="1"'),before,'grading changed with descriptors unchanged');
  }
});
