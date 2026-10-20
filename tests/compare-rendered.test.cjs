// tools/compare-rendered.mjs: the invariants that no expected category can
// explain (review A2 S1, S3). A reveal keeps its words (more only as the
// words that followed a raw <details> closed early by a heading), the
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

function compare(after, before = OLD) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-rendered-'));
  try {
    for (const [side, html] of [['before', before], ['after', after]]) {
      fs.mkdirSync(path.join(dir, side));
      fs.writeFileSync(path.join(dir, side, 'uke6.html'), html);
    }
    const report = path.join(dir, 'report.json');
    const result = spawnSync(process.execPath, [TOOL, '--before', path.join(dir, 'before'), '--after', path.join(dir, 'after'),
      ...EXPECT.flatMap(file => ['--expect', file]), '--report', report], {encoding: 'utf8'});
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

test('a heading that escaped a raw <details> and is inside the reveal now: "heading", explained', () => {
  const before = page(`${OLD_SWITCH}<section id="a" class="level3"><h3>A</h3><details class="reading-step"><summary>Gå i dybden</summary>`
    + '<p>En.</p></details></section><section id="b" class="level3"><h3>B</h3><p>To.</p></section><p>Etter.</p>');
  const after = page(`${NEW_SWITCH}<section id="a" class="level3"><h3>A</h3>`
    + reveal('<p>En.</p><section id="b" class="level3"><h3>B</h3><p>To.</p></section>') + '</section><p>Etter.</p>');
  const items = compare(after, before);
  assert.deepEqual(invariants(items), []);
  const ends = items.filter(item => /^<\/details/.test(item.line || ''));
  assert.ok(ends.length >= 2 && ends.every(item => item.reveal === 'heading' && item.category === 'reveal-heading'), JSON.stringify(ends));
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
