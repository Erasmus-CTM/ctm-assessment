// D1: the browser files of ctm-libs and of the components are HTML
// dependencies (cacheable files under site_libs/quarto-contrib/), each loaded
// once per page whatever the mix of components; the configuration objects
// stay inline before the components' afterBody scripts; nothing is inlined
// twice; and the same page works with embed-resources.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {JSDOM, ResourceLoader} = require('jsdom');
const page = require('./page-scripts.cjs');
const site = process.env.CTM_INTEGRATION_SITE;

// Code of ctm-libs or a component that must come from a file, never inline.
const BUNDLES = /MathExerciseRuntime\s*=|CTMLocales\.add\(|root\.AIFeedback\s*=|var ME_CFG =|var MODULE_PY = \[|root\.PyExerciseFeedback\s*=|function setupExercise\(/;
// The mixed example page (activities, mathematics, Python, Pyodide, JSXGraph).
const EXPECTED = [
  'ai-feedback/feedback-core.js', 'ai-feedback/feedback-dom.js', 'ai-feedback/ai-feedback.js', 'ai-feedback/ai-feedback.css',
  'ctm-runtime/pyodide-runtime.js', 'ctm-locale/ctm-locale.js', 'ctm-locale/common.js',
  'ctm-locale-math-exercise/math-exercise.js', 'ctm-locale-py-exercise/py-exercise.js',
  'math-exercise/matrix-input.css', 'math-exercise/math-exercise.css', 'math-exercise/matrix-input.js', 'math-exercise/math-exercise.js',
  'py-exercise-feedback/py-exercise-feedback.js', 'py-exercise/py-exercise.css', 'py-exercise/py-exercise.js',
];

function resources(html) {
  return [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]);
}

test('each CTM script and style is one cacheable file per page, after its configuration', {skip: !site}, () => {
  for (const file of ['example.html', 'index.html', 'examples.html']) {
    const html = fs.readFileSync(path.join(site, file), 'utf8');
    const ours = resources(html).map(src => page.dependency(src)).filter(Boolean).map(d => d.name + '/' + d.file);
    assert.equal(new Set(ours).size, ours.length, file + ': a file loads twice: ' + ours.join(', '));
    for (const src of resources(html)) {
      if (/^(https?:|data:|\/\/|#)/.test(src)) continue;
      assert.ok(fs.existsSync(path.resolve(site, src.split('?')[0])), file + ': missing ' + src);
    }
    const doc = new JSDOM(html).window.document;
    for (const script of doc.querySelectorAll('script:not([src])')) assert.doesNotMatch(script.textContent, BUNDLES, file);
    if (file === 'example.html') assert.deepEqual([...ours].sort(), [...EXPECTED].sort());
  }
  // Library files in the head; each component's script after its inline configuration.
  const html = fs.readFileSync(path.join(site, 'example.html'), 'utf8');
  const head = html.indexOf('</head>');
  const at = text => { const i = html.indexOf(text); assert.ok(i > 0, text); return i; };
  for (const file of ['ai-feedback-', 'ctm-runtime-', 'ctm-locale-']) assert.ok(at('quarto-contrib/' + file) < head, file);
  const mathScript = html.search(/quarto-contrib\/math-exercise-\d[^/"]*\/math-exercise\.js"/);
  const pyScript = html.search(/quarto-contrib\/py-exercise-\d[^/"]*\/py-exercise\.js"/);
  const pyFeedback = html.search(/quarto-contrib\/py-exercise-feedback-\d[^/"]*\/py-exercise-feedback\.js"/);
  assert.ok(mathScript > head && at('window.__mathExerciseConfig =') < mathScript, 'math-exercise.js after its configuration');
  assert.ok(pyScript > head && at('window.__pyExerciseConfig =') < pyScript && pyFeedback < pyScript, 'py-exercise.js after its configuration and adapter');
  assert.ok(at('window.__aiFeedbackPolicies =') < mathScript);
});

// Serves data: URLs only (embedded files); nothing is fetched from the network.
class Offline extends ResourceLoader {
  fetch(url, options) { return /^data:/.test(url) ? super.fetch(url, options) : null; }
}

test('with embed-resources a page with every script is self-contained and its scripts run', {skip: !site}, async () => {
  const dir = fs.mkdtempSync(path.join(path.dirname(path.dirname(site)), 'embedded-'));
  try {
    fs.cpSync(path.join(path.dirname(site), '_extensions'), path.join(dir, '_extensions'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'page.qmd'), '---\ntitle: Embedded\nengine: markdown\nformat:\n  html:\n    embed-resources: true\n'
      + 'filters: [ctm-assessment]\npy-exercise:\n  feedback: true\n---\n\n::: {.ai-feedback #act}\nWrite.\n:::\n\n'
      + '```{math-exercise}\n#| label: m\nCompute $2+2$: _[4]\n```\n\n'
      + '```{py-exercise}\n#| task: Return two.\ndef answer():\n    return 0\n## TESTS ##\nassert answer() == 2\n```\n');
    const render = spawnSync(process.env.QUARTO_BIN || 'quarto', ['render', 'page.qmd'], {cwd: dir, encoding: 'utf8', timeout: 300000});
    assert.equal(render.status, 0, render.stderr);
    const html = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
    assert.doesNotMatch(html, /quarto-contrib\//);
    assert.ok(!fs.existsSync(path.join(dir, 'page_files')), 'no page_files folder');
    for (const src of resources(html)) assert.match(src, /^(https?:|data:|#)/, src);
    const version = require(path.join(path.dirname(site), '_extensions/ctm-libs/feedback/feedback-core.js')).version;
    // jsdom cannot import() KaTeX's ES module from the CDN as math-exercise does
    // on DOMContentLoaded; such rejections of the page's async start-up
    // handlers are collected here instead of escaping the test.
    const rejected = [];
    const w = new JSDOM(html, {url: 'https://example.invalid/page.html', runScripts: 'dangerously', resources: new Offline(), pretendToBeVisual: true,
      beforeParse(window) {
        const add = window.document.addEventListener.bind(window.document);
        window.document.addEventListener = (type, listener, options) => add(type, typeof listener !== 'function' ? listener : function (...args) {
          const result = listener.apply(this, args);
          if (result && typeof result.catch === 'function') result.catch(error => rejected.push(error));
          return result;
        }, options);
      }}).window;
    try {
      await new Promise(resolve => w.addEventListener('load', resolve));
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.deepEqual(rejected.map(error => error.code).filter(code => code !== 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING'), []);
      assert.equal(typeof w.MathExerciseRuntime.ensurePyodide, 'function');
      assert.equal(w.CTMLocales.table('math-exercise', 'en').resPartial(50), 'Partially correct (50%).');
      assert.equal(typeof w.CTMLocales.table('py-exercise', 'en').stop, 'string');
      assert.equal(w.AIFeedback.version, version);
      assert.equal(typeof w.PyExerciseFeedback.attach, 'function');
      assert.deepEqual(JSON.parse(JSON.stringify(w.__mathExerciseConfig)), {lang: 'en', stopAfter: 20});
      assert.equal(w.document.querySelector('#act button.ai-feedback-button').textContent, 'Feedback');
    } finally { w.close(); }
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
