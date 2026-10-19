// F-79 across the components of the package: every CTM setting combines key
// by key over _quarto.yml, profiles, _quarto.yml.local, _metadata.yml and the
// page, so a page that sets one key of a section keeps the project's other
// keys. Shared keys (stop-after, lang) set under ctm-assessment reach every
// component; a component's own spelling wins at any level (design §3.2).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const site = process.env.CTM_INTEGRATION_SITE;

const math = '```{math-exercise}\n#| label: product\nCompute $6\\cdot 7$: _[42]\n```\n';
const python = '```{py-exercise}\n#| label: answer\n#| task: Return two.\ndef answer():\n    return 0\n## TESTS ##\nassert answer() == 2\n```\n';
const FILES = {
  '_quarto.yml': 'project:\n  type: website\n  render: [chapter/page.qmd, chapter/other.qmd, top.qmd]\nfilters: [ctm-assessment]\n'
    + 'ctm-assessment:\n  stop-after: 45\nmath-exercise:\n  feedback: false\npy-exercise:\n  feedback: true\n  show-test-hints: false\n'
    + 'ai-feedback:\n  mode: copy\n',
  '_quarto-nb.yml': 'ctm-assessment:\n  lang: nb\n',
  'chapter/_metadata.yml': 'py-exercise:\n  stop-after: 33\n',
  // The page's own maps name one key each; the project's feedback,
  // show-test-hints and the shared stop-after must survive.
  'chapter/page.qmd': '---\ntitle: Page\nengine: markdown\nmath-exercise:\n  lang: nb\npy-exercise:\n  lang: de\n---\n\n' + math + '\n' + python,
  'chapter/other.qmd': '---\ntitle: Other\nengine: markdown\n---\n\n' + math + '\n' + python,
  'top.qmd': '---\ntitle: Top\nengine: markdown\nmath-exercise:\n  stop-after: 12\n---\n\n' + math,
};

function config(doc, name) {
  const script = [...doc.scripts].find(s => s.textContent.includes(`window.${name} =`));
  return script && JSON.parse(script.textContent.replace(new RegExp(`^\\s*window\\.${name} = `), '').replace(/;\s*$/, ''));
}
function page(dir, file) {
  const doc = new JSDOM(fs.readFileSync(path.join(dir, '_site', file), 'utf8')).window.document;
  const exercises = [...doc.scripts].filter(s => s.textContent.trim().startsWith('(window.__pyExercises ='))
    .map(s => JSON.parse(s.textContent.trim().replace(/^\(window\.__pyExercises = window\.__pyExercises \|\| \[\]\)\.push\(/, '').replace(/\);\s*$/, '')));
  return {
    math: config(doc, '__mathExerciseConfig'),
    py: config(doc, '__pyExerciseConfig'),
    exercises,
    feedbackButtons: doc.querySelectorAll('.math-feedback-btn').length,
    check: doc.querySelector('.math-check-btn')?.textContent.replace(/^\W+/, ''),
  };
}
function render(dir, args = []) {
  fs.rmSync(path.join(dir, '_site'), {recursive: true, force: true});
  fs.rmSync(path.join(dir, '.quarto'), {recursive: true, force: true});
  const result = spawnSync(process.env.QUARTO_BIN || 'quarto', ['render', ...args], {cwd: dir, encoding: 'utf8', timeout: 300000});
  assert.equal(result.status, 0, result.stderr);
  return result.stderr;
}

test('settings combine key by key across levels and components', {skip: !site}, () => {
  const dir = fs.mkdtempSync(path.join(path.dirname(path.dirname(site)), 'settings-merge-'));
  try {
    fs.cpSync(path.join(path.dirname(site), '_extensions'), path.join(dir, '_extensions'), {recursive: true});
    for (const [name, text] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), {recursive: true});
      fs.writeFileSync(path.join(dir, name), text);
    }
    render(dir);
    let p = page(dir, 'chapter/page.html');
    // The page's own math-exercise map keeps the project's feedback: false;
    // ctm-assessment: stop-after reaches it; its lang gives the Bokmål labels.
    assert.equal(p.feedbackButtons, 0);
    assert.equal(p.check, 'Sjekk');
    assert.deepEqual(p.math, {lang: 'nb', stopAfter: 45});
    // py-exercise: the page's lang, the project's feedback, the chapter's stop-after
    // (a component's own spelling beats ctm-assessment at any level).
    assert.equal(p.py.feedback, true);
    assert.equal(p.py.lang, 'de');
    assert.equal(p.py.stopAfter, 33);
    assert.equal(p.exercises[0].showTestHints, false);
    p = page(dir, 'chapter/other.html');
    assert.deepEqual(p.math, {lang: 'en', stopAfter: 45});
    assert.equal(p.check, 'Check');
    assert.equal(p.feedbackButtons, 0);
    assert.equal(p.py.lang, 'en');
    assert.equal(p.py.stopAfter, 33);
    p = page(dir, 'top.html');
    assert.deepEqual(p.math, {lang: 'en', stopAfter: 12});
    // A profile sets the language of every component (py-exercise has Bokmål now);
    // a component's own lang on the page still wins.
    render(dir, ['--profile', 'nb']);
    p = page(dir, 'chapter/other.html');
    assert.equal(p.math.lang, 'nb');
    assert.equal(p.check, 'Sjekk');
    assert.equal(p.py.lang, 'nb');
    assert.equal(page(dir, 'chapter/page.html').py.lang, 'de');
    // _quarto.yml.local overrides the project; the chapter's py-exercise stop-after still wins for py-exercise.
    fs.writeFileSync(path.join(dir, '_quarto.yml.local'), 'ctm-assessment:\n  stop-after: 50\n');
    render(dir);
    p = page(dir, 'chapter/other.html');
    assert.equal(p.math.stopAfter, 50);
    assert.equal(p.py.stopAfter, 33);
    assert.equal(page(dir, 'top.html').math.stopAfter, 12);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
