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

// A page only new has (a course's test page) is checked on its own (`new-only`).
// The switch here is a stand-in for ctm-libs' ui/ctm-reveal.js, as small as the
// harness needs: it opens and closes the reading steps, keeps the mode for the
// session, and opens them for print.
const STUB = `<style>@media print { .ctm-modes { display: none; } }</style>
<div class="ctm-modes" hidden><button type="button" data-mode="lecture" aria-pressed="true">Explore</button>
<button type="button" data-mode="reading" aria-pressed="false">Go deeper</button><span class="ctm-modes-status">Explore.</span></div>
<script>
const box = document.querySelector('.ctm-modes'), steps = () => document.querySelectorAll('details.reading-step');
const set = mode => {
  for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  box.querySelector('.ctm-modes-status').textContent = mode === 'reading' ? 'Go deeper.' : 'Explore.';
  for (const d of steps()) d.open = mode === 'reading';
  sessionStorage.setItem('mode', mode);
};
box.hidden = false;
box.addEventListener('click', event => { const b = event.target.closest('button'); if (b) set(b.dataset.mode); });
addEventListener('DOMContentLoaded', () => { if (sessionStorage.getItem('mode') === 'reading') set('reading'); });
let printed = null;
addEventListener('beforeprint', () => { printed = [...steps()].map(d => d.open); for (const d of steps()) d.open = true; });
addEventListener('afterprint', () => { [...steps()].forEach((d, k) => { d.open = printed[k]; }); });
</script>`;
const reveal = (kind, title, open = false) => `<details class="ctm-reveal ${kind}"${open ? ' open' : ''}><summary>${title}</summary><div class="ctm-reveal-body"><p>Text.</p></div></details>`;
const PICTURE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

test('a page only new has gets the new-only checks: reveals, switch, keyboard, print, embedded pages', () => {
  const fine = page(STUB + reveal('reading-step', 'Go deeper') + reveal('hint', 'Hint') + reveal('solution', 'Solution')
    + reveal('details', 'Details') + '<iframe class="ctm-embed" title="A picture" src="picture.svg" style="height:100px"></iframe>');
  const only = run => run.results.find(r => r.check === 'new-only' && r.page === 't.html');
  const sites = news => ({old: {'p.html': OLD}, new: {'p.html': page(REVEAL), 'picture.svg': PICTURE, ...news}});
  let run = compare(sites({'t.html': fine}), ['--checks', 'new-only']);
  assert.equal(run.status, 0, run.output);
  assert.match(only(run).note, /only on new: 1 reading-step, 1 hint, 1 solution, 1 details, all closed at first; the switch opens and closes 1 reading steps, keeps the mode on reload; 4 summaries toggle by Enter and Space; 1 embedded pages load/, only(run).note);
  // A reveal that starts open, and an embedded page that is not there.
  run = compare(sites({'t.html': fine.replace(reveal('hint', 'Hint'), reveal('hint', 'Hint', true)).replace('picture.svg', 'gone.svg')}), ['--checks', 'new-only']);
  assert.equal(run.status, 1, run.output);
  assert.match(only(run).note, /hint 2 \("Hint"\) starts open.*embedded page gone\.svg does not load/, only(run).note);
  // A switch that also closes the hints, and one that forgets its mode.
  run = compare(sites({'t.html': fine.replace("d.open = mode === 'reading';", "d.open = mode === 'reading'; for (const h of document.querySelectorAll('details.hint')) h.open = false;")}), ['--checks', 'new-only']);
  assert.match(only(run).note, /changed a hint, solution or details block/, only(run).note);
  run = compare(sites({'t.html': fine.replace("sessionStorage.setItem('mode', mode);", '')}), ['--checks', 'new-only']);
  assert.match(only(run).note, /reading mode is lost on reload/, only(run).note);
  // Pages both sides have are not new-only.
  assert.ok(!run.results.some(r => r.check === 'new-only' && r.page === 'p.html'), run.output);
});

test('a known failure can be limited to the place and the target of a link (`place`, `target`)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-browser-expect-'));
  try {
    const expect = path.join(dir, 'expect.yml');
    fs.writeFileSync(expect, ['known-failures:', '  - id: callout-target', '    title: a target in a collapsed callout',
      '    fix: none (test)', '    courses: [demo]', '    browsers: [chromium]', '    checks: [link load]', "    place: '^collapsed callout$'",
      "    target: '^t\\.html#in-callout$'", ''].join('\n'));
    // No ctm-nav.js is served: every link load fails. Only the one target in a
    // collapsed callout that the entry names is known; an expanded callout
    // (collapse show), a callout in a tab pane and another collapsed target are not.
    const target = page('<script src="ctm-nav.js"></script>' + REVEAL + '<p id="plain">Plain.</p>'
      + '<div class="callout-collapse collapse" id="c1"><div id="in-callout">Hidden.</div><div id="other-in-callout">Hidden too.</div></div>'
      + '<div class="callout-collapse collapse show" id="c2"><div id="in-open-callout">Shown.</div></div>'
      + '<div class="tab-content"><div class="tab-pane" id="p1"><div class="callout-collapse collapse" id="c3"><div id="pane-callout">Pane.</div></div></div></div>');
    const ids = ['plain', 'in-callout', 'other-in-callout', 'in-open-callout', 'pane-callout'];
    const links = page('<p>' + ids.map(id => `<a href="t.html#${id}">${id}</a>`).join(' ') + '</p>');
    const sites = {old: {'t.html': OLD, 'l.html': links}, new: {'t.html': target, 'l.html': links}};
    const run = compare(sites, ['--checks', 'links', '--expect', expect, '--course', 'demo']);
    const load = id => run.results.find(r => r.check === 'link load' && r.page === 't.html#' + id);
    assert.equal(load('in-callout').known, 'callout-target', run.output);
    for (const id of ['plain', 'other-in-callout', 'in-open-callout', 'pane-callout']) assert.ok(!load(id).ok && !load(id).known, id + ': ' + run.output);
    assert.equal(load('in-open-callout').place, 'plain', run.output);
    // Another course: not known.
    const other = compare(sites, ['--checks', 'links', '--expect', expect, '--course', 'else']);
    assert.ok(!other.results.find(r => r.check === 'link load' && r.page === 't.html#in-callout').known, other.output);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('new-only: a switch whose script did not run fails once, and the other pages are still checked', () => {
  const broken = page(STUB.replace('box.hidden = false;', '') + reveal('reading-step', 'Go deeper'));
  const fine = page(reveal('hint', 'Hint'));
  const run = compare({old: {'p.html': OLD}, new: {'p.html': page(REVEAL), 'a.html': broken, 'b.html': fine}}, ['--checks', 'new-only']);
  const only = name => run.results.find(r => r.check === 'new-only' && r.page === name);
  assert.match(only('a.html').note, /^the switch is not shown$/, run.output);
  assert.ok(only('b.html').ok, run.output);
});
