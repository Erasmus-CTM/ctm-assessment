// Step 3 (pyodide-interaktiv 1.9 on ctm-libs' worker) in Chromium, with the
// package as built (design docs/consolidation/2026-10-step3.md §18.7, T7):
// - the COI service worker as GitHub Pages serves a site (no COOP/COEP
//   headers): the file is written once, at the output root, under its
//   unchanged URL and scope; the page reloads once and is cross-origin
//   isolated; Run, input(), Stop by interrupt (also while input() waits;
//   variables are kept) and plots work;
// - without isolation (service workers blocked, no headers): input()'s hint
//   and its end-of-file path, Stop by restart (Run waits for the new start),
//   and a restart during stage 2, which is no failure;
// - an embed-resources page with a Pyodide cell runs.
// The browser smoke (browser-smoke.cjs) covers the example site's Pyodide tab
// and the math and Python checks through the proxy, also after a restart.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const site = process.env.CTM_INTEGRATION_SITE;
assert.ok(site, 'Run scripts/setup-feedback-integration.py --browser.');
const QUARTO = process.env.QUARTO_BIN || 'quarto';
const TIMEOUT = 180000;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png'};

const CELLS = [
  'print(6 * 7)',
  'name = input("Name? ")\nprint("Hello", name)',
  // A busy loop: an interrupt raised in a garbage-collector callback (as
  // time.sleep's objects can trigger) is ignored by CPython, so no sleep here.
  'loops = 0\nwhile True:\n    loops += 1',
  'import matplotlib.pyplot as plt\nplt.plot([1, 3, 2])\nplt.show()',
  'print("loops kept:", loops > 0)',
];
const block = code => '```{pyodide-python}\n' + code + '\n```\n';

function project() {
  const dir = fs.mkdtempSync(path.join(path.dirname(path.dirname(site)), 'pyodide-browser-'));
  fs.cpSync(path.join(path.dirname(site), '_extensions'), path.join(dir, '_extensions'), {recursive: true});
  fs.writeFileSync(path.join(dir, '_quarto.yml'), 'project:\n  type: website\n  render: [index.qmd, sub/cells.qmd, embedded.qmd]\n'
    + 'filters: [ctm-assessment]\npyodide:\n  feedback: false\n');
  fs.writeFileSync(path.join(dir, 'index.qmd'), '---\ntitle: Start\n---\n\nNo cells here.\n');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'cells.qmd'), '---\ntitle: Cells\n---\n\n' + CELLS.map(block).join('\n'));
  fs.writeFileSync(path.join(dir, 'embedded.qmd'), '---\ntitle: Embedded\nformat:\n  html:\n    embed-resources: true\n---\n\n' + block(CELLS[0]));
  const render = spawnSync(QUARTO, ['render'], {cwd: dir, encoding: 'utf8', timeout: 600000});
  assert.equal(render.status, 0, render.stderr);
  return dir;
}

// isolate: COOP/COEP headers from the server (as the smoke server sends them).
function serve(root, {isolate}) {
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (requested.endsWith('/') ? requested + 'index.html' : requested));
    if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    const headers = {'Content-Type': types[path.extname(file)] || 'application/octet-stream'};
    if (isolate) Object.assign(headers, {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless'});
    res.writeHead(200, headers);
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Page errors, except Pyodide's own report of an interrupt: the KeyboardInterrupt
// leaves its event loop as an uncaught error of the worker, which the page sees
// (the same worker code as pyodide-interaktiv 1.8; the run itself ends normally).
function pageErrors(page) {
  const errors = [];
  // The worker's and the cells' warnings, for a failure's report.
  page.__console = [];
  page.on('console', message => { if (/warning|error/.test(message.type())) page.__console.push(message.type() + ': ' + message.text().slice(0, 600)); });
  page.on('pageerror', error => { if (!/^Traceback[\s\S]*\nKeyboardInterrupt\s*$/.test(error.message)) errors.push(error.message); });
  return errors;
}
const unit = (page, i) => ({
  run: page.locator('.qpyodide-button-run').nth(i),
  output: page.locator('.qpyodide-output-code-area').nth(i),
  graph: page.locator('.qpyodide-output-graph-area').nth(i),
});
async function ready(page) {
  await page.waitForFunction(() => globalThis.qpyodideCellsReady === true
    && [...document.querySelectorAll('.qpyodide-button-run')].some(button => !button.disabled), null, {timeout: TIMEOUT});
}
async function runAndWait(page, i, pattern) {
  const cell = unit(page, i);
  await cell.run.click();
  await page.waitForFunction(([i, source]) => new RegExp(source).test(document.querySelectorAll('.qpyodide-output-code-area')[i].innerText),
    [i, pattern.source], {timeout: TIMEOUT});
  await idle(page);
}
// Until no run is in progress: no cell's button is a Stop button.
async function idle(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('.qpyodide-button-run')].every(button => button.innerText.trim() !== QP_L.stopLabel.replace(/<[^>]*>/g, '').trim()),
    null, {timeout: TIMEOUT});
}
// What the cells show, for a failure's report.
async function dump(page) {
  return page.evaluate(() => ({status: document.querySelector('#qpyodide-status-message-text')?.innerText,
    buttons: [...document.querySelectorAll('.qpyodide-button-run')].map(b => b.innerText.trim() + (b.disabled ? ' (disabled)' : '')),
    outputs: [...document.querySelectorAll('.qpyodide-output-code-area')].map(o => o.innerText.slice(-300))}))
    .then(state => ({...state, console: (page.__console || []).slice(-15)}), error => String(error));
}
async function status(page) {
  return (await page.locator('#qpyodide-status-message-text').innerText()).trim();
}

// Diagnosis (temporary, step 3's combined CI): how the CDN answers a byte
// range and then the full request with integrity, as stage 2 and Pyodide's
// loadPackage make them, in the page's context.
async function cdnProbe(page) {
  return page.evaluate(async () => {
    const index = globalThis.qpyodideCustomizedPyodideOptions?.indexURL || 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
    const lock = await (await fetch(index + 'pyodide-lock.json')).json();
    const out = {isolated: globalThis.crossOriginIsolated, controlled: !!navigator.serviceWorker?.controller};
    const pick = r => Object.fromEntries(['content-range', 'content-length', 'etag', 'accept-ranges', 'cache-control', 'age', 'content-encoding', 'vary', 'last-modified'].map(h => [h, r.headers.get(h)]));
    for (const name of ['packaging', 'pyodide-http']) {
      const entry = lock.packages[name];
      const url = index + entry.file_name;
      const sri = 'sha256-' + btoa(String.fromCharCode(...entry.sha256.match(/../g).map(h => parseInt(h, 16))));
      const r = out[name] = {size: null};
      try { const a = await fetch(url, {headers: {Range: 'bytes=0-524287'}}); const b = await a.arrayBuffer(); r.range = {status: a.status, bytes: b.byteLength, ...pick(a)}; } catch (e) { r.range = String(e); }
      try { const a = await fetch(url, {integrity: sri}); const b = await a.arrayBuffer(); r.integrity = {status: a.status, bytes: b.byteLength, type: a.type, ...pick(a)}; } catch (e) { r.integrity = String(e); }
      try { const a = await fetch(url); const b = await a.arrayBuffer(); const d = [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
        r.plain = {status: a.status, bytes: b.byteLength, shaMatches: d === entry.sha256}; } catch (e) { r.plain = String(e); }
    }
    return out;
  }).catch(error => String(error));
}

(async () => {
  const dir = project();
  const out = path.join(dir, '_site');
  const report = [];
  let browser, current = null;
  const probes = [];
  try {
    // The service worker file: once, at the output root; pages link it from there.
    assert.ok(fs.existsSync(path.join(out, 'coi-serviceworker.js')), 'coi-serviceworker.js at the output root');
    assert.ok(!fs.existsSync(path.join(out, 'sub', 'coi-serviceworker.js')), 'no second copy in sub/');
    const cellsHtml = fs.readFileSync(path.join(out, 'sub', 'cells.html'), 'utf8');
    assert.equal((cellsHtml.match(/<script src="\.\.\/coi-serviceworker\.js"><\/script>/g) || []).length, 1, 'sub/cells.html links ../coi-serviceworker.js once');
    assert.doesNotMatch(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /coi-serviceworker/, 'a page without cells has no service worker');
    report.push('the COI service worker is written once at the output root and linked as ../coi-serviceworker.js');

    browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {})});

    // 1. GitHub Pages: no headers; the service worker isolates the page after one reload.
    {
      const server = await serve(out, {isolate: false});
      const context = await browser.newContext({serviceWorkers: 'allow'});
      const page = current = await context.newPage();
      page.setDefaultTimeout(TIMEOUT);
      const errors = pageErrors(page);
      let navigations = 0;
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
      const url = `http://127.0.0.1:${server.address().port}/sub/cells.html`;
      await page.goto(url);
      await page.waitForFunction(() => globalThis.crossOriginIsolated === true, null, {timeout: TIMEOUT});
      if (process.env.CTM_CDN_PROBE !== '0') probes.push('CDN probe (service worker): ' + JSON.stringify(await cdnProbe(page)));
      assert.equal(navigations, 2, 'the page reloaded once for the service worker');
      const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
      assert.equal(scope, `http://127.0.0.1:${server.address().port}/`, 'the service worker\'s scope is the site root');
      await ready(page);
      await runAndWait(page, 0, /42/);
      // input(): the inline field; the value reaches Python.
      await unit(page, 1).run.click();
      const field = page.locator('.qpyodide-terminal-input');
      await field.waitFor();
      await field.fill('Ada');
      await field.press('Enter');
      await page.waitForFunction(() => /Hello Ada/.test(document.querySelectorAll('.qpyodide-output-code-area')[1].innerText));
      await idle(page);
      // Stop while input() waits: an interrupt, not a restart.
      await unit(page, 1).run.click();
      await field.waitFor();
      await unit(page, 1).run.click();
      await page.waitForFunction(() => /\[Aborted\]/.test(document.querySelectorAll('.qpyodide-output-code-area')[1].innerText));
      await idle(page);
      // Stop by interrupt on a running loop: KeyboardInterrupt, variables kept.
      await unit(page, 2).run.click();
      await page.waitForTimeout(1500);
      await unit(page, 2).run.click();
      await page.waitForFunction(() => /KeyboardInterrupt/.test(document.querySelectorAll('.qpyodide-output-code-area')[2].innerText));
      await idle(page);
      await runAndWait(page, 4, /loops kept: True/);
      // A plot.
      await unit(page, 3).run.click();
      await page.waitForFunction(() => document.querySelectorAll('.qpyodide-output-graph-area')[3].querySelector('img, canvas'), null, {timeout: TIMEOUT});
      assert.deepEqual(errors, []);
      report.push('service worker (no headers): one reload, isolated, Run, input(), Stop while input() waits, Stop by interrupt keeps variables, a plot');
      await context.close();
      server.close();
    }

    // 2. No isolation: service workers blocked, no headers.
    {
      const server = await serve(out, {isolate: false});
      const context = await browser.newContext({serviceWorkers: 'block'});
      const page = current = await context.newPage();
      page.setDefaultTimeout(TIMEOUT);
      const errors = pageErrors(page);
      await page.goto(`http://127.0.0.1:${server.address().port}/sub/cells.html`);
      if (process.env.CTM_CDN_PROBE !== '0') probes.push('CDN probe (no isolation): ' + JSON.stringify(await cdnProbe(page)));
      // A restart during stage 2 (a check's stop()): no failure text, then ready.
      await page.waitForFunction(() => !!globalThis.mainPyodide, null, {timeout: TIMEOUT});
      const early = await page.evaluate(() => { const before = globalThis.qpyodideCellsReady; mainPyodide.restart('Stopped by a check.'); return before; });
      if (early) report.push('note: stage 2 had already finished when the test restarted');
      await ready(page);
      assert.doesNotMatch(await status(page), /🟠|🔴/, 'a restart is no failure');
      assert.equal(await page.evaluate(() => globalThis.crossOriginIsolated), false);
      // input() cannot run here: its Run is disabled and the hint says why.
      assert.equal(await unit(page, 1).run.isDisabled(), true, 'Run of an input() cell is disabled without isolation');
      assert.equal(await page.locator('.qpyodide-cell-input-hint:not([hidden])').count(), 1, 'the input hint is shown, at the input() cell');
      // input() from code reads end-of-file (EOFError), the page goes on.
      await page.evaluate(() => mainPyodide.runPythonAsync('try:\n    input()\n    eof = False\nexcept EOFError:\n    eof = True'));
      assert.equal(await page.evaluate(() => mainPyodide.runPythonAsync('eof')), true, 'input() without isolation reads end-of-file');
      await runAndWait(page, 0, /42/);
      // Stop by restart: the run ends with the restart's text; Run waits for the new start.
      await unit(page, 2).run.click();
      await page.waitForTimeout(1500);
      await unit(page, 2).run.click();
      await page.waitForFunction(() => /Python was restarted/.test(document.querySelectorAll('.qpyodide-output-code-area')[2].innerText));
      await idle(page);
      await ready(page);
      await runAndWait(page, 4, /NameError/);
      await runAndWait(page, 0, /42/);
      assert.deepEqual(errors, []);
      report.push('without isolation: restart during stage 2 is no failure, input() hint and end-of-file, Stop by restart, Run after the new start');
      await context.close();
      server.close();
    }

    // 3. embed-resources: one HTML file with a Pyodide cell.
    {
      const server = await serve(out, {isolate: true});
      const page = current = await browser.newPage({serviceWorkers: 'block'});
      page.setDefaultTimeout(TIMEOUT);
      await page.goto(`http://127.0.0.1:${server.address().port}/embedded.html`);
      await ready(page);
      await runAndWait(page, 0, /42/);
      report.push('embed-resources: a Pyodide cell runs');
      await page.close();
      server.close();
    }
    for (const probe of probes) console.log(probe);
    console.log('Pyodide (step 3) browser checks passed:\n- ' + report.join('\n- '));
  } catch (error) {
    for (const probe of probes) console.error(probe);
    console.error('Passed so far:\n- ' + report.join('\n- '));
    if (current) console.error('The page at the failure:', JSON.stringify(await dump(current), null, 1));
    throw error;
  } finally {
    if (browser) await browser.close();
    if (!process.env.KEEP_PYODIDE_BROWSER) fs.rmSync(dir, {recursive: true, force: true}); else console.log('Project:', dir);
  }
})().catch(error => { console.error(error); process.exit(1); });
