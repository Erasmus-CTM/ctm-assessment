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
function compare(after, before = OLD, ends = null) {
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
      ...EXPECT.flatMap(file => ['--expect', file]), '--report', report, ...(ends ? ['--reveal-ends', record] : [])], {encoding: 'utf8'});
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    return JSON.parse(fs.readFileSync(report, 'utf8')).items;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
const invariants = items => items.filter(item => item.invariant).map(item => item.change + (item.reveal ? ' ' + item.reveal : ''));

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
