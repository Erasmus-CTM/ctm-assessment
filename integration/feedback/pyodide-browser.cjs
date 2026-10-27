// Step 3 (pyodide-interaktiv 1.9 on ctm-libs' worker) in Chromium, with the
// package as built (design docs/consolidation/2026-10-step3.md §18.7, T7):
// - the COI service worker as GitHub Pages serves a site (no COOP/COEP
//   headers): the file is written once, at the output root, under its
//   unchanged URL and scope; the page reloads once and is cross-origin
//   isolated; Run, input(), Stop by interrupt (also while input() waits;
//   variables are kept) and plots work;
// - an engine that cannot isolate and reports a reload as navigation type
//   "navigate" (WebKit): the page reloads once, not again and again;
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
// weakWorker: the service worker file without its COOP/COEP lines: an engine
// that ignores COEP credentialless (WebKit) is not isolated by the worker.
function serve(root, {isolate, weakWorker = false}) {
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (requested.endsWith('/') ? requested + 'index.html' : requested));
    if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    const headers = {'Content-Type': types[path.extname(file)] || 'application/octet-stream'};
    if (isolate) Object.assign(headers, {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless'});
    res.writeHead(200, headers);
    if (weakWorker && path.basename(file) === 'coi-serviceworker.js') {
      res.end(fs.readFileSync(file, 'utf8').replace(/^\s*headers\.set\("Cross-Origin-(Opener|Embedder)-Policy".*$/gm, ''));
      return;
    }
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Every uncaught page or worker error is an acceptance failure.
function pageErrors(page) {
  const errors = [];
  // The worker's and the cells' warnings, for a failure's report.
  page.__console = [];
  page.on('console', message => { if (/warning|error/.test(message.type())) page.__console.push(message.type() + ': ' + message.text().slice(0, 600)); });
  page.on('pageerror', error => errors.push(error.message));
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

(async () => {
  const dir = project();
  const out = path.join(dir, '_site');
  const report = [];
  let browser, current = null;
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
      await page.waitForFunction(() => document.querySelectorAll('.qpyodide-output-code-area')[1].innerText.includes(CTMLocales.table('common',qpyodideLang).stopped));
      await idle(page);
      // Stop by interrupt on a running loop: localized Stop, variables kept.
      await unit(page, 2).run.click();
      await page.waitForTimeout(1500);
      await unit(page, 2).run.click();
      await page.waitForFunction(() => document.querySelectorAll('.qpyodide-output-code-area')[2].innerText.includes(CTMLocales.table('common',qpyodideLang).stopped));
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

    // 1b. WebKit: the worker cannot isolate the page and a reload reads as
    // navigation type "navigate", so coi-serviceworker.js does not see that
    // its check reload failed. The page reloads once and says input() is
    // unavailable for 24 hours; it used to reload every two seconds (set
    // review S10, S12).
    {
      const server = await serve(out, {isolate: false, weakWorker: true});
      const context = await browser.newContext({serviceWorkers: 'allow'});
      await context.addInitScript(() => Object.defineProperty(PerformanceNavigationTiming.prototype, 'type', {get: () => 'navigate'}));
      const page = current = await context.newPage();
      page.setDefaultTimeout(TIMEOUT);
      let navigations = 0;
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
      const origin = `http://127.0.0.1:${server.address().port}`;
      await page.goto(`${origin}/sub/cells.html`);
      await page.waitForFunction(() => globalThis.qpyodideInputState === 'unavailable' && navigator.serviceWorker.controller, null, {timeout: 60000});
      assert.equal(navigations, 2, 'the page reloaded once');
      // Another reload would have come within a few seconds (the worker is ready again by then).
      await page.waitForTimeout(8000);
      assert.equal(navigations, 2, 'the page did not reload again');
      assert.equal(await page.evaluate(() => globalThis.crossOriginIsolated), false);
      const failedAt = Number(await page.evaluate(() => localStorage.getItem('qpyodide-coi-check-failed')));
      assert.ok(failedAt > Date.now() - 60000 && failedAt <= Date.now(), 'the failed check is kept, with its time');
      assert.equal(await page.evaluate(origin => localStorage.getItem('qpyodide-coi-unavailable-' + origin), origin), null, 'the permanent verdict of coi-serviceworker.js is not set by the page');
      report.push('an engine that reports the check reload as "navigate" and cannot isolate: one reload, input() unavailable, no endless reloading');
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
      // P13 explains unsupported input as a capability failure rather than
      // letting a checker mistake an EOF result for a completed learner run.
      await assert.rejects(page.evaluate(() => mainPyodide.runPythonAsync('input()')),
        /ctm-input-unavailable:|Interactive input needs/);
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
      report.push('without isolation: restart during stage 2 is no failure, explicit input() capability gate, Stop by restart, Run after the new start');
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
    console.log('Pyodide (step 3) browser checks passed:\n- ' + report.join('\n- '));
  } catch (error) {
    console.error('Passed so far:\n- ' + report.join('\n- '));
    if (current) console.error('The page at the failure:', JSON.stringify(await dump(current), null, 1));
    throw error;
  } finally {
    if (browser) await browser.close();
    if (!process.env.KEEP_PYODIDE_BROWSER) fs.rmSync(dir, {recursive: true, force: true}); else console.log('Project:', dir);
  }
})().catch(error => { console.error(error); process.exit(1); });
