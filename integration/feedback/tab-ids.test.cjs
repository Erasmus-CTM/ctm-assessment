// tab-ids.lua (_extensions/ctm-assessment/): the project-level pre-ast filter
// that keeps the ids and attributes of tab headings (step 4, design §2.3).
// Fixture: integration/feedback/tab-ids. Each tab heading's id (written or
// automatic) and attributes move onto an empty div.ctm-tab-target, the first
// element of its tab pane; classes (.active) stay with the heading; nested
// tabsets and tabsets in callouts too; an id with a cross-reference prefix is
// not moved (one warning each, no figure or theorem in the page), nor is an
// id of the form of Quarto's pane ids (tabset-N-M, review A2 M4); the
// metadata flag ctm-tab-ids is set. With the package: markdown-lint is quiet
// with the line and names the page without it; a package without the file
// stops the render.
//
// The first test needs only Quarto and runs on its own as the Quarto-release
// canary (.github/workflows/quarto-versions.yml): if Quarto ever parsed
// tabsets before pre-ast filters, the filter would silently do nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {JSDOM} = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(__dirname, 'tab-ids');
const FILTER = path.join(ROOT, '_extensions', 'ctm-assessment', 'tab-ids.lua');
const site = process.env.CTM_INTEGRATION_SITE;
const QUARTO = process.env.QUARTO_BIN || 'quarto';

const PRE_AST = '  - path: _extensions/ctm-assessment/tab-ids.lua\n    at: pre-ast\n';
function config({preAst = true, packaged = true} = {}) {
  return 'project:\n  type: website\n  render: [index.qmd, plain.qmd]\nwebsite:\n  title: Tab ids\n'
    + 'crossref:\n  custom:\n    - kind: float\n      key: vid\n      reference-prefix: Video\n'
    + 'filters:\n' + (preAst ? PRE_AST : '') + (packaged ? '  - ctm-assessment\n' : '') + '  - _flag.lua\n'
    + (packaged ? 'ctm-assessment:\n  markdown-lint: true\n' : '');
}
// A copy of the fixture with its _quarto.yml and extensions: the repository's
// tab-ids.lua alone, or the built package (CTM_INTEGRATION_SITE).
function project(options) {
  const parent = options.packaged ? path.dirname(path.dirname(site)) : os.tmpdir();
  const dir = fs.mkdtempSync(path.join(parent, 'tab-ids-'));
  fs.cpSync(FIXTURE, dir, {recursive: true});
  fs.writeFileSync(path.join(dir, '_quarto.yml'), config(options));
  if (options.packaged) fs.cpSync(path.join(path.dirname(site), '_extensions'), path.join(dir, '_extensions'), {recursive: true});
  else fs.cpSync(FILTER, path.join(dir, '_extensions', 'ctm-assessment', 'tab-ids.lua'), {recursive: true});
  return dir;
}
function render(dir) {
  const result = spawnSync(QUARTO, ['render'], {cwd: dir, encoding: 'utf8', timeout: 300000});
  return {status: result.status, stderr: String(result.stderr || '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '')};
}
const page = (dir, name) => new JSDOM(fs.readFileSync(path.join(dir, '_site', name), 'utf8')).window.document;
const SKIPPED = ['fig-plot', 'thm-main', 'eq-one', 'sec-part', 'vid-intro'];

// The ids of tab headings are on their panes' first element; nothing else moved.
function checkTargets(doc, stderr) {
  const targets = [...doc.querySelectorAll('.ctm-tab-target')];
  assert.deepEqual(targets.map(target => target.id), ['plain-tab', 'uke3-del5', 'starts-active', 'inner-one', 'inner-two', 'in-callout']);
  for (const target of targets) {
    assert.equal(target.tagName, 'DIV', target.id);
    assert.equal(target.className, 'ctm-tab-target', target.id + ': the heading keeps its classes');
    assert.equal(target.textContent.trim(), '', target.id + ' is empty');
    const pane = target.parentElement;
    assert.ok(pane.classList.contains('tab-pane'), target.id + ' is in a tab pane');
    assert.equal(pane.firstElementChild, target, target.id + ' is the first element of its pane');
  }
  // Attributes move with the id (quiz= for quiz starts on tab titles).
  const polynomials = doc.getElementById('uke3-del5');
  assert.equal(polynomials.getAttribute('data-quiz'), 'm1-2');
  assert.equal(polynomials.getAttribute('data-note'), 'kept');
  // The pane of each target belongs to the tab whose heading carried the id.
  const title = id => doc.getElementById(doc.getElementById(id).parentElement.getAttribute('aria-labelledby')).textContent.trim();
  assert.equal(title('uke3-del5'), '3.5 Polynomer');
  assert.equal(title('inner-two'), 'Inner two');
  assert.equal(title('in-callout'), 'In a callout');
  assert.ok(doc.getElementById('in-callout').closest('.callout'), 'the tabset in the callout');
  // .active stays on the heading, where Quarto reads it: that tab is shown first.
  const active = [...doc.querySelectorAll('.panel-tabset')][0].querySelector(':scope > .nav-tabs .nav-link.active');
  assert.equal(active.textContent.trim(), 'Starts active');
  assert.ok(doc.getElementById('starts-active').parentElement.classList.contains('active'));
  // Headings inside tabs are not tab titles: they keep their ids.
  assert.equal(doc.getElementById('not-a-tab').closest('.ctm-tab-target'), null);
  assert.ok(/^(H4|SECTION)$/.test(doc.getElementById('not-a-tab').tagName));
  // Cross-reference ids are not moved: no element, no figure or theorem, one warning each.
  for (const id of SKIPPED) {
    assert.equal(doc.getElementById(id), null, '#' + id + ' is not kept');
    const warnings = stderr.split('\n').filter(line => line.includes('tab-ids.lua: the tab heading id #' + id + ' '));
    assert.equal(warnings.length, 1, '#' + id + ': one warning\n' + stderr);
  }
  assert.equal(doc.querySelectorAll('figure, .quarto-float, .theorem, .proof, .quarto-xref').length, 0, 'no float or theorem');
  assert.doesNotMatch(doc.body.textContent, /Figure\s*1|Theorem\s*1|Video\s*1/);
  // An id of the form tabset-N-M is not moved: the page has it once, on Quarto's pane.
  assert.equal(doc.querySelectorAll('[id="tabset-1-2"]').length, 1);
  assert.ok(doc.getElementById('tabset-1-2').classList.contains('tab-pane'));
  assert.equal(stderr.split('\n').filter(line => line.includes("tab-ids.lua: the tab heading id #tabset-1-2 has the form of Quarto's own")).length, 1, stderr);
  // No id twice.
  const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
  assert.deepEqual(ids.filter((id, k) => ids.indexOf(id) !== k), [], 'duplicate ids');
  // The flag for markdown-lint.
  assert.equal(doc.getElementById('ctm-tab-ids-flag')?.textContent, 'true');
}

test('tab-ids.lua moves tab-heading ids and attributes into their panes (Quarto alone; release canary)', () => {
  const dir = project({packaged: false});
  try {
    const {status, stderr} = render(dir);
    assert.equal(status, 0, stderr);
    checkTargets(page(dir, 'index.html'), stderr);
    // A page without tabsets is unchanged, apart from the flag.
    const plain = page(dir, 'plain.html');
    assert.equal(plain.querySelectorAll('.ctm-tab-target').length, 0);
    assert.ok(plain.getElementById('a-section'));
    assert.equal(plain.getElementById('ctm-tab-ids-flag')?.textContent, 'true');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('with the package: the ids reach ctm-libs, links into tabs load, markdown-lint is quiet', {skip: !site}, () => {
  const dir = project({packaged: true});
  try {
    const {status, stderr} = render(dir);
    assert.equal(status, 0, stderr);
    const doc = page(dir, 'index.html');
    checkTargets(doc, stderr);
    assert.doesNotMatch(stderr, /markdown-lint/, 'no lint warning with the line');
    assert.ok([...doc.scripts].some(script => /ctm-nav\.js$/.test(script.getAttribute('src') || '')), 'ctm-nav.js on a page with tabs');
    // The shipped file is the repository's.
    assert.equal(fs.readFileSync(path.join(dir, '_extensions', 'ctm-assessment', 'tab-ids.lua'), 'utf8'), fs.readFileSync(FILTER, 'utf8'));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('without the line the ids stay dead and markdown-lint names the page with tabsets', {skip: !site}, () => {
  const dir = project({packaged: true, preAst: false});
  try {
    const {status, stderr} = render(dir);
    assert.equal(status, 0, stderr);
    const doc = page(dir, 'index.html');
    assert.equal(doc.querySelectorAll('.ctm-tab-target').length, 0);
    assert.equal(doc.getElementById('uke3-del5'), null, 'Quarto drops tab-heading ids');
    assert.equal(doc.getElementById('ctm-tab-ids-flag'), null);
    const lint = stderr.split('\n').filter(line => /markdown-lint: .* has tabsets, but Quarto drops the ids of their tab headings/.test(line));
    assert.equal(lint.length, 1, stderr);
    assert.match(lint[0], /index\.qmd/);
    assert.match(lint[0], /_extensions\/ctm-assessment\/tab-ids\.lua, at: pre-ast/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('a package without tab-ids.lua stops the render (the fail-safe against an older package)', {skip: !site}, () => {
  const dir = project({packaged: true});
  try {
    fs.rmSync(path.join(dir, '_extensions', 'ctm-assessment', 'tab-ids.lua'));
    const {status, stderr} = render(dir);
    assert.notEqual(status, 0, 'the render must stop');
    assert.match(stderr, /tab-ids\.lua/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
