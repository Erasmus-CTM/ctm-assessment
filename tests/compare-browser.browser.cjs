// CTM Assessment (AGPL-3.0-or-later): tools/compare-browser.mjs in Chromium
// on small sites, old against new (npm run test:browser; needs Playwright's
// Chromium). The reveals check and the console comparison:
//  - a reveal that swallowed the heading after it fails, also when a callout
//    inside the old <details> has a heading (review A2c S1);
//  - our own page's console error is not hidden by a JSXGraph board's error
//    with the same text, on another page or on the same one (review A2c S3).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'compare-browser.mjs');
const EXPECT = path.join(ROOT, 'tools', 'compare-rendered', 'expect', 'step4-migration.yml');

// Runs the tool on {old: {page: html}, new: {page: html}}: {status, results, output}.
function compare(sites, args = [], ends = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-browser-'));
  try {
    for (const [side, pages] of Object.entries(sites)) {
      for (const [name, html] of Object.entries(pages)) {
        fs.mkdirSync(path.join(dir, side), {recursive: true});
        fs.writeFileSync(path.join(dir, side, name), html);
      }
    }
    const record = path.join(dir, 'reveal-ends.json');
    if (ends) fs.writeFileSync(record, JSON.stringify({version: 1, pages: ends}));
    const report = path.join(dir, 'report.json');
    const result = spawnSync(process.execPath, [TOOL, '--old', path.join(dir, 'old'), '--new', path.join(dir, 'new'), '--offline',
      '--checks', 'reveals', '--expect', EXPECT, '--report', report, ...(ends ? ['--reveal-ends', record] : []), ...args],
    {encoding: 'utf8', timeout: 180000});
    assert.ok(result.status === 0 || result.status === 1, result.stdout + result.stderr);
    return {status: result.status, results: JSON.parse(fs.readFileSync(report, 'utf8')).results, output: result.stdout};
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

test('a reveal that took in the heading after a callout\'s <details> fails the reveals check', () => {
  const read = name => fs.readFileSync(path.join(__dirname, 'swallowed-heading', name), 'utf8');
  const sites = {old: {'zz.html': read('old.html')}, new: {'zz.html': read('new.html')}};
  // [false]: what migrate-course-html.py --reveal-ends records for old.qmd
  // (test_migrate_course_html.py); without a record the check is as strict.
  for (const ends of [{'zz.html': [false]}, null]) {
    const {status, results, output} = compare(sites, [], ends);
    assert.equal(status, 1, output);
    const reveals = results.find(r => r.check === 'reveals' && r.page === 'zz.html');
    assert.ok(!reveals.ok && /took in the heading after it/.test(reveals.note), reveals.note);
  }
  // Only the miscount the review found ([true]) would have let it pass.
  const {status, output} = compare(sites, [], {'zz.html': [true]});
  assert.equal(status, 0, output);
});

const page = body => '<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body><main><p>Tekst.</p>'
  + body + '</main></body></html>';
const OLD = page('<details class="reading-step"><summary>Gå i dybden</summary><p>En to tre.</p></details>');
const REVEAL = '<details class="ctm-reveal reading-step"><summary>Gå i dybden</summary><div class="ctm-reveal-body"><p>En to tre.</p></div></details>';
const LOOP = 'ResizeObserver loop completed with undelivered notifications.';
// A JSXGraph board (jsxgraph-quarto's iframe) whose resize loops: a known failure.
const BOARD = `<iframe name="iframeJXGboard1" srcdoc="<script>setTimeout(() => { throw new Error('${LOOP}'); }, 50)</script>"></iframe>`;
// Our own page code with the same message, from the page's frame (as WebKit logs a page-level loop).
const OWN = `<script>setTimeout(() => console.error('${LOOP}'), 400);</script>`;

test('a page\'s own console error is not taken for a board\'s error with the same text', () => {
  const failures = run => run.results.filter(r => r.check === 'console' && r.page !== '-' && !r.ok).map(r => `${r.frame} ${r.page}`);
  // The case of the review: the board on p, our page's error on q.
  let run = compare({old: {'p.html': OLD, 'q.html': OLD}, new: {'p.html': page(REVEAL + BOARD), 'q.html': page(REVEAL + OWN)}});
  assert.equal(run.status, 1, run.output);
  assert.deepEqual(failures(run), ['page q.html'], run.output);
  const board = run.results.filter(r => r.check === 'console' && r.ok && r.known === 'jsxgraph-resize-loop');
  assert.deepEqual(board.map(r => `${r.frame} ${r.page}`), ['iframe: JSXGraph board (jsxgraph-quarto) p.html'], run.output);
  // Both on one page: the page's error is still the page's.
  run = compare({old: {'r.html': OLD}, new: {'r.html': page(REVEAL + BOARD + OWN)}});
  assert.deepEqual(failures(run), ['page r.html'], run.output);
  // The board alone: its known failure, and nothing else.
  run = compare({old: {'p.html': OLD}, new: {'p.html': page(REVEAL + BOARD)}});
  assert.equal(run.status, 0, run.output);
});
