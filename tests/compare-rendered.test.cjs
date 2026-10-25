// tools/compare-rendered.mjs: the invariants that no expected category can
// explain (review A2 S1, S3; A2b S1). A reveal keeps its words (more only as
// the words that followed a raw <details> closed early by a heading), the
// lecture/reading switch stays where it was or goes to the top of the page,
// and no id occurs more often than before. Small sites, old against new.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'compare-rendered.mjs');
const EXPECT = ['step4.yml', 'step4-migration.yml'].map(name => path.join(ROOT, 'tools', 'compare-rendered', 'expect', name));

const page = main => `<!doctype html><html><head><title>t</title></head><body><div id="quarto-content">`
  + `<main id="quarto-document-content" class="content"><header id="title-block-header"><h1>Uke 6</h1></header>${main}</main></div></body></html>`;
const OLD_SWITCH = '<div class="learning-mode" data-learning-mode=""><p><button data-mode="lecture">Forelesning</button>'
  + '<button data-mode="reading">Gå i dybden</button></p></div>';
const NEW_SWITCH = '<div class="ctm-modes" hidden=""><button data-mode="lecture">Forelesning</button>'
  + '<button data-mode="reading">Gå i dybden</button></div>';
const reveal = body => `<details class="ctm-reveal reading-step"><summary>Gå i dybden</summary><div class="ctm-reveal-body">${body}</div></details>`;
const OLD = page(`<p>Innledning.</p>${OLD_SWITCH}<section id="a" class="level2"><h2>A</h2>`
  + '<details class="reading-step"><summary>Gå i dybden</summary><p>En.</p><p>To.</p><p>Tre.</p></details><p>Etter.</p></section>');

// `ends`: the old course's record of how its <details> ended
// (migrate-course-html.py --reveal-ends), for uke6.html.
function compare(after, before = OLD, ends = null, extraExpect = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-rendered-'));
  try {
    for (const [side, html] of [['before', before], ['after', after]]) {
      fs.mkdirSync(path.join(dir, side));
      fs.writeFileSync(path.join(dir, side, 'uke6.html'), html);
    }
    const record = path.join(dir, 'reveal-ends.json');
    if (ends) fs.writeFileSync(record, JSON.stringify({version: 1, pages: {'uke6.html': ends}}));
    const report = path.join(dir, 'report.json');
    const result = spawnSync(process.execPath, [TOOL, '--before', path.join(dir, 'before'), '--after', path.join(dir, 'after'),
      ...[...EXPECT, ...extraExpect].flatMap(file => ['--expect', file]), '--report', report, ...(ends ? ['--reveal-ends', record] : [])], {encoding: 'utf8'});
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    return JSON.parse(fs.readFileSync(report, 'utf8')).items;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
const invariants = items => items.filter(item => item.invariant).map(item => item.change + (item.reveal ? ' ' + item.reveal : ''));

test('generated policy notes accept only the sole exact STACK policy copy', () => {
  const yaml = require('js-yaml');
  const policy = {'max-words': 120, 'base-prompt': 'Preserve the task.', steps: [{'step-prompt': 'Ask one question.'}]};
  const data = {'ai-feedback': {defaults: {'max-words': 250}, integrations: {'math-exercise': policy}}};
  const notes = (value, prose = 'Authored explanation.') => page(`<p>${prose}</p><div class="example-author-notes ai-feedback-ignore">`
    + `<details><summary>Show policy YAML</summary><pre><code class="language-yaml">${yaml.dump(value)}</code></pre></details></div>`);
  const after = structuredClone(data);
  after['ai-feedback'].integrations.stack = structuredClone(policy);
  const expect = [path.join(ROOT, 'tools/compare-rendered/expect/step6-a1.yml')];
  const good = compare(notes(after), notes(data), null, expect);
  assert.equal(good.length, 1);
  assert.equal(good[0].category, 'step6-stack-policy-notes');
  for (const mutate of [
    d => { d['ai-feedback'].integrations.stack['base-prompt'] = 'Different prompt.'; },
    d => { d['ai-feedback'].defaults['max-words'] = 200; },
    d => { d['ai-feedback'].integrations['math-exercise']['max-words'] = 99; },
    d => { delete d['ai-feedback'].integrations['math-exercise']; }
  ]) {
    const changed = structuredClone(after); mutate(changed);
    const items = compare(notes(changed), notes(data), null, expect);
    assert.ok(items.some(x => x.invariant), JSON.stringify(items));
    assert.ok(items.every(x => x.category !== 'step6-stack-policy-notes'));
  }
  assert.ok(compare(notes(after, 'Changed prose.'), notes(data), null, expect).some(x => !x.category));
});

test('the migration as expected: no invariant is broken, the reveal is "same"', () => {
  const items = compare(page(`<p>Innledning.</p>${NEW_SWITCH}<section id="a" class="level2"><h2>A</h2>`
    + reveal('<p>En.</p><p>To.</p><p>Tre.</p>') + '<p>Etter.</p></section>'));
  assert.deepEqual(invariants(items), []);
  assert.ok(items.some(item => item.reveal === 'same'));
});

test('a reveal closed too early is unexplained (the reviewer\'s mutation of uke6)', () => {
  const items = compare(page(`<p>Innledning.</p>${NEW_SWITCH}<section id="a" class="level2"><h2>A</h2>`
    + reveal('<p>En.</p>') + '<p>To.</p><p>Tre.</p><p>Etter.</p></section>'));
  assert.deepEqual(invariants(items), ['reveal content changed shrunk']);
  // Its end tags are no longer a "heading" case either.
  assert.ok(!items.some(item => item.category === 'reveal-heading'));
});

test('a reveal that holds other words is unexplained', () => {
  const items = compare(page(`<p>Innledning.</p>${NEW_SWITCH}<section id="a" class="level2"><h2>A</h2>`
    + reveal('<p>En.</p><p>To.</p><p>Fire.</p>') + '<p>Etter.</p></section>'));
  assert.deepEqual(invariants(items), ['reveal content changed changed']);
});

// Old as the browser (and Quarto's output) has it: the <details> ends where
// the section does, and the heading after it stands outside. On new the
// reveal holds that heading.
const BEFORE_HEADING = page(`${OLD_SWITCH}<section id="a" class="level3"><h3>A</h3><details class="reading-step"><summary>Gå i dybden</summary>`
  + '<p>En.</p></details></section><section id="b" class="level3"><h3>B</h3><p>To.</p></section><p>Etter.</p>');
const AFTER_HEADING = page(`${NEW_SWITCH}<section id="a" class="level3"><h3>A</h3>`
  + reveal('<p>En.</p><section id="b" class="level3"><h3>B</h3><p>To.</p></section>') + '</section><p>Etter.</p>');

test('a heading that escaped a raw <details> and is inside the reveal now: "heading", explained', () => {
  // The course's Markdown had the heading inside the raw <details> (--reveal-ends: true).
  const items = compare(AFTER_HEADING, BEFORE_HEADING, [true]);
  assert.deepEqual(invariants(items), []);
  const ends = items.filter(item => /^<\/details/.test(item.line || ''));
  assert.ok(ends.length >= 2 && ends.every(item => item.reveal === 'heading' && item.category === 'reveal-heading'), JSON.stringify(ends));
});

test('a reveal that swallowed the next heading is unexplained (the reviewer\'s mutation of week6_preconditioning)', () => {
  // The same pages, but old's <details> had its own </details> before the
  // heading: a closing fence moved past the heading, not a raw <details>
  // closed early. Without the record, nothing may take in a heading either.
  for (const ends of [[false], null]) {
    const items = compare(AFTER_HEADING, BEFORE_HEADING, ends);
    assert.deepEqual(invariants(items), ['reveal content changed swallowed'], JSON.stringify(ends));
    assert.ok(!items.some(item => item.category === 'reveal-heading'), 'no "heading" case');
  }
});

test('a reveal with a callout that swallowed the next heading is unexplained (the A2c reviewer\'s page)', () => {
  // tests/swallowed-heading: old.qmd has a callout titled "### Merk" inside
  // its raw <details>, which a div-aware --reveal-ends does not count ([false],
  // asserted in test_migrate_course_html.py); new.qmd moved the reveal's
  // closing fence past "### B". Neither with that record nor without one is it
  // explained, and nothing is a "heading" case.
  const read = name => fs.readFileSync(path.join(__dirname, 'swallowed-heading', name), 'utf8');
  for (const ends of [[false], null]) {
    const items = compare(read('new.html'), read('old.html'), ends);
    assert.deepEqual(invariants(items), ['reveal content changed swallowed'], JSON.stringify(ends));
    assert.ok(!items.some(item => item.category === 'reveal-heading'), 'no "heading" case');
  }
  // Only the miscount the review found ([true]: the callout's heading taken
  // for one that closed the <details>) would have let it pass.
  assert.deepEqual(invariants(compare(read('new.html'), read('old.html'), [true])), []);
});

test('a record that counts other <details> than the page has decides nothing', async () => {
  const {closedBySection} = await import('../tools/compare-rendered/reveal-ends.mjs');
  const {JSDOM} = require('jsdom');
  const doc = new JSDOM('<details id="a"></details><div class="py-exercise-cell"><details id="c"></details></div><details id="b"></details>').window.document;
  const all = [...doc.querySelectorAll('details')];
  assert.deepEqual(closedBySection({'p.html': [false, true]}, 'p.html', all), [false, false, true], 'component <details> are not counted');
  assert.deepEqual(closedBySection({'p.html': [true]}, 'p.html', all), [false, false, false]);
  assert.deepEqual(closedBySection(null, 'p.html', all), [false, false, false]);
});

test('a switch moved down the page is unexplained; one moved to the top is not', () => {
  const body = '<section id="a" class="level2"><h2>A</h2>' + reveal('<p>En.</p><p>To.</p><p>Tre.</p>') + '<p>Etter.</p></section>';
  let items = compare(page(`<p>Innledning.</p>${body}${NEW_SWITCH}`));
  assert.deepEqual(invariants(items), ['switch moved']);
  // At the top: what stood above the old switch now stands below it ("above-to-below").
  items = compare(page(`${NEW_SWITCH}<p>Innledning.</p>${body}`));
  assert.deepEqual(invariants(items), []);
  // What stood above the old switch, moved further down than directly below the new one, is not explained.
  items = compare(page(`${NEW_SWITCH}${body}<p>Innledning.</p>`));
  const moved = items.filter(item => item.change === 'moved' && item.ancestors.endsWith('main#quarto-document-content.content'));
  assert.ok(moved.length && moved.every(item => item.switchOrder === 'other' && !item.category), JSON.stringify(moved));
});

test('an id that the new page has twice is unexplained', () => {
  const items = compare(page(`<p>Innledning.</p>${NEW_SWITCH}<section id="a" class="level2"><h2>A</h2>`
    + reveal('<p>En.</p><p>To.</p><p>Tre.</p>') + '<p>Etter.</p><div id="a"></div></section>'));
  assert.deepEqual(invariants(items), ['duplicate id']);
});

test('a migrated course on both sides: the new switch where it stood is no difference, one moved down is', () => {
  const body = '<section id="a" class="level2"><h2>A</h2>' + reveal('<p>En.</p><p>To.</p><p>Tre.</p>') + '<p>Etter.</p></section>';
  const before = page(`<p>Innledning.</p>${NEW_SWITCH}${body}`);
  assert.deepEqual(invariants(compare(before, before)), []);
  assert.deepEqual(invariants(compare(page(`<p>Innledning.</p>${body}${NEW_SWITCH}`), before)), ['switch moved']);
});

// Constructs a migration may replace but never drop (the review of step 3's
// set, addendum 3: a migration that dropped the switch was "explained", since
// modes-switch explains the old switch's removal and says nothing about the
// new one). No expected category can explain these.
const BODY = '<section id="a" class="level2"><h2>A</h2>' + reveal('<p>En.</p><p>To.</p><p>Tre.</p>') + '<p>Etter.</p></section>';

test('a migration that drops the switch is unexplained (mutation: the new page has no .ctm-modes)', () => {
  // As expected, with the switch: nothing.
  assert.deepEqual(invariants(compare(page(`<p>Innledning.</p>${NEW_SWITCH}${BODY}`))), []);
  // The switch is gone, everything else as expected. The old switch's
  // removal is still explained (modes-switch), the missing one is not.
  const items = compare(page(`<p>Innledning.</p>${BODY}`));
  assert.deepEqual(invariants(items), ['switch dropped']);
  assert.ok(items.some(item => item.change === 'removed' && item.category === 'modes-switch'), 'the old switch\'s removal is explained');
  const dropped = items.find(item => item.change === 'switch dropped');
  assert.deepEqual([dropped.before, dropped.after, dropped.category], [1, 0, null]);
  // A page that is migrated on both sides loses its switch the same way.
  assert.deepEqual(invariants(compare(page(`<p>Innledning.</p>${BODY}`), page(`<p>Innledning.</p>${NEW_SWITCH}${BODY}`))), ['switch dropped']);
});

test('a switch on a page without reading steps may go (nothing to switch); a second switch may not come', () => {
  const none = '<section id="a" class="level2"><h2>A</h2><p>Ingen steg.</p></section>';
  assert.deepEqual(invariants(compare(page(`<p>Innledning.</p>${none}`), page(`<p>Innledning.</p>${OLD_SWITCH}${none}`))), []);
  assert.deepEqual(invariants(compare(page(`<p>Innledning.</p>${NEW_SWITCH}${NEW_SWITCH}${BODY}`))), ['switch duplicated']);
  // A hand-written switch left behind next to the new one.
  assert.deepEqual(invariants(compare(page(`<p>Innledning.</p>${NEW_SWITCH}${OLD_SWITCH}${BODY}`))), ['switch duplicated']);
});

const TABSET = '<div class="panel-tabset"><ul class="nav nav-tabs" role="tablist"><li><a class="nav-link active" role="tab">A</a></li></ul>'
  + '<div class="tab-content"><div id="tabset-1-1" class="tab-pane active" role="tabpanel"><p>I fanen.</p></div></div></div>';
const CALLOUT = '<div class="callout callout-style-default callout-note"><div class="callout-body-container"><p>Merk.</p></div></div>';
const EMBED = '<iframe src="assets/svd.html" title="SVD"></iframe>';

test('a tabset, an embedded page or a callout that the new page lacks is unexplained, and named', () => {
  const full = page(`<p>Innledning.</p>${NEW_SWITCH}${BODY}${TABSET}${EMBED}${CALLOUT}`);
  assert.deepEqual(invariants(compare(full, full)), []);
  const without = (...parts) => page(`<p>Innledning.</p>${NEW_SWITCH}${BODY}${parts.join('')}`);
  assert.deepEqual(invariants(compare(without(EMBED, CALLOUT), full)), ['tabset dropped', 'tab pane dropped']);
  assert.deepEqual(invariants(compare(without(TABSET, CALLOUT), full)), ['embedded page dropped']);
  assert.deepEqual(invariants(compare(without(TABSET, EMBED), full)), ['callout dropped']);
  // More of them than before is no drop.
  assert.deepEqual(invariants(compare(page(`<p>Innledning.</p>${NEW_SWITCH}${BODY}${TABSET}${TABSET.replace('tabset-1-1', 'tabset-2-1')}${EMBED}${CALLOUT}`), full)), []);
});

test('a hand-written anchor that a link points to must stay; the components\' empty placeholders are no anchors', () => {
  const link = '<p><a href="#uke6-start">Til starten</a> <a href="other.html#uke6-gone">andre</a></p>';
  const anchors = '<div id="uke6-start"></div><div id="uke6-gone"></div><div id="qpyodide-insertion-location-1"></div><div id="unlinked"></div>';
  const before = page(`${OLD_SWITCH}${link}${anchors}${OLD_BODY_FOR_ANCHORS}`);
  const after = anchors => page(`${NEW_SWITCH}${link}${anchors}${NEW_BODY_FOR_ANCHORS}`);
  // Kept, also as the tab-title target the migration makes of it.
  assert.deepEqual(invariants(compare(after(anchors.replace('<div id="uke6-start">', '<div id="uke6-start" class="ctm-tab-target">')), before)), []);
  // A linked one gone (in-page link, and a link from another page); an unlinked one and a placeholder are not counted.
  const items = compare(after('<div id="uke6-start"></div>'), before);
  assert.deepEqual(invariants(items), ['anchor dropped']);
  assert.equal(items.find(item => item.change === 'anchor dropped').line, '<div id="uke6-gone">');
});
const OLD_BODY_FOR_ANCHORS = '<section id="a" class="level2"><h2>A</h2><details class="reading-step"><summary>Gå i dybden</summary><p>En.</p></details></section>';
const NEW_BODY_FOR_ANCHORS = '<section id="a" class="level2"><h2>A</h2>' + reveal('<p>En.</p>') + '</section>';

test('a course that is not migrated on either side keeps its hand-written switch: no drop', () => {
  const before = page(`<p>Innledning.</p>${OLD_SWITCH}${OLD_BODY_FOR_ANCHORS}`);
  assert.deepEqual(invariants(compare(before, before)), []);
  // ... but loses nothing silently when it goes.
  assert.deepEqual(invariants(compare(page(`<p>Innledning.</p>${OLD_BODY_FOR_ANCHORS}`), before)), ['switch dropped']);
});

// A page that grew long (ingmat3a's weeks 8 to 12 after their restructuring:
// about 12000 lines in the table of the difference) is compared line by line,
// not as one changed block (the line table was capped at 6e7 cells, and a
// longer page became one hunk that nothing could explain).
test('a long page: only what the migration changed differs, and a real change in it is found', () => {
  const steps = 40, per = 100;
  const paragraphs = k => Array.from({length: per}, (_, i) => `<p>Avsnitt ${k}.${i} med litt tekst.</p>`).join('');
  const body = make => Array.from({length: steps}, (_, k) => make(k) + paragraphs(k)).join('');
  const oldStep = k => `<details class="reading-step"><summary>Gå i dybden</summary><p>Trinn ${k}.</p></details>`;
  const newStep = k => reveal(`<p>Trinn ${k}.</p>`);
  const before = page(`<p>Innledning.</p>${OLD_SWITCH}<section id="a" class="level2"><h2>A</h2>${body(oldStep)}</section>`);
  const after = page(`<p>Innledning.</p>${NEW_SWITCH}<section id="a" class="level2"><h2>A</h2>${body(newStep)}</section>`);
  const items = compare(after, before);
  assert.ok(items.length > 0 && items.length < 2000, 'the differences are the migration\'s, not the page: ' + items.length);
  assert.deepEqual(items.filter(item => !item.category && !item.invariant).slice(0, 3), []);
  assert.deepEqual(invariants(items), []);
  // One paragraph in the middle of the page changes: it is reported, and only it.
  const changed = compare(after.replace('Avsnitt 20.50 med litt tekst.', 'Avsnitt 20.50 med andre ord.'), before);
  const unexplained = changed.filter(item => !item.category && !item.invariant);
  assert.ok(unexplained.length > 0 && unexplained.length <= 4, 'the changed paragraph: ' + unexplained.length);
  assert.ok(JSON.stringify(unexplained).includes('andre ord'));
});


test('a retained switch needs both real mode buttons with nonempty labels (HTML mutations)', () => {
  const after = controls => page(`<p>Innledning.</p>${controls}${BODY}`);
  const before = after(NEW_SWITCH);
  assert.deepEqual(invariants(compare(before)), []);
  for (const controls of [
    '<div class="ctm-modes"></div>',
    '<div class="ctm-modes"><button data-mode="lecture">Lecture</button></div>',
    '<div class="ctm-modes"><button data-mode="lecture">Lecture</button><button data-mode="other">Reading</button></div>',
    '<div class="ctm-modes"><span data-mode="lecture">Lecture</span><span data-mode="reading">Reading</span></div>',
    '<div class="ctm-modes"><button data-mode="lecture"> </button><button data-mode="reading">Reading</button></div>',
    '<div class="ctm-modes"><button data-mode="lecture">Lecture</button><button data-mode="reading"> </button></div>',
  ]) {
    // Check both the original-to-migrated and already-migrated comparisons.
    for (const baseline of [OLD, before]) {
      const items = compare(after(controls), baseline);
      assert.deepEqual(invariants(items), ['switch controls missing'], controls);
      assert.equal(items.find(item => item.change === 'switch controls missing').category, null);
    }
  }
  // Labels are localized; require content without freezing their wording.
  const localized = NEW_SWITCH.replace('Forelesning', '<span>Lecture</span>');
  assert.deepEqual(invariants(compare(after(localized), after(localized))), []);
});
