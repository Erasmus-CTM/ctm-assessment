// CTM Assessment (AGPL-3.0-or-later): tools/compare-browser.mjs without a
// browser. The first visit's sample of link targets is stratified: each kind
// of place a target stands in, on each page, is loaded (review A2c S4: on
// linalg-branch targets inside a <details> and cross-page targets in nested
// panes were never loaded).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const TOOL = pathToFileURL(path.resolve(__dirname, '..', 'tools', 'compare-browser.mjs')).href;
const page = main => `<!doctype html><html><head><title>t</title><script src="site_libs/ctm-libs/ctm-nav.js"></script></head>`
  + `<body><main>${main}</main></body></html>`;
const pane = (id, body, active = '') => `<div id="${id}" class="tab-pane${active}">${body}</div>`;
const tabset = (title, panes) => `<div class="panel-tabset"><span id="${title}" class="ctm-tab-target"></span><div class="tab-content">${panes}</div></div>`;
// a.html: every kind of place, and links to two of its own; b.html links to the others.
const KINDS = {
  'p-pane': 'pane', 'p-nested': 'nested pane', 'p-details': 'pane + details', 'p-callout': 'pane + collapsed callout',
  'p-outer': 'tab title', 'p-inner': 'nested tab title', 'p-plain': 'plain', 'p-top-details': 'details',
};
const SITE = {
  'a.html': page(`<p id="p-plain">Plain.</p><p id="p-plain2">Plain.</p><details><summary>S</summary><p id="p-top-details">D</p></details>`
    + tabset('p-outer', pane('a-1', '<p id="p-pane">P</p><p id="p-pane2">P</p><p id="p-pane3">P</p>'
      + '<details><summary>S</summary><p id="p-details">D</p><p id="p-details2">D</p><p id="p-details3">D</p></details>'
      + '<div class="callout"><div id="c1" class="callout-collapse collapse"><p id="p-callout">C</p></div></div>', ' active')
      + pane('a-2', tabset('p-inner', pane('a-2-1', '<p id="p-nested">N</p><p id="p-nested2">N</p>', ' active'))))
    + '<p><a href="#p-pane3">same</a> <a href="#p-details3">same</a></p>'),
  'b.html': page(Object.keys(KINDS).concat(['p-plain2', 'p-pane2', 'p-details2', 'p-nested2'])
    .map(id => `<a href="a.html#${id}">${id}</a>`).join(' ')),
};

test('the first visit loads a target of each kind on each page, and says which', async () => {
  const {inventory, sampleTargets} = await import(TOOL);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-browser-'));
  try {
    for (const [name, html] of Object.entries(SITE)) fs.writeFileSync(path.join(root, name), html);
    const inventories = {};
    for (const name of Object.keys(SITE)) inventories[name] = {new: inventory(root, name, 'new', null)};
    for (const [id, kind] of Object.entries(KINDS)) assert.equal(inventories['a.html'].new.places.get(id), kind, id);
    // The links' targets, as links() makes them.
    const links = Object.values(inventories).flatMap(v => v.new.links);
    const targets = [...new Map(links.map(link => [link.target + '#' + link.id, link])).values()];
    const full = sampleTargets(targets, inventories, false);
    assert.equal(full.targets.length, 14);
    const sample = sampleTargets(targets, inventories, true);
    assert.deepEqual(sample.missing, []);
    assert.deepEqual(sample.covered.map(k => k.replace(/ \d+$/, '')), full.every.map(k => k.replace(/ \d+$/, '')));
    for (const kind of ['pane + details, other page', 'pane + details, same page', 'nested pane, other page',
      'pane + collapsed callout, other page', 'details, other page', 'nested tab title, other page'])
      assert.ok(sample.covered.some(k => k.startsWith(kind + ' ')), kind + ': ' + sample.covered.join(', '));
    // One of each kind, and every tab title: fewer loads than the full run.
    assert.equal(sample.targets.length, full.every.length);
    assert.ok(sample.targets.length < full.targets.length);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('the HTTP server preserves the default and exposes an explicit standard isolation policy', async t => {
  const {serve} = await import(TOOL);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-browser-headers-'));
  const html = '<!doctype html><title>Actual served bytes</title><script src="runtime.js"></script>';
  const script = 'const runtime = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.js";';
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fs.writeFileSync(path.join(root, 'runtime.js'), script);
  try {
    for (const [name, args, expected] of [
      ['existing default', [], 'credentialless'],
      ['explicit credentialless', [true, 'credentialless'], 'credentialless'],
      ['standard require-corp', [true, 'require-corp'], 'require-corp'],
      ['first visit stays unisolated', [false, 'require-corp'], null],
    ]) {
      await t.test(name, async () => {
        const server = await serve({course: root}, ...args);
        try {
          for (const file of ['index.html', 'runtime.js']) {
            const response = await fetch('http://127.0.0.1:' + server.address().port + '/course/' + file,
              {headers: {connection: 'close'}});
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('cross-origin-opener-policy'), expected ? 'same-origin' : null);
            assert.equal(response.headers.get('cross-origin-embedder-policy'), expected);
            const body = await response.text();
            if (file === 'index.html') assert.equal(body, html);
            else if (expected) assert.equal(body, script, 'isolated serving leaves runtime bytes intact');
            else {
              assert.match(body, /127\.0\.0\.1:9\//, 'first visit retains its existing heavy-runtime rewrite');
              assert.doesNotMatch(body, /cdn\.jsdelivr\.net/);
            }
          }
        } finally {
          await new Promise(resolve => server.close(resolve));
        }
      });
    }
    for (const policy of ['', 'unsafe-none', 'require-corp\r\nx-header: bad', null, {}])
      assert.throws(() => serve({course: root}, true, policy), /COEP must be credentialless or require-corp/);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
