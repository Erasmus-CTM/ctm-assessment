// Browser regression test for JSXGraph boards that start hidden: nested Quarto
// tabs, a collapsed callout, a narrow (mobile) window and the way back, a view
// the user chose, BOARDID outside initBoard(...), and an assessment request to
// a board that is still hidden. Renders its own fixture with the package's
// JSXGraph extension (CTM_INTEGRATION_SITE/../_extensions/jsxgraph).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const site = process.env.CTM_INTEGRATION_SITE;
assert.ok(site, 'Run scripts/setup-feedback-integration.py --browser.');
const extension = path.join(path.dirname(site), '_extensions', 'jsxgraph');
assert.ok(fs.existsSync(extension), 'JSXGraph extension not found next to the site: ' + extension);

const board = (attrs, box, keep, extra = '') => '```{.jsxgraph ' + attrs + '}\n'
  + `var b = JXG.JSXGraph.initBoard(BOARDID, {boundingbox:${JSON.stringify(box)}, axis:false, keepaspectratio:${keep}, showNavigation:false, showCopyright:false});\n`
  + "var A = b.create('point',[1,0]), B = b.create('point',[2,0]);\n"
  + 'window.__probe = function () { return {bbox: b.getBoundingBox(), w: b.canvasWidth, h: b.canvasHeight, vw: innerWidth, vh: innerHeight}; };\n'
  + 'window.__zoom = function (box) { b.setBoundingBox(box, b.keepaspectratio); };\n' + extra + '```\n';
const fixture = `---
title: Hidden boards
filters: [jsxgraph]
---

::: {.panel-tabset}
## Start
Visible tab.

## Outer
::: {.panel-tabset}
## Inner one
Nothing here.

## Inner two
${board('assessment_id="tabbed" width="760" height="320" style="width:100%;max-width:760px;height:320px;border:0;"', [-1, 3, 14, -3], false)}
:::

## Assessed
${board('assessment_id="assessed" width="500" height="250" style="width:100%;max-width:500px;height:250px;border:0;"', [-2, 2, 2, -2], false,
  'JXG.QuartoAssessment.register({response: function () { return {width: b.canvasWidth, started: true}; }});\n')}
:::

::: {.callout-note collapse="true"}
## Collapsed
${board('assessment_id="collapsed" width="600" height="300" style="width:100%;max-width:600px;height:300px;border:0;"', [0, 6, 14, 0], true)}
:::

${board('assessment_id="variant" width="500" height="250" style="width:100%;max-width:500px;height:250px;border:0;"', [0, 4, 4, 0], false,
  'b.setBoundingBox([10, 14, 18, 10], false);\n')}

${board('assessment_id="padded" width="600" height="300" style="width:100%;max-width:600px;height:300px;border:0;"', [0, 6, 14, 0], true,
  '').replace("var b = JXG", "document.getElementById(BOARDID).style.width = 'calc(100% - 40px)';\nvar b = JXG").replace('vw: innerWidth', 'vw: b.containerObj.clientWidth')}

\`\`\`{.jsxgraph assessment_id="legacy" width="600" height="300" style="width:100%;max-width:600px;height:300px;border:0;"}
// Page-level workaround written before the extension handled layout (ctm-demo).
var box = document.querySelector('.jxgbox'), bounds = [0, 10, 10, 0], b = null;
function fitBoard() {
  var w = box.clientWidth, h = box.clientHeight;
  if (!(w > 0 && h > 0)) return;
  if (!b) b = JXG.JSXGraph.initBoard(box.id, {boundingbox: bounds.slice(), axis: false, keepaspectratio: true, showNavigation: false, showCopyright: false, resize: {enabled: false}});
  if (b.canvasWidth !== w || b.canvasHeight !== h) b.resizeContainer(w, h, true);
  var scale = Math.min(w / 10, h / 10);
  b.setBoundingBox([5 - w / (2 * scale), 5 + h / (2 * scale), 5 + w / (2 * scale), 5 - h / (2 * scale)], true);
  b.fullUpdate();
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitBoard).observe(box);
window.addEventListener('resize', fitBoard);
fitBoard();
window.__probe = function () { return b ? {bbox: b.getBoundingBox(), w: b.canvasWidth, vw: innerWidth} : null; };
\`\`\`

\`\`\`{.jsxgraph assessment_id="named" width="400" height="200" style="width:100%;max-width:400px;height:200px;border:0;"}
var box = document.getElementById(BOARDID);
var b = JXG.JSXGraph.initBoard(BOARDID, {boundingbox:[-5,5,5,-5], showNavigation:false, showCopyright:false});
window.__probe = function () { return {found: !!box && box === b.containerObj, w: b.canvasWidth}; };
\`\`\`
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsxgraph-layout-'));
fs.cpSync(extension, path.join(dir, '_extensions', 'jsxgraph'), {recursive: true});
fs.writeFileSync(path.join(dir, 'page.qmd'), fixture);
const rendered = spawnSync(process.env.QUARTO_BIN || 'quarto', ['render', 'page.qmd'], {cwd: dir, encoding: 'utf8'});
assert.equal(rendered.status, 0, rendered.stderr);

const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2'};
const server = http.createServer((req, res) => {
  const file = path.resolve(dir, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(dir + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, body) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'}); res.end(body);
  });
});
const close = (a, b, tolerance = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tolerance * Math.max(1, Math.abs(b[i])));
const contains = (outer, inner) => outer[0] <= inner[0] + 1e-6 && outer[1] >= inner[1] - 1e-6 && outer[2] >= inner[2] - 1e-6 && outer[3] <= inner[3] + 1e-6;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {}),
      ...(process.env.CTM_BROWSER_PROXY ? {proxy: {server: process.env.CTM_BROWSER_PROXY, bypass: '127.0.0.1,localhost'}} : {})});
    const page = await browser.newPage({viewport: {width: 1100, height: 900}});
    page.setDefaultTimeout(60000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/page.html');
    const frame = async id => (await page.$('iframe#' + id)).contentFrame();
    const probe = async id => (await frame(id)).evaluate(() => window.__probe ? window.__probe() : null);
    const settle = () => page.waitForTimeout(400);
    // The visible board has started; it finds its container through BOARDID.
    await page.waitForFunction(() => document.querySelectorAll('iframe').length === 7);
    await (await frame('named')).waitForFunction(() => typeof window.__probe === 'function');
    assert.deepEqual(await probe('named'), {found: true, w: 400});
    // Hidden boards have not run their code yet (no zero-size start).
    for (const id of ['tabbed', 'collapsed']) assert.equal(await probe(id), null, id + ' started while hidden');

    // An assessment request starts a hidden board and is answered.
    const reply = await page.evaluate(() => new Promise((resolve, reject) => {
      const target = document.getElementById('assessed').contentWindow;
      const listener = event => {
        if (event.source === target && event.data && event.data.type === 'response') { window.removeEventListener('message', listener); resolve(event.data); }
      };
      window.addEventListener('message', listener);
      target.postMessage({protocol: 'jsxgraph-quarto-assessment', version: 1, type: 'request', assessmentId: 'assessed', requestId: 1}, '*');
      setTimeout(() => reject(new Error('no assessment response from a hidden board')), 10000);
    }));
    assert.equal(reply.error, undefined, reply.error);
    assert.equal(reply.payload.started, true);

    // Shown: the intended bounding box at the full width.
    await page.getByRole('tab', {name: 'Outer'}).click();
    await page.getByRole('tab', {name: 'Inner two'}).click();
    await page.locator('.callout-header').filter({hasText: 'Collapsed'}).first().click();
    await settle();
    const tabbed = await probe('tabbed'), collapsed = await probe('collapsed');
    assert.ok(close(tabbed.bbox, [-1, 3, 14, -3]), 'tabbed: ' + JSON.stringify(tabbed));
    assert.equal(tabbed.w, tabbed.vw); assert.equal(tabbed.h, tabbed.vh);
    assert.ok(contains(collapsed.bbox, [0, 6, 14, 0]), 'collapsed: ' + JSON.stringify(collapsed));
    assert.equal(collapsed.w, collapsed.vw);

    // A view the board's code set after initBoard is the one kept; page code that
    // still fits the board itself keeps working.
    const variant = await probe('variant'), legacy = await probe('legacy'), padded = await probe('padded');
    // A container narrower than the iframe (a toolbar beside it) sets the size.
    assert.ok(padded.w === padded.vw && contains(padded.bbox, [0, 6, 14, 0]), 'padded: ' + JSON.stringify(padded));
    assert.ok(close(variant.bbox, [10, 14, 18, 10]), 'variant: ' + JSON.stringify(variant));
    assert.ok(contains(legacy.bbox, [0, 10, 10, 0]) && legacy.w === legacy.vw, 'legacy: ' + JSON.stringify(legacy));

    // Mobile width: the boards follow the iframe and keep the intended view.
    await page.setViewportSize({width: 390, height: 800}); await settle();
    const narrow = await probe('tabbed'), narrowCollapsed = await probe('collapsed');
    assert.ok(narrow.w < 400 && narrow.w === narrow.vw, 'narrow width: ' + JSON.stringify(narrow));
    assert.ok(close(narrow.bbox, [-1, 3, 14, -3]), 'narrow tabbed: ' + JSON.stringify(narrow));
    assert.ok(narrowCollapsed.w === narrowCollapsed.vw && contains(narrowCollapsed.bbox, [0, 6, 14, 0]), 'narrow collapsed: ' + JSON.stringify(narrowCollapsed));

    // And back: the same view as before, no drift.
    await page.setViewportSize({width: 1100, height: 900}); await settle();
    assert.ok(close((await probe('tabbed')).bbox, tabbed.bbox));
    assert.ok(close((await probe('collapsed')).bbox, collapsed.bbox), 'collapsed drifted');
    assert.ok(close((await probe('variant')).bbox, [10, 14, 18, 10]), 'variant view lost');
    assert.ok(close((await probe('padded')).bbox, padded.bbox), 'padded drifted');
    assert.ok(close((await probe('legacy')).bbox, legacy.bbox), 'legacy drifted: ' + JSON.stringify(await probe('legacy')));

    // A view the user chose survives a resize.
    await (await frame('tabbed')).evaluate(() => window.__zoom([2, 1, 6, -1]));
    await page.setViewportSize({width: 900, height: 900}); await settle();
    const zoomed = await probe('tabbed');
    assert.ok(contains(zoomed.bbox, [2, 1, 6, -1]) && zoomed.bbox[2] - zoomed.bbox[0] < 5, 'zoom lost: ' + JSON.stringify(zoomed));

    assert.deepEqual(errors, []);
    console.log('JSXGraph layout: hidden tabs, collapsed block, mobile width, user view, BOARDID and hidden assessment pass');
  } finally {
    if (browser) await browser.close();
    server.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exit(1); });
