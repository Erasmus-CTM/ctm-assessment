// Measures how long learners wait before an exercise can be graded, on the
// rendered example site and on single-component pages, with a cold and a warm
// browser cache, on the runner's network and on an emulated slow connection,
// and offline after a visit. Also measures the Pyodide runtime and package
// costs in isolation.
//
//   CTM_INTEGRATION_SITE=.feedback-workspace/site/_site node integration/feedback/loading-timing.cjs [out.json]
//
// Service workers are blocked in the measured scenarios: network emulation,
// offline mode and response accounting do not reach requests made by a
// service worker (pyodide-interaktiv's COI worker). One separate scenario
// measures a first visit with the service worker allowed (it reloads the page).
//
// D2 (consolidation step 3, T8): on the combined page, the first graded
// mathematics check with pyodide-interaktiv's stage 2 (matplotlib and the
// other extra packages, in the background) against the same page with stage
// 2 switched off (the test-only globalThis.__ctmWorkerNoBackground), on the
// fast and the slow profile; also when Python is ready (stage 1) and when
// Pyodide's cells are (stage 2). With CTM_TIMING_D2_LIMIT_S set, the job
// fails when the first check comes later than that many seconds after the
// page without stage 2 (design §18.5: 2 s on both profiles).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const site = process.env.CTM_INTEGRATION_SITE;
if (!site) throw new Error('Set CTM_INTEGRATION_SITE to the rendered site.');
const out = process.argv[2] || path.join(site, 'loading-timing.json');
const RUNS = Number(process.env.CTM_TIMING_RUNS || 2);
const SLOW_RUNS = Number(process.env.CTM_TIMING_SLOW_RUNS || 1);
const VERSIONS = (process.env.CTM_PYODIDE_VERSIONS || '0.27.2,0.28.3').split(',');
// The slow profile is expensive; by default it covers one page and one runtime.
const SLOW_PAGES = (process.env.CTM_TIMING_SLOW_PAGES || 'math-exercise alone').split(',');
const WAIT_MS = Number(process.env.CTM_TIMING_WAIT_MS || 180000);
const D2_LIMIT_S = process.env.CTM_TIMING_D2_LIMIT_S ? Number(process.env.CTM_TIMING_D2_LIMIT_S) : null;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png'};

const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (requested === '/blank.html') { res.writeHead(200, {'Content-Type': 'text/html'}); res.end('<!doctype html><title>blank</title>'); return; }
  const file = path.resolve(site, '.' + requested);
  if (!file.startsWith(path.resolve(site) + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, body) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600'});
    res.end(body);
  });
});

// Emulated "slow" profile: roughly a congested 4G/home Wi-Fi connection.
const SLOW = {offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8};
const stamp = () => new Date().toISOString().slice(11, 19);
const round = (value, digits = 2) => value === null || value === undefined ? null : +Number(value).toFixed(digits);
const short = error => String(error).split('\n')[0].slice(0, 200);
function median(values) {
  const sorted = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
// Per-library downloads in MB; null where a service worker served responses
// (their sizes are not reported to the page's context).
function familyMegabytes(families, serviceWorkers) {
  if (serviceWorkers === 'allow') return null;
  return Object.fromEntries(Object.entries(families).map(([name, entry]) => [name, {requests: entry.requests, megabytes: round(entry.bytes / 1048576)}]));
}

async function newContext(browser, serviceWorkers = 'block') {
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers});
  ctx.__bytes = {total: 0, families: {}};
  const families = [['pyodide', /cdn\.jsdelivr\.net\/pyodide\//], ['jsxgraph', /jsxgraph/], ['mathjax', /mathjax/i], ['katex', /katex/], ['monaco', /monaco-editor/], ['font-awesome', /font-awesome/]];
  ctx.on('response', async response => {
    try {
      const s = await response.request().sizes();
      const size = s.responseBodySize + s.responseHeadersSize;
      ctx.__bytes.total += size;
      const family = families.find(([, pattern]) => pattern.test(response.url()));
      if (family) {
        const entry = ctx.__bytes.families[family[0]] ||= {requests: 0, bytes: 0};
        entry.requests++; entry.bytes += size;
      }
    } catch {}
  });
  return ctx;
}

// The throttle is in place before the page's first request.
async function newPage(ctx, profile) {
  const page = await ctx.newPage();
  if (profile === 'slow') {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW);
  }
  return page;
}

// Epoch milliseconds at which the first exercise of the kind has controls and
// a graded result. Probes again once if the page navigates (service-worker reload).
async function firstGradeable(page, kind, wait = WAIT_MS) {
  const probe = () => page.evaluate(async ({kind, wait}) => {
    const until = async predicate => {
      const t0 = Date.now();
      while (!predicate()) {
        if (Date.now() - t0 > wait) throw new Error('timeout after ' + wait / 1000 + ' s');
        await new Promise(r => setTimeout(r, 25));
      }
      return Date.now();
    };
    const result = {};
    if (kind === 'math') {
      // The Check button is in the static HTML; its handler is attached only
      // after KaTeX has loaded. "Controls" is the first click that takes
      // effect (the button is disabled while a check runs).
      await until(() => document.querySelector('.math-exercise-cell .math-check-btn'));
      const cell = [...document.querySelectorAll('.math-exercise-cell')].find(c => {
        const inputs = c.querySelectorAll('.math-input[data-answer]');
        return inputs.length && [...inputs].every(i => i.dataset.answer) && c.dataset.mode !== 'custom';
      });
      if (!cell) throw new Error('no math exercise with stored answers on the page');
      const button = cell.querySelector('.math-check-btn');
      let lastClick = 0;
      result.controls = await until(() => {
        if (button.disabled || cell.querySelector('.math-fb-checking, .math-fb-ok, .math-fb-wrong, .math-fb-err, .math-fb-partial')) return true;
        if (Date.now() - lastClick > 100) {
          cell.querySelectorAll('.math-input[data-answer]').forEach(i => { i.value = i.dataset.answer; });
          button.click();
          lastClick = Date.now();
        }
        return false;
      });
      result.graded = await until(() => cell.querySelector('.math-fb-ok, .math-fb-wrong, .math-fb-err, .math-fb-partial'));
      result.status = cell.querySelector('.math-fb-ok') ? 'graded' : 'not graded: ' + cell.querySelector('[class^="math-fb-"]')?.textContent.trim().slice(0, 120);
    } else {
      result.controls = await until(() => document.querySelector('.py-exercise-check') && globalThis.monaco?.editor.getModels().length);
      const button = document.querySelector('.py-exercise-check');
      const area = button.closest('[id^="py-exercise-"]').querySelector('.py-exercise-result');
      button.click();
      result.graded = await until(() => area.textContent.trim() && !area.querySelector('.py-exercise-running'));
      result.status = area.querySelector('.py-exercise-error') ? 'not graded: ' + area.textContent.trim().slice(0, 120) : 'graded';
    }
    return result;
  }, {kind, wait});
  try { return await probe(); } catch (error) {
    if (!/context was destroyed|navigat/i.test(String(error))) throw error;
    await page.waitForLoadState('domcontentloaded');
    return probe();
  }
}

// Pyodide's two stages on a page, in epoch milliseconds: the proxy is
// published (stage 1; checks may run) and the cells are ready (stage 2).
function watchStages() {
  window.__ctmStages = {};
  const poll = setInterval(() => {
    if (!window.__ctmStages.python && globalThis.mainPyodide) window.__ctmStages.python = Date.now();
    if (!window.__ctmStages.cells && globalThis.qpyodideCellsReady === true) { window.__ctmStages.cells = Date.now(); clearInterval(poll); }
  }, 25);
}

async function pageScenario(browser, name, url, kind, profile, {serviceWorkers = 'block', warm = true, offline = profile === 'fast', noBackground = false, stages = false} = {}) {
  const runs = [];
  const caches = warm ? ['cold', 'warm'] : ['cold'];
  for (let i = 0; i < (profile === 'slow' ? SLOW_RUNS : RUNS); i++) {
    const ctx = await newContext(browser, serviceWorkers);
    if (noBackground) await ctx.addInitScript(() => { globalThis.__ctmWorkerNoBackground = true; });
    if (stages) await ctx.addInitScript(watchStages);
    const record = {};
    try {
      for (const cache of caches) {
        console.log(`[${stamp()}] ${name} · ${profile} · run ${i + 1} · ${cache}`);
        const page = await newPage(ctx, profile);
        const before = ctx.__bytes.total;
        ctx.__bytes.families = {};
        let navigations = 0;
        page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
        const start = Date.now();
        try {
          await page.goto(url, {waitUntil: 'domcontentloaded', timeout: WAIT_MS});
          const t = await firstGradeable(page, kind);
          await page.waitForTimeout(3000); // let iframes (JSXGraph boards) finish loading
          let stage = {};
          if (stages) {
            await page.waitForFunction(() => window.__ctmStages?.cells, null, {timeout: WAIT_MS}).catch(() => {});
            const at = await page.evaluate(() => window.__ctmStages);
            stage = {python_s: at.python ? round((at.python - start) / 1000) : null, cells_s: at.cells ? round((at.cells - start) / 1000) : null};
          }
          record[cache] = {controls_s: round((t.controls - start) / 1000), graded_s: round((t.graded - start) / 1000), ...stage, status: t.status,
            reloads: Math.max(0, navigations - 1),
            megabytes: serviceWorkers === 'allow' ? null : round((ctx.__bytes.total - before) / 1048576),
            families: familyMegabytes(ctx.__bytes.families, serviceWorkers)};
        } catch (error) {
          record[cache] = {error: short(error)};
        }
        await page.close();
      }
      // Offline after a warm visit: does the page still grade?
      if (offline && i === 0 && !record.cold?.error) {
        await ctx.setOffline(true);
        ctx.__bytes.families = {};
        const page = await newPage(ctx, profile);
        const start = Date.now();
        try {
          await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
          const t = await firstGradeable(page, kind, 60000);
          record.offline = {status: t.status, graded_s: round((t.graded - start) / 1000)};
        } catch (error) { record.offline = {error: short(error)}; }
        await page.close();
      }
    } finally { await ctx.close(); }
    runs.push(record);
    if (record.cold?.error) break; // do not spend the job on a page that cannot load
  }
  const summary = {};
  for (const cache of caches) {
    summary[cache] = {
      controls_s: median(runs.map(r => r[cache]?.controls_s)),
      graded_s: median(runs.map(r => r[cache]?.graded_s)),
      ...(stages ? {python_s: median(runs.map(r => r[cache]?.python_s)), cells_s: median(runs.map(r => r[cache]?.cells_s))} : {}),
      megabytes: median(runs.map(r => r[cache]?.megabytes)),
      reloads: median(runs.map(r => r[cache]?.reloads)),
      families: runs.find(r => r[cache]?.families)?.[cache].families || null,
      errors: runs.map(r => r[cache]?.error || (r[cache]?.status !== 'graded' && r[cache]?.status)).filter(Boolean),
    };
  }
  if (runs[0]?.offline) summary.offline = runs[0].offline;
  return {name, kind, profile, serviceWorkers, summary, runs};
}

// Runtime alone: script load, interpreter start, packages.
async function runtimeScenario(browser, version, profile, base) {
  const runs = [];
  const wait = Math.max(WAIT_MS, 300000);
  for (let i = 0; i < (profile === 'slow' ? SLOW_RUNS : RUNS); i++) {
    const ctx = await newContext(browser);
    const record = {};
    try {
      for (const cache of ['cold', 'warm']) {
        console.log(`[${stamp()}] Pyodide ${version} runtime · ${profile} · run ${i + 1} · ${cache}`);
        const page = await newPage(ctx, profile);
        await page.goto(base + '/blank.html');
        const before = ctx.__bytes.total;
        try {
          record[cache] = await page.evaluate(async ({version, wait}) => {
            const deadline = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout after ' + wait / 1000 + ' s')), wait));
            const work = (async () => {
              const index = 'https://cdn.jsdelivr.net/pyodide/v' + version + '/full/';
              const mark = {}; const t0 = performance.now();
              await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = index + 'pyodide.js'; s.onload = resolve; s.onerror = () => reject(new Error('could not load ' + s.src)); document.head.append(s); });
              mark.script_s = (performance.now() - t0) / 1000;
              const py = await loadPyodide({indexURL: index});
              mark.interpreter_s = (performance.now() - t0) / 1000;
              await py.loadPackage('sympy'); await py.runPythonAsync('import sympy; sympy.simplify(sympy.sympify("sin(x)**2+cos(x)**2"))');
              mark.sympy_s = (performance.now() - t0) / 1000;
              mark.sympy_version = py.runPython('import sympy; sympy.__version__');
              const t1 = performance.now();
              try { await py.loadPackage('networkx'); await py.runPythonAsync('import networkx'); mark.networkx_extra_s = (performance.now() - t1) / 1000; } catch (e) { mark.networkx_error = String(e.message || e).slice(0, 200); }
              const t2 = performance.now();
              try { await py.loadPackage(['micropip', 'matplotlib']); await py.runPythonAsync('import matplotlib'); mark.matplotlib_extra_s = (performance.now() - t2) / 1000; } catch (e) { mark.matplotlib_error = String(e.message || e).slice(0, 200); }
              return mark;
            })();
            return Promise.race([work, deadline]);
          }, {version, wait});
          record[cache].megabytes = round((ctx.__bytes.total - before) / 1048576);
        } catch (error) {
          record[cache] = {error: short(error)};
        }
        await page.close();
      }
    } finally { await ctx.close(); }
    runs.push(record);
    if (record.cold?.error) break;
  }
  const summary = {};
  for (const cache of ['cold', 'warm']) {
    summary[cache] = {};
    for (const key of ['script_s', 'interpreter_s', 'sympy_s', 'networkx_extra_s', 'matplotlib_extra_s', 'megabytes']) {
      summary[cache][key] = round(median(runs.map(r => r[cache]?.[key])));
    }
    summary[cache].sympy_version = runs.find(r => r[cache]?.sympy_version)?.[cache].sympy_version || null;
    summary[cache].errors = runs.flatMap(r => [r[cache]?.error, r[cache]?.networkx_error, r[cache]?.matplotlib_error]).filter(Boolean);
  }
  return {name: 'Pyodide ' + version + ' runtime', version, profile, summary, runs};
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless: true,
    ...(process.env.CTM_TIMING_P13 === '1' ? {args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--no-proxy-server','--disable-background-networking']} : {}),
    ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {})});
  const results = {generated: new Date().toISOString(), runs: RUNS, slow_runs: SLOW_RUNS, slow_profile: SLOW, scenarios: []};
  // Results are written after every scenario, so a cancelled job keeps them.
  const record = r => {
    results.scenarios.push(r);
    fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
    const text = (r.name + ' · ' + r.profile + (r.serviceWorkers === 'allow' ? ' · service worker allowed' : '') + ' | ' + JSON.stringify(r.summary)).slice(0, 3500);
    console.log(process.env.GITHUB_ACTIONS ? '::notice title=Loading::' + text.replace(/%/g, '%25').replace(/\r?\n/g, '%0A') : text);
  };
  try {
    if (process.env.CTM_TIMING_P13 === '1') {
      results.scope = 'P16 measurement-only check/idle/interaction prototypes; production defaults unchanged';
      await require('../../tools/p13-loading.cjs')(browser, base, site, firstGradeable, record);
      return;
    }
    const pages = [
      ['Combined example page (all components), mathematics', '/example.html', 'math'],
      ['Combined example page (all components), Python exercise', '/example.html', 'python'],
    ];
    for (const [file, name, kind] of [['timing-math.html', 'math-exercise alone', 'math'], ['timing-python.html', 'py-exercise alone', 'python'], ['timing-graphs.html', 'Four JSXGraph boards + one math exercise', 'math']]) {
      if (fs.existsSync(path.join(site, file))) pages.push([name, '/' + file, kind]);
    }
    const d2 = [];
    for (const profile of ['fast', 'slow']) {
      for (const [name, url, kind] of pages) {
        if (profile === 'slow' && !SLOW_PAGES.includes(name)) continue;
        record(await pageScenario(browser, name, base + url, kind, profile));
      }
      // D2: the combined page's first check with and without stage 2.
      const name = 'Combined example page (all components), mathematics';
      const withStage2 = await pageScenario(browser, name + ', with stage 2', base + '/example.html', 'math', profile, {offline: false, stages: true});
      record(withStage2);
      const without = await pageScenario(browser, name + ', stage 2 switched off', base + '/example.html', 'math', profile, {offline: false, noBackground: true, stages: true});
      record(without);
      for (const cache of ['cold', 'warm']) {
        const a = withStage2.summary[cache], b = without.summary[cache];
        const delay = a.graded_s !== null && b.graded_s !== null ? round(a.graded_s - b.graded_s) : null;
        d2.push({profile, cache, graded_with_s: a.graded_s, graded_without_s: b.graded_s, delay_s: delay,
          python_s: a.python_s, cells_s: a.cells_s, errors: [...a.errors, ...b.errors]});
      }
      for (const version of profile === 'slow' ? VERSIONS.slice(0, 1) : VERSIONS) {
        record(await runtimeScenario(browser, version, profile, base));
      }
    }
    results.d2 = {limit_s: D2_LIMIT_S, comparisons: d2};
    fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
    const d2Text = d2.map(c => `${c.profile}/${c.cache}: first check ${c.graded_with_s} s with stage 2, ${c.graded_without_s} s without (${c.delay_s} s); Python ${c.python_s} s, cells ${c.cells_s} s`).join('; ');
    console.log(process.env.GITHUB_ACTIONS ? '::notice title=D2 (step 3)::' + d2Text : 'D2: ' + d2Text);
    if (D2_LIMIT_S !== null) {
      const late = d2.filter(c => c.errors.length || c.delay_s === null || c.delay_s > D2_LIMIT_S);
      if (late.length) throw new Error(`D2: the first check waits more than ${D2_LIMIT_S} s for stage 2, or failed: ` + JSON.stringify(late));
    }
    // A learner's real first visit to a page with Pyodide cells: the COI
    // service worker registers and reloads the page once.
    record(await pageScenario(browser, 'Combined example page, first visit with service worker', base + '/example.html', 'math', 'fast',
      {serviceWorkers: 'allow', warm: false, offline: false}));
  } finally {
    await browser.close(); server.close();
    fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
    console.log('Wrote ' + out);
  }
})().catch(error => { console.error(error); process.exit(1); });
