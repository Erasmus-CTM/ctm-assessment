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

\`\`\`{.jsxgraph assessment_id="inline" width="300" height="150" style="width:100%;max-width:300px;height:150px;border:0;"}
// Visible while the page is parsed: the code runs inline, as before.
window.__state = document.readyState;
var b = JXG.JSXGraph.initBoard(BOARDID, {boundingbox: [0, 4, 8, 0], showNavigation: false, showCopyright: false});
window.__probe = function () { return {state: window.__state, w: b.canvasWidth}; };
\`\`\`

## Outer
::: {.panel-tabset}
## Inner one
Nothing here.

## Inner two
${board('assessment_id="tabbed" width="760" height="320" style="width:100%;max-width:760px;height:320px;border:0;"', [-1, 3, 14, -3], false)}

## Script
\`\`\`{.jsxgraph assessment_id="script" width="400" height="200" style="width:100%;max-width:400px;height:200px;border:0;"}
// Older board code: document.write adds controls, loads a library and writes markup in parts.
document.write('<button id="reset">reset</button>');
document.getElementById('reset').onclick = function () {};
document.write('<script type="text/x-template" src="data:text/plain,x"><\\/script>');
document.write('<script>document.write("<p id=nested>nested</p>");<\\/script>');
document.write('<script>window.__ran = true;<\\/script>');
document.write('<script src="data:text/javascript,window.__lib=42"><\\/script>');
document.write('<script>window.__used = window.__lib;<\\/script>');
document.write('<table id="written-table"><tr><td>1</td>');
document.write('<td>2</td></tr></table>');
window.onload = function () {
  var b = JXG.JSXGraph.initBoard(BOARDID, {boundingbox: [0, 4, 8, 0], showNavigation: false, showCopyright: false});
  window.__probe = function () { return {ran: window.__ran === true, lib: window.__lib, used: window.__used, nested: !!document.getElementById('nested'), cells: document.querySelectorAll('#written-table td').length, w: b.canvasWidth}; };
};
\`\`\`

## Units
\`\`\`{.jsxgraph assessment_id="unitshidden" width="900" height="300" style="width:100%;max-width:600px;height:300px;border:0;"}
// Page code may declare BOARDID itself.
const BOARDID = 'jxg_box';
var b = JXG.JSXGraph.initBoard(BOARDID, {originX: 50, originY: 250, unitX: 40, unitY: 20, showNavigation: false, showCopyright: false});
window.__probe = function () { return {bbox: b.getBoundingBox(), w: b.canvasWidth, h: b.canvasHeight, origin: [b.origin.scrCoords[1], b.origin.scrCoords[2]]}; };
\`\`\`

## Editor
\`\`\`{.jsxgraph assessment_id="editor" width="500" height="400" style="width:100%;max-width:500px;height:400px;border:0;"}
var graphEditor = JXG.QuartoGraphEditor.createBoard();
graphEditor.register({ai: {render: true, summary: function () { return 'graph'; }}});
window.__probe = function () { var b = graphEditor.board; return {bbox: b.getBoundingBox(), w: b.canvasWidth, vw: b.containerObj.clientWidth, nodes: graphEditor.response().nodes.length}; };
\`\`\`
:::

## Onload
\`\`\`{.jsxgraph assessment_id="onload" width="400" height="200" style="width:100%;max-width:400px;height:200px;border:0;"}
// Older board code waits for the page's load event.
window.onload = function () {
  var b = JXG.JSXGraph.initBoard(BOARDID, {boundingbox: [0, 4, 8, 0], showNavigation: false, showCopyright: false});
  window.__probe = function () { return {bbox: b.getBoundingBox(), w: b.canvasWidth}; };
};
\`\`\`

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

\`\`\`{.jsxgraph assessment_id="ready" width="400" height="200" style="width:100%;max-width:400px;height:200px;border:0;"}
document.addEventListener('DOMContentLoaded', function () {
  var b = JXG.JSXGraph.initBoard(BOARDID, {boundingbox: [0, 4, 8, 0], showNavigation: false, showCopyright: false});
  window.__probe = function () { return {bbox: b.getBoundingBox(), w: b.canvasWidth}; };
});
\`\`\`

\`\`\`{.jsxgraph assessment_id="written" width="400" height="200" style="width:100%;max-width:400px;height:200px;border:0;"}
document.write('<p id="note">written</p>');
var b = JXG.JSXGraph.initBoard(BOARDID, {boundingbox: [0, 4, 8, 0], showNavigation: false, showCopyright: false});
window.__probe = function () { return {note: !!document.getElementById('note'), w: b.canvasWidth}; };
\`\`\`

\`\`\`{.jsxgraph assessment_id="units" width="600" height="300" style="width:100%;max-width:600px;height:300px;border:0;"}
var b = JXG.JSXGraph.initBoard(BOARDID, {originX: 50, originY: 250, unitX: 40, unitY: 20, showNavigation: false, showCopyright: false});
window.__probe = function () { return {bbox: b.getBoundingBox(), w: b.canvasWidth, vw: b.containerObj.clientWidth}; };
\`\`\`

\`\`\`{.jsxgraph assessment_id="panel" width="600" height="300" style="width:100%;max-width:600px;height:300px;border:0;"}
var b = JXG.JSXGraph.initBoard(BOARDID, {boundingbox: [0, 4, 8, 0], showNavigation: false, showCopyright: false});
window.__half = function () { b.containerObj.style.width = '50%'; };
window.__probe = function () { return {w: b.canvasWidth, cw: b.containerObj.clientWidth}; };
\`\`\`

\`\`\`{.jsxgraph assessment_id="named" width="400" height="200" style="width:100%;max-width:400px;height:200px;border:0;"}
'use strict';
window.__strict = (function () { return this === undefined; })();
var box = document.getElementById(BOARDID);
var b = JXG.JSXGraph.initBoard(BOARDID, {boundingbox:[-5,5,5,-5], showNavigation:false, showCopyright:false});
window.__probe = function () { return {found: !!box && box === b.containerObj, strict: window.__strict, w: b.canvasWidth}; };
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
    // Chromium pauses rendering/ResizeObserver in off-screen cross-origin
    // frames. Observe each resized board while visible, then await its real
    // canvas update; never synthesize a resize or change the requested view.
    const visibleProbe = async id => {
      await page.locator('iframe#' + id).scrollIntoViewIfNeeded();
      await (await frame(id)).waitForFunction(() => {
        const value = window.__probe && window.__probe();
        const box = document.querySelector('.jxgbox');
        return value && box && value.w > 0 && value.w === box.clientWidth;
      });
      return probe(id);
    };

    // The visible board has started; it finds its container through BOARDID.
    await page.waitForFunction(() => document.querySelectorAll('iframe').length === 16);
    await (await frame('named')).waitForFunction(() => typeof window.__probe === 'function');
    assert.deepEqual(await probe('named'), {found: true, strict: true, w: 400}, "BOARDID everywhere; a leading 'use strict' stays a directive");
    // Visible boards whose code waits for DOMContentLoaded or uses document.write
    // run as before; the parent page finishes loading.
    for (const id of ['ready', 'written']) await (await frame(id)).waitForFunction(() => typeof window.__probe === 'function');
    assert.equal((await probe('written')).note, true);
    await (await frame('inline')).waitForFunction(() => typeof window.__probe === 'function');
    assert.equal((await probe('inline')).state, 'loading', 'a visible board must start inline, while the page is parsed');
    await page.waitForFunction(() => document.readyState === 'complete');
    // A container resized by the board code (a side panel) is followed.
    // (Chromium pauses rendering of off-screen cross-origin iframes: bring it into view.)
    await page.locator('iframe#panel').scrollIntoViewIfNeeded();
    await (await frame('panel')).evaluate(() => window.__half());
    await page.waitForTimeout(400);
    const panel = await probe('panel');
    assert.ok(panel.w === panel.cw && panel.cw > 0, 'panel: ' + JSON.stringify(panel));
    // JSXGraph 1.14.1 starts hidden boards without a valid view. The extension
    // preserves the requested view until their first real size. Check that
    // their code ran here; the finite view and exact dimensions are checked
    // after showing them below, alongside assessment while still hidden.
    for (const id of ['tabbed', 'collapsed']) {
      const hidden = await probe(id);
      assert.ok(hidden, id + ' hidden board code did not run');
    }

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

    // The pinned renderer initializes a hidden view at its first real size.
    // AI context is requested from the visible editor; hidden response-only
    // assessment is checked above. The graph must produce an actual picture.
    await page.getByRole('tab', {name: 'Outer'}).click();
    await page.getByRole('tab', {name: 'Editor'}).click();
    await page.locator('iframe#editor').scrollIntoViewIfNeeded();
    await (await frame('editor')).waitForFunction(() => window.__probe && window.__probe().w > 0);
    const pictured = await page.evaluate(() => new Promise((resolve, reject) => {
      const target = document.getElementById('editor').contentWindow;
      const listener = async event => {
        if (event.source !== target || !event.data || event.data.type !== 'response') return;
        window.removeEventListener('message', listener);
        const data = event.data;
        if (data.error || !data.ai || !data.ai.image) { resolve({error: data.error || 'no image'}); return; }
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let inked = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200 || pixels[i + 1] < 200 || pixels[i + 2] < 200) inked++;
          resolve({width: image.width, height: image.height, inked});
        };
        image.onerror = () => resolve({error: 'image did not load'});
        image.src = data.ai.image;
      };
      window.addEventListener('message', listener);
      target.postMessage({protocol: 'jsxgraph-quarto-assessment', version: 1, type: 'request', assessmentId: 'editor', requestId: 2, includeAI: true}, '*');
      setTimeout(() => reject(new Error('no picture from a hidden board')), 10000);
    }));
    assert.equal(pictured.error, undefined, pictured.error);
    assert.ok(pictured.width > 100 && pictured.inked > 100, 'visible picture: ' + JSON.stringify(pictured));

    // A hidden board whose code waits for the page's load event starts when shown.
    await page.getByRole('tab', {name: 'Onload'}).click();
    await (await frame('onload')).waitForFunction(() => typeof window.__probe === 'function');
    await (await frame('onload')).waitForFunction(() => window.__probe && window.__probe().w > 0 && window.__probe().bbox.every(Number.isFinite));
    assert.ok(close((await probe('onload')).bbox, [0, 4, 8, 0]), 'onload board: ' + JSON.stringify(await probe('onload')));

    // Shown: the intended bounding box at the full width.
    await page.getByRole('tab', {name: 'Outer'}).click();
    // Scripts the board wrote run before its load handler, and markup written
    // in parts arrives whole.
    await page.getByRole('tab', {name: 'Script'}).click();
    await (await frame('script')).waitForFunction(() => typeof window.__probe === 'function');
    const script = await probe('script');
    assert.deepEqual({ran: script.ran, lib: script.lib, used: script.used, nested: script.nested, cells: script.cells},
      {ran: true, lib: 42, used: 42, nested: true, cells: 2}, 'document.write: ' + JSON.stringify(script));
    // A board set up with origin and units keeps its origin and units after a
    // hidden start at a provisional size different from its real one, also
    // after a layout message that arrived while it was hidden.
    await page.evaluate(() => document.getElementById('unitshidden').contentWindow.postMessage(
      {protocol: 'jsxgraph-quarto-assessment', version: 1, type: 'layout', assessmentId: 'unitshidden'}, '*'));
    await page.waitForTimeout(200);
    await page.getByRole('tab', {name: 'Units'}).click();
    await page.locator('iframe#unitshidden').scrollIntoViewIfNeeded(); await settle();
    const unitsHidden = await probe('unitshidden');
    assert.ok(Math.abs(unitsHidden.w / (unitsHidden.bbox[2] - unitsHidden.bbox[0]) - 40) < 0.01 &&
      Math.abs(unitsHidden.h / (unitsHidden.bbox[1] - unitsHidden.bbox[3]) - 20) < 0.01 &&
      Math.abs(unitsHidden.origin[0] - 50) < 0.5 && Math.abs(unitsHidden.origin[1] - 250) < 0.5, 'units after a hidden start: ' + JSON.stringify(unitsHidden));
    // The editor started for the picture now has its real size and view, and
    // a click adds a vertex.
    await page.getByRole('tab', {name: 'Editor'}).click();
    await page.locator('iframe#editor').scrollIntoViewIfNeeded(); await settle();
    const editor = await probe('editor');
    assert.ok(editor.w === editor.vw && editor.w > 0 && close(editor.bbox, [-5, 4, 5, -4]), 'editor view: ' + JSON.stringify(editor));
    const editorBox = await page.locator('iframe#editor').boundingBox();
    await page.mouse.click(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height / 3);
    await settle();
    assert.equal((await probe('editor')).nodes, 1, 'a click on the editor adds a vertex');
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
    const variant = await visibleProbe('variant'), legacy = await visibleProbe('legacy'), padded = await visibleProbe('padded');
    // A container narrower than the iframe (a toolbar beside it) sets the size.
    assert.ok(padded.w === padded.vw && contains(padded.bbox, [0, 6, 14, 0]), 'padded: ' + JSON.stringify(padded));
    assert.ok(close(variant.bbox, [10, 14, 18, 10]), 'variant: ' + JSON.stringify(variant));
    assert.ok(contains(legacy.bbox, [0, 10, 10, 0]) && legacy.w === legacy.vw, 'legacy: ' + JSON.stringify(legacy));

    const unitsWide = await visibleProbe('units');
    // Mobile width: the boards follow the iframe and keep the intended view.
    await page.setViewportSize({width: 390, height: 800}); await settle();
    const units = await visibleProbe('units');
    const narrow = await visibleProbe('tabbed'), narrowCollapsed = await visibleProbe('collapsed');
    assert.ok(narrow.w < 400 && narrow.w === narrow.vw, 'narrow width: ' + JSON.stringify(narrow));
    assert.ok(close(narrow.bbox, [-1, 3, 14, -3]), 'narrow tabbed: ' + JSON.stringify(narrow));
    assert.ok(narrowCollapsed.w === narrowCollapsed.vw && contains(narrowCollapsed.bbox, [0, 6, 14, 0]), 'narrow collapsed: ' + JSON.stringify(narrowCollapsed));

    // And back: the same view as before, no drift.
    await page.setViewportSize({width: 1100, height: 900}); await settle();
    assert.ok(close((await visibleProbe('tabbed')).bbox, tabbed.bbox));
    assert.ok(close((await visibleProbe('collapsed')).bbox, collapsed.bbox), 'collapsed drifted');
    assert.ok(close((await visibleProbe('variant')).bbox, [10, 14, 18, 10]), 'variant view lost');
    // A board set up with origin and units keeps that view (no default box).
    assert.ok(units.w === units.vw && Math.abs(units.bbox[1] - unitsWide.bbox[1]) < 1e-6 && units.bbox[0] === unitsWide.bbox[0], 'units narrow: ' + JSON.stringify([unitsWide, units]));
    assert.ok(close((await visibleProbe('units')).bbox, unitsWide.bbox), 'units drifted: ' + JSON.stringify(await visibleProbe('units')));
    assert.ok(close((await visibleProbe('padded')).bbox, padded.bbox), 'padded drifted');
    assert.ok(close((await visibleProbe('legacy')).bbox, legacy.bbox), 'legacy drifted: ' + JSON.stringify(await visibleProbe('legacy')));

    // A view the user chose survives a resize.
    await visibleProbe('tabbed');
    await (await frame('tabbed')).evaluate(() => window.__zoom([2, 1, 6, -1]));
    await page.setViewportSize({width: 900, height: 900}); await settle();
    const zoomed = await visibleProbe('tabbed');
    assert.ok(contains(zoomed.bbox, [2, 1, 6, -1]) && zoomed.bbox[2] - zoomed.bbox[0] < 5, 'zoom lost: ' + JSON.stringify(zoomed));

    assert.deepEqual(errors, []);
    console.log('JSXGraph layout: hidden tabs, collapsed block, mobile width, user view, BOARDID and hidden assessment pass');
  } finally {
    if (browser) await browser.close();
    server.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exit(1); });
