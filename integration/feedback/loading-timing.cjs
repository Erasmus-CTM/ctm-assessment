// Measures how long learners wait before an exercise can be graded, on the
// rendered example site and on single-component pages, with a cold and a warm
// browser cache, on the runner's network and on an emulated slow connection.
// Also measures the Pyodide runtime and package costs in isolation.
//
//   CTM_INTEGRATION_SITE=.feedback-workspace/site/_site node integration/feedback/loading-timing.cjs [out.json]
//
// Served like GitHub Pages: no COOP/COEP headers, service workers allowed.
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

function median(values) {
  const sorted = values.filter(v => typeof v === 'number').sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
}

async function context(browser, profile) {
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
  const bytes = {total: 0, families: {}};
  const families = [['pyodide', /pyodide/], ['jsxgraph', /jsxgraph/], ['mathjax', /mathjax/i], ['katex', /katex/], ['monaco', /monaco-editor/], ['font-awesome', /font-awesome/]];
  ctx.on('response', async response => {
    try {
      const s = await response.request().sizes();
      const size = s.responseBodySize + s.responseHeadersSize;
      bytes.total += size;
      const family = families.find(([, pattern]) => pattern.test(response.url()));
      if (family) {
        const entry = bytes.families[family[0]] ||= {requests: 0, megabytes: 0};
        entry.requests++; entry.megabytes = +(entry.megabytes + size / 1048576).toFixed(2);
      }
    } catch {}
  });
  ctx.__bytes = bytes;
  if (profile === 'slow') {
    ctx.on('page', async page => {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.emulateNetworkConditions', SLOW);
    });
  }
  return ctx;
}

// Waits until the first exercise of the given kind has produced a graded result.
async function firstGradeable(page, kind) {
  const t = await page.evaluate(async kind => {
    const start = performance.timeOrigin;
    const until = async (predicate, ms = 300000) => {
      const t0 = performance.now();
      while (!predicate()) {
        if (performance.now() - t0 > ms) throw new Error('timeout');
        await new Promise(r => setTimeout(r, 25));
      }
      return performance.now();
    };
    const result = {};
    if (kind === 'math') {
      result.controls = await until(() => document.querySelector('.math-exercise-cell .math-check-btn') && document.querySelector('.math-exercise-cell')?.mathExercise);
      const cell = [...document.querySelectorAll('.math-exercise-cell')].find(c => {
        const inputs = c.querySelectorAll('.math-input[data-answer]');
        return inputs.length && [...inputs].every(i => i.dataset.answer) && c.dataset.mode !== 'custom';
      });
      cell.querySelectorAll('.math-input[data-answer]').forEach(i => { i.value = i.dataset.answer; });
      cell.querySelector('.math-check-btn').click();
      result.graded = await until(() => cell.querySelector('.math-fb-ok, .math-fb-wrong, .math-fb-err, .math-fb-partial'));
      result.status = cell.querySelector('.math-fb-ok') ? 'correct' : cell.querySelector('[class^="math-fb-"]')?.textContent.trim();
    } else {
      result.controls = await until(() => document.querySelector('.py-exercise-check') && globalThis.monaco?.editor.getModels().length);
      const button = document.querySelector('.py-exercise-check');
      const area = button.closest('[id^="py-exercise-"]').querySelector('.py-exercise-result');
      button.click();
      result.graded = await until(() => area.textContent.trim() && !area.querySelector('.py-exercise-running'));
      result.status = area.querySelector('.py-exercise-error') ? 'error: ' + area.textContent.trim().slice(0, 120) : 'graded';
    }
    result.domContentLoaded = performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd;
    return result;
  }, kind);
  return t;
}

async function pageScenario(browser, name, url, kind, profile) {
  const runs = [];
  for (let i = 0; i < (profile === 'slow' ? SLOW_RUNS : RUNS); i++) {
    const ctx = await context(browser, profile);
    try {
      const record = {};
      for (const cache of ['cold', 'warm']) {
        console.log(`[${new Date().toISOString().slice(11, 19)}] ${name} · ${profile} · run ${i + 1} · ${cache}`);
        const page = await ctx.newPage();
        page.setDefaultTimeout(300000);
        const before = ctx.__bytes.total;
        ctx.__bytes.families = {};
        // The COI service worker reloads the page once on a first visit.
        let navigations = 0;
        page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
        await page.goto(url, {waitUntil: 'domcontentloaded'});
        try {
          const t = await firstGradeable(page, kind);
          await page.waitForTimeout(3000); // let iframes (JSXGraph boards) finish loading
          record[cache] = {...t, reloads: Math.max(0, navigations - 1), megabytes: +((ctx.__bytes.total - before) / 1048576).toFixed(2), families: ctx.__bytes.families};
        } catch (error) {
          record[cache] = {error: String(error).slice(0, 200)};
        }
        await page.close();
      }
      // Offline after a warm visit: does the page still grade?
      if (profile === 'fast' && i === 0) {
        await ctx.setOffline(true);
        const page = await ctx.newPage();
        try {
          await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
          const t = await Promise.race([firstGradeable(page, kind), new Promise((_, reject) => setTimeout(() => reject(new Error('no result within 60 s')), 60000))]);
          record.offline = {status: t.status, graded: t.graded};
        } catch (error) { record.offline = {error: String(error).slice(0, 200)}; }
        await page.close();
      }
      runs.push(record);
    } finally { await ctx.close(); }
  }
  const summary = {};
  for (const cache of ['cold', 'warm']) {
    summary[cache] = {
      controls_s: median(runs.map(r => r[cache]?.controls)) / 1000,
      graded_s: median(runs.map(r => r[cache]?.graded)) / 1000,
      megabytes: median(runs.map(r => r[cache]?.megabytes)),
      reloads: median(runs.map(r => r[cache]?.reloads)),
      families: runs[0]?.[cache]?.families,
      errors: runs.filter(r => r[cache]?.error || (r[cache]?.status && r[cache].status !== 'correct' && r[cache].status !== 'graded')).map(r => r[cache].error || r[cache].status),
    };
  }
  if (runs[0]?.offline) summary.offline = runs[0].offline;
  return {name, kind, profile, summary, runs};
}

// Runtime alone: script load, interpreter start, packages.
async function runtimeScenario(browser, version, profile, base) {
  const runs = [];
  for (let i = 0; i < (profile === 'slow' ? SLOW_RUNS : RUNS); i++) {
    const ctx = await context(browser, profile);
    try {
      const record = {};
      for (const cache of ['cold', 'warm']) {
        console.log(`[${new Date().toISOString().slice(11, 19)}] Pyodide ${version} runtime · ${profile} · run ${i + 1} · ${cache}`);
        const page = await ctx.newPage();
        page.setDefaultTimeout(600000);
        await page.goto(base + '/blank.html');
        const before = ctx.__bytes.total;
        record[cache] = await page.evaluate(async version => {
          const index = 'https://cdn.jsdelivr.net/pyodide/v' + version + '/full/';
          const mark = {}; const t0 = performance.now();
          await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = index + 'pyodide.js'; s.onload = resolve; s.onerror = reject; document.head.append(s); });
          mark.script = performance.now() - t0;
          const py = await loadPyodide({indexURL: index});
          mark.interpreter = performance.now() - t0;
          await py.loadPackage('sympy'); await py.runPythonAsync('import sympy; sympy.simplify(sympy.sympify("sin(x)**2+cos(x)**2"))');
          mark.sympy = performance.now() - t0;
          const t1 = performance.now();
          try { await py.loadPackage('networkx'); await py.runPythonAsync('import networkx'); mark.networkx_extra = performance.now() - t1; } catch (e) { mark.networkx_extra = 'error: ' + e.message; }
          const t2 = performance.now();
          try { await py.loadPackage(['micropip', 'matplotlib']); await py.runPythonAsync('import matplotlib'); mark.matplotlib_extra = performance.now() - t2; } catch (e) { mark.matplotlib_extra = 'error: ' + e.message; }
          return mark;
        }, version);
        record[cache].megabytes = +((ctx.__bytes.total - before) / 1048576).toFixed(2);
        await page.close();
      }
      runs.push(record);
    } catch (error) {
      runs.push({error: String(error).slice(0, 200)});
    } finally { await ctx.close(); }
  }
  const summary = {};
  for (const cache of ['cold', 'warm']) {
    summary[cache] = {};
    for (const key of ['script', 'interpreter', 'sympy', 'networkx_extra', 'matplotlib_extra']) {
      const value = median(runs.map(r => r[cache]?.[key]));
      summary[cache][key + '_s'] = value === null ? null : +(value / 1000).toFixed(2);
    }
    summary[cache].megabytes = median(runs.map(r => r[cache]?.megabytes));
  }
  return {name: 'Pyodide ' + version + ' runtime', version, profile, summary, runs};
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {})});
  const results = {generated: new Date().toISOString(), runs: RUNS, slow_profile: SLOW, scenarios: []};
  try {
    const pages = [
      ['Combined example page (all components), mathematics', '/example.html', 'math'],
      ['Combined example page (all components), Python exercise', '/example.html', 'python'],
    ];
    for (const [file, name, kind] of [['timing-math.html', 'math-exercise alone', 'math'], ['timing-python.html', 'py-exercise alone', 'python'], ['timing-graphs.html', 'Four JSXGraph boards + one math exercise', 'math']]) {
      if (fs.existsSync(path.join(site, file))) pages.push([name, '/' + file, kind]);
    }
    // The slow profile is expensive; by default it covers one page and one runtime.
    const slowPages = (process.env.CTM_TIMING_SLOW_PAGES || 'math-exercise alone').split(',');
    for (const profile of ['fast', 'slow']) {
      for (const [name, url, kind] of pages) {
        if (profile === 'slow' && !slowPages.includes(name)) continue;
        const r = await pageScenario(browser, name, base + url, kind, profile);
        results.scenarios.push(r); console.log(JSON.stringify({name, profile, summary: r.summary}));
      }
      for (const version of profile === 'slow' ? VERSIONS.slice(0, 1) : VERSIONS) {
        const r = await runtimeScenario(browser, version, profile, base);
        results.scenarios.push(r); console.log(JSON.stringify({name: r.name, profile, summary: r.summary}));
      }
    }
  } finally {
    await browser.close(); server.close();
    fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
    console.log('Wrote ' + out);
    // Compact results as annotations, readable from the run page and the API.
    if (process.env.GITHUB_ACTIONS) {
      for (const profile of ['fast', 'slow']) {
        const lines = results.scenarios.filter(r => r.profile === profile).map(r => r.name + ' | ' + JSON.stringify(r.summary));
        for (let i = 0; i < lines.length; i += 3) {
          const text = lines.slice(i, i + 3).join('\n').replace(/%/g, '%25').replace(/\n/g, '%0A');
          console.log('::notice title=Loading ' + profile + ' ' + (i / 3 + 1) + '::' + text);
        }
      }
    }
  }
})().catch(error => { console.error(error); process.exit(1); });
