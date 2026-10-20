#!/usr/bin/env node
// The Pyodide cells of a rendered site, run in a browser and compared between
// two builds (consolidation step 3, T13: design docs/consolidation/2026-10-step3.md
// §18.7). Works with pyodide-interaktiv 1.8 and 1.9.
//
//   node tools/pyodide-cells.mjs run --site DIR --out FILE [--runs N] [--browser chromium|firefox|webkit] [--pages a.html,b.html] [--isolate yes|no]
//   node tools/pyodide-cells.mjs compare --old FILE --new FILE [--summary OUT.md] [--name LABEL] [--page-errors fail|report]
//
// run: serves DIR with cross-origin isolation headers (--isolate no: without,
// as GitHub Pages serves a site; service workers stay blocked), opens every page with
// Pyodide cells, waits until the cells may run and the startup phase (setup,
// output and autorun cells) is over, records every cell's output, then runs
// every interactive cell in page order (the code as written; a cell that calls
// input() is skipped: it would wait for a learner) and records it again. N runs
// (each in a fresh browser context, so in a fresh interpreter); one browser
// cache per run. A record per cell: its terminal text (stdout, stderr and
// results), the text of HTML results, and the numbers of images and of
// animations; memory addresses and timings are normalised.
//
// compare: a cell whose output differs between the old file's runs (random
// numbers, times) is compared only for errors (a traceback or not); every
// other cell must give the same record in the new file. Any other difference,
// a page or cell only one side has, and (unless --page-errors report, for two
// browser engines, whose own messages differ) a page error only the new side
// has, is unexplained; exit 1.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);

function options(argv) {
  const o = {command: argv[0], runs: 1, browser: 'chromium', pages: null, name: '', isolate: 'yes'};
  for (let i = 1; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1];
  o.runs = Number(o.runs);
  return o;
}

const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm'};
function serve(root, isolate) {
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (requested.endsWith('/') ? requested + 'index.html' : requested));
    if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      ...(isolate ? {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless'} : {})});
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function pagesWithCells(site, only) {
  const all = fs.readdirSync(site, {recursive: true}).map(String).filter(name => name.endsWith('.html') && !name.split(path.sep).includes('site_libs'));
  return all.filter(name => fs.readFileSync(path.join(site, name), 'utf8').includes('qpyodide-insertion-location-'))
    .filter(name => !only || only.includes(name.split(path.sep).join('/'))).sort().map(name => name.split(path.sep).join('/'));
}

// In the page: the record of every cell, in the container's (page) order.
function recordCells() {
  const clean = text => String(text || '').replace(/0x[0-9a-f]{4,}/gi, '0x…').replace(/\d+(\.\d+)? ?(ms|s|seconds)\b/g, '<time>')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
  return (globalThis.qpyodideCellContainer?.cells || []).map((cell, index) => {
    const unit = cell.primaryUnit;
    const code = unit?.outputCodeDiv || cell.outputCodeDiv;
    const graph = unit?.outputGraphDiv || cell.outputGraphDiv;
    const html = code ? [...code.children].filter(child => !child.classList.contains('qpyodide-terminal') && child.tagName !== 'CODE')
      .map(child => child.innerText).join('\n') : '';
    const terminal = code ? (code.querySelector('.qpyodide-terminal')?.innerText ?? [...code.querySelectorAll(':scope > code')].map(c => c.textContent).join('\n')) : '';
    const text = clean(terminal);
    return {index, id: cell.id, context: cell.options?.context || 'interactive', autorun: cell.options?.autorun === 'true',
      text, html: clean(html), error: /Traceback \(most recent call last\)|\w+Error\b/.test(text),
      images: (graph ? graph.querySelectorAll('img, canvas').length : 0) + (code ? code.querySelectorAll('img').length : 0),
      animations: code ? code.querySelectorAll('video, .animation, iframe').length : 0};
  });
}

async function runSite(o) {
  const {chromium, firefox, webkit} = require('playwright');
  const engine = {chromium, firefox, webkit}[o.browser];
  const site = path.resolve(o.site);
  const pages = pagesWithCells(site, o.pages && o.pages.split(','));
  const server = await serve(site, o.isolate !== 'no');
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await engine.launch({headless: true, ...(process.env.CHROMIUM_EXECUTABLE && o.browser === 'chromium' ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {})});
  const result = {site, browser: o.browser, runs: []};
  const WAIT = Number(process.env.CTM_CELLS_WAIT_MS || 180000), CELL = Number(process.env.CTM_CELLS_CELL_MS || 60000);
  try {
    for (let run = 0; run < o.runs; run++) {
      const context = await browser.newContext({serviceWorkers: 'block'});
      const record = {};
      for (const name of pages) {
        const page = await context.newPage();
        const errors = [], consoleMessages = [];
        page.on('pageerror', error => errors.push(String(error.message).split('\n')[0].slice(0, 200)));
        page.on('console', message => { if (/warning|error/.test(message.type()) && consoleMessages.length < 20) consoleMessages.push(message.type() + ': ' + message.text().slice(0, 400)); });
        const started = Date.now();
        try {
          await page.goto(base + name, {waitUntil: 'domcontentloaded', timeout: WAIT});
          // The cells may run (1.9: qpyodideCellsReady; 1.8: the proxy) and the
          // startup phase is over: no output cell waits, no run is in progress
          // (no Stop button, and not every Run button disabled, as during a
          // run), for two seconds: 1.8 says "Ready" before its autorun cells.
          await page.waitForFunction(() => (globalThis.qpyodideCellsReady === true || (globalThis.qpyodideCellsReady === undefined && globalThis.mainPyodide))
            && globalThis.qpyodideCellContainer?.cells.length > 0, null, {timeout: WAIT});
          await page.evaluate(async wait => {
            const buttons = () => [...document.querySelectorAll('.qpyodide-button-run')];
            const busy = () => document.querySelector('.qpyodide-non-interactive-loading-container')
              || buttons().some(button => /Stop|Stopp/.test(button.innerText)) || (buttons().length > 0 && buttons().every(button => button.disabled));
            const t0 = Date.now();
            let quietSince = Date.now();
            while (Date.now() - quietSince < 2000) {
              if (Date.now() - t0 > wait) throw new Error('the startup cells did not finish within ' + wait / 1000 + ' s');
              if (busy()) quietSince = Date.now();
              await new Promise(r => setTimeout(r, 100));
            }
          }, WAIT);
          const startup = await page.evaluate(recordCells);
          const runs = [];
          for (const cell of startup) {
            if (cell.context !== 'interactive') continue;
            const outcome = await page.evaluate(async ({index, limit}) => {
              const unit = qpyodideCellContainer.cells[index].primaryUnit;
              const code = unit.getCode();
              if (/\binput\s*\(/.test(code)) return 'skipped: input()';
              // Its Run button is enabled once no other run is in progress.
              const t0 = Date.now();
              while (unit.runButton.disabled) {
                if (Date.now() - t0 > limit) return 'blocked: Run stayed disabled';
                await new Promise(r => setTimeout(r, 100));
              }
              const done = unit.runCode(code).then(() => 'ran', error => 'failed: ' + String(error).slice(0, 200));
              const timer = new Promise(r => setTimeout(() => r('timeout'), limit));
              const how = await Promise.race([done, timer]);
              if (how === 'timeout') { unit.runButton.click(); await done; }
              return how;
            }, {index: cell.index, limit: CELL});
            runs.push({index: cell.index, outcome});
          }
          const after = await page.evaluate(recordCells);
          const status = await page.evaluate(() => document.querySelector('#qpyodide-status-message-text')?.innerText || '');
          record[name] = {seconds: Math.round((Date.now() - started) / 1000), errors, console: consoleMessages, status, startup, cells: after.map(cell => ({...cell, outcome: runs.find(r => r.index === cell.index)?.outcome || 'startup'}))};
        } catch (error) {
          record[name] = {error: String(error.message || error).split('\n')[0].slice(0, 300), errors, console: consoleMessages};
        }
        console.log(`[run ${run + 1}] ${name}: ${record[name].error || (record[name].cells.length + ' cells, ' + record[name].seconds + ' s')}`);
        await page.close();
      }
      result.runs.push(record);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(o.out, JSON.stringify(result, null, 1));
}

const KEYS = ['text', 'html', 'images', 'animations', 'outcome'];
const same = (a, b) => KEYS.every(key => JSON.stringify(a[key]) === JSON.stringify(b[key]));

function compare(o) {
  const old = JSON.parse(fs.readFileSync(o.old, 'utf8')), now = JSON.parse(fs.readFileSync(o.new, 'utf8'));
  const problems = [], unstable = [], notes = [];
  let cells = 0;
  const first = old.runs[0], second = old.runs[1] || old.runs[0], latest = now.runs[0];
  for (const name of [...new Set([...Object.keys(first), ...Object.keys(latest)])].sort()) {
    const a = first[name], a2 = second[name], b = latest[name];
    if (!a || !b) { problems.push(`${name}: only on the ${a ? 'old' : 'new'} side`); continue; }
    if (a.error || b.error) { if (a.error !== b.error) problems.push(`${name}: old ${a.error || 'ran'}, new ${b.error || 'ran'}`); continue; }
    if (a.cells.length !== b.cells.length) { problems.push(`${name}: ${a.cells.length} cells on old, ${b.cells.length} on new`); continue; }
    for (const [i, cell] of a.cells.entries()) {
      cells++;
      const repeat = a2 && !a2.error ? a2.cells[i] : cell, next = b.cells[i];
      if (!same(cell, repeat)) {
        // Differs between two old runs: compared for errors only (N6).
        unstable.push(`${name} #${i}`);
        if (cell.error !== next.error) problems.push(`${name} cell ${i} (unstable on old): error ${cell.error} on old, ${next.error} on new: ${next.text.slice(-300)}`);
        continue;
      }
      if (!same(cell, next)) {
        const keys = KEYS.filter(key => JSON.stringify(cell[key]) !== JSON.stringify(next[key]));
        problems.push(`${name} cell ${i} (${cell.context}): ${keys.map(key => `${key}: ${JSON.stringify(cell[key]).slice(-200)} -> ${JSON.stringify(next[key]).slice(-200)}`).join('; ')}`);
      }
    }
    if (problems.some(p => p.startsWith(name + ' ')) && (b.status || b.console?.length))
      problems.push(`${name} (new side's status and console): ${b.status || ''} | ${(b.console || []).slice(0, 4).join(' | ')}`.slice(0, 1500));
    const newErrors = b.errors.filter(error => !a.errors.includes(error) && !/KeyboardInterrupt/.test(error));
    if (newErrors.length) (o['page-errors'] === 'report' ? notes : problems).push(`${name}: page errors only on new: ${newErrors.join(' | ')}`);
  }
  const md = [`### Pyodide cells${o.name ? ' ' + o.name : ''}: ${Object.keys(latest).length} pages, ${cells} cells, ${unstable.length} unstable on old (errors compared), ${problems.length} unexplained`, ''];
  if (unstable.length) md.push('Unstable on old: ' + unstable.slice(0, 40).join(', ') + (unstable.length > 40 ? ', …' : ''), '');
  if (notes.length) md.push('Reported, not compared:', ...notes.map(n => '- ' + n), '');
  if (problems.length) md.push('**Unexplained differences:**', ...problems.slice(0, 80).map(p => '- ' + p));
  const text = md.join('\n') + '\n';
  if (o.summary) fs.writeFileSync(o.summary, text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(text);
  process.exit(problems.length ? 1 : 0);
}

const o = options(process.argv.slice(2));
if (o.command === 'run') runSite(o).catch(error => { console.error(error); process.exit(2); });
else if (o.command === 'compare') compare(o);
else { console.error('Usage: pyodide-cells.mjs run --site DIR --out FILE [--runs N] [--browser NAME] [--pages LIST] | compare --old FILE --new FILE [--summary FILE]'); process.exit(2); }
