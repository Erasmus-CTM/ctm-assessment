// DIAGNOSTIC ONLY (WebKit terminated-wasm-worker investigation).
// Opens wkz.html once per experiment in a fresh browser/app/tab, follows the
// page's progress through server.mjs (/state), performs driver-side handoffs
// (close the tab, navigate a hung page) and prints one result line per
// experiment plus a final table to the job log.
//   WKZ_BACKEND  playwright-webkit | playwright-chromium | safari | stp | simulator | wkapp
//   WKZ_PLAN     plan name in experiments.mjs (comma-separated for several)
//   WKZ_ONLY     optional comma-separated experiment ids
//   WKZ_PW       module specifier/path for Playwright (version matrix)
//   WKZ_ENV      JSON object of extra environment for the browser (JSC_* etc.)
//   WKZ_LABEL    label prefix for run ids
//   WKZ_PORT     server port (server.mjs must already be running)
//   WKZ_APP      wkapp binary path
import {execFile, spawn} from 'node:child_process';
import {plans} from './experiments.mjs';
import {sample, brief} from './server.mjs';

const backend = process.env.WKZ_BACKEND || 'playwright-webkit';
const port = +(process.env.WKZ_PORT || 8790);
const label = process.env.WKZ_LABEL || backend;
const only = (process.env.WKZ_ONLY || '').split(',').filter(Boolean);
const extraEnv = JSON.parse(process.env.WKZ_ENV || '{}');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, opts = {}) => new Promise(resolve => execFile(cmd, args, {timeout: 120000, maxBuffer: 64 << 20, ...opts}, (e, out, err) => resolve({code: e ? (e.code ?? 1) : 0, out: String(out), err: String(err)})));
import os from 'node:os';
const host = '127.0.0.1';
const lan = Object.values(os.networkInterfaces()).flat().find(x => x.family === 'IPv4' && !x.internal)?.address;
const urlFor = (exp, run) => `http://${exp.host === 'lan' ? lan : host}:${port}${exp.coi ? '/coi' : ''}/${exp.page || 'wkz.html'}?run=${encodeURIComponent(run)}&exp=${encodeURIComponent(JSON.stringify(exp))}`;
const blank = run => `http://${host}:${port}/wkz-blank.html?run=${encodeURIComponent(run)}&watch=2000`;
const state = run => fetch(`http://${host}:${port}/state?run=${encodeURIComponent(run)}`).then(r => r.json());

async function killContent() {
  if (process.platform === 'darwin') await sh('pkill', ['-9', '-f', 'com.apple.WebKit.WebContent']);
  else await sh('pkill', ['-9', '-f', 'WebKitWebProcess|WPEWebProcess']);
  await sleep(500);
}

// ---- backends -------------------------------------------------------------
async function playwright(engine) {
  const pw = await import(process.env.WKZ_PW || 'playwright');
  const env = {...process.env};
  for (const [k, v] of Object.entries(extraEnv)) { env[k] = String(v); if (process.platform === 'darwin') env['__XPC_' + k] = String(v); }
  let browser, page;
  return {
    async start() { browser = await pw[engine].launch({headless: true, env}); this.version = browser.version(); },
    async open(url) { page = await (await browser.newContext()).newPage(); page.goto(url).catch(e => console.log('[drive] goto', String(e).slice(0, 200))); },
    async closeTab() { const t = Date.now(); await page.close({runBeforeUnload: false}); return Date.now() - t; },
    async navigate(url) { const t = Date.now(); try { await page.goto(url, {timeout: 20000}); return {ms: Date.now() - t}; } catch (e) { return {ms: Date.now() - t, error: String(e).split('\n')[0].slice(0, 160)}; } },
    async stop() { if (browser) await browser.close().catch(() => {}); browser = null; }
  };
}
async function safari(stp) {
  const driverBin = stp ? '/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver' : '/usr/bin/safaridriver';
  const wdPort = stp ? 4445 : 4444;
  spawn(driverBin, ['-p', String(wdPort)], {stdio: 'ignore', detached: true}).unref();
  await sleep(3000);
  const base = `http://127.0.0.1:${wdPort}`;
  let session, mainHandle;
  async function wd(method, path, body, timeout = 60000) {
    const r = await fetch(base + path, {method, headers: {'content-type': 'application/json'}, body: body && JSON.stringify(body), signal: AbortSignal.timeout(timeout)});
    const j = await r.json();
    if (j.value && j.value.error) throw new Error(j.value.error + ': ' + j.value.message);
    return j.value;
  }
  return {
    async start() {
      for (let i = 0; ; i++) {
        try { session = (await wd('POST', '/session', {capabilities: {alwaysMatch: {browserName: stp ? 'Safari Technology Preview' : 'safari'}}})).sessionId; break; }
        catch (e) { if (i >= 3) throw e; console.log('[drive] session retry', String(e).slice(0, 160)); await sleep(5000); }
      }
      await wd('POST', `/session/${session}/timeouts`, {pageLoad: 20000, script: 30000});
      this.version = await wd('POST', `/session/${session}/execute/sync`, {script: 'return navigator.userAgent', args: []});
      mainHandle = await wd('GET', `/session/${session}/window`);
    },
    async open(url) { wd('POST', `/session/${session}/url`, {url}, 120000).catch(e => console.log('[drive] url', String(e).slice(0, 200))); },
    async closeTab() {
      const t = Date.now();
      const fresh = await wd('POST', `/session/${session}/window/new`, {type: 'tab'});
      await wd('DELETE', `/session/${session}/window`);
      await wd('POST', `/session/${session}/window`, {handle: fresh.handle});
      return Date.now() - t;
    },
    async navigate(url) { const t = Date.now(); try { await wd('POST', `/session/${session}/url`, {url}, 40000); return {ms: Date.now() - t}; } catch (e) { return {ms: Date.now() - t, error: String(e).slice(0, 160)}; } },
    async stop() { if (session) await wd('DELETE', `/session/${session}`, undefined, 30000).catch(e => console.log('[drive] delete session', String(e).slice(0, 120))); session = null; }
  };
}
async function simulator() {
  const listed = await sh('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], {timeout: 900000});
  if (listed.code) console.log('[drive] simctl list failed', listed.code, listed.err.slice(0, 300));
  const list = JSON.parse(listed.out);
  const devices = Object.entries(list.devices).filter(([rt]) => /iOS/.test(rt)).flatMap(([rt, ds]) => ds.map(d => ({...d, rt})));
  const want = process.env.WKZ_SIM_RUNTIME || '';
  const pool = devices.filter(d => d.rt.includes(want));
  const device = pool.find(d => d.state === 'Booted') || pool.filter(d => /iPhone/.test(d.name)).at(-1);
  console.log('[drive] simulator', device && device.name, device && device.rt);
  if (device.state !== 'Booted') { await sh('xcrun', ['simctl', 'boot', device.udid]); await sh('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], {timeout: 600000}); }
  const udid = device.udid;
  return {
    version: device.rt,
    async start() { await sh('xcrun', ['simctl', 'terminate', udid, 'com.apple.mobilesafari']); await sh('pkill', ['-9', '-f', 'CoreSimulator.*WebContent']); await sleep(1000); },
    async open(url) { const r = await sh('xcrun', ['simctl', 'openurl', udid, url]); if (r.code) console.log('[drive] openurl', r.err.slice(0, 200)); },
    async navigate(url) { const t = Date.now(); await this.open(url); return {ms: Date.now() - t, note: 'openurl'}; },
    async background() { await sh('xcrun', ['simctl', 'launch', udid, 'com.apple.Preferences']); },
    async foreground() { await sh('xcrun', ['simctl', 'launch', udid, 'com.apple.mobilesafari']); },
    async memoryWarning() { return sh('xcrun', ['simctl', 'spawn', udid, 'notifyutil', '-p', 'org.WebKit.lowMemory']); },
    async stop() { await sh('xcrun', ['simctl', 'terminate', udid, 'com.apple.mobilesafari']); }
  };
}
async function wkapp() {
  let child;
  return {
    version: 'WKWebView (system WebKit)',
    async start() {},
    async open(url) { child = spawn(process.env.WKZ_APP, [url], {stdio: ['ignore', 'inherit', 'inherit']}); },
    async closeTab() { const t = Date.now(); child.kill('SIGTERM'); return Date.now() - t; },
    async stop() { if (child) child.kill('SIGKILL'); child = null; }
  };
}
const backends = {'playwright-webkit': () => playwright('webkit'), 'playwright-chromium': () => playwright('chromium'), safari: () => safari(false), stp: () => safari(true), simulator, wkapp};

// ---- runner ----------------------------------------------------------------
const b = await backends[backend]();
const table = [];
let experiments = (process.env.WKZ_PLAN || 'quick').split(',').flatMap(p => plans[p]);
if (only.length) experiments = experiments.filter(e => only.includes(e.id));
console.log('[drive] backend', backend, 'env', JSON.stringify(extraEnv), 'experiments', experiments.map(e => e.id).join(','));
for (const exp of experiments) {
  const run = `${label}:${exp.id}:${Date.now().toString(36)}`;
  const row = {id: exp.id, driver: []};
  const dsample = async (tag, ms = 2000) => { const x = await sample(ms); row.driver.push(`${tag}:${x.cores}c/${x.running}R/${x.threads}t`); console.log(`[wkz] ${run} ${tag} ${brief(x)}`); return x; };
  try {
    await killContent();
    await b.start();
    if (b.version) console.log('[drive] version', b.version);
    const pre = await sample(1000);
    console.log(`[wkz] ${run} pre-open ${brief(pre)}`);
    await b.open(urlFor(exp, run));
    const deadline = Date.now() + (exp.timeout || 90000);
    let handled = false, s = null;
    for (;;) {
      await sleep(500);
      s = await state(run).catch(() => null);
      if (s && s.done) break;
      const h = s && s.marks.find(m => m.handoff);
      if (h && !handled) {
        handled = true;
        if (h.handoff === 'close-tab' && b.closeTab) {
          row.closeMs = await b.closeTab();
          for (const at of [2000, 10000]) { await sleep(at === 2000 ? 0 : 6000); await dsample(`closed+${at / 1000}s`); }
          break;
        }
        if (h.handoff === 'watch-main') {
          while (!(s && s.watched) && Date.now() < deadline) { await sleep(1000); s = await state(run).catch(() => null); }
          row.nav = b.navigate ? await b.navigate(blank(run)) : 'n/a';
          await dsample('navigated-away');
          await sleep(3000);
          await dsample('navigated-away+5s');
          break;
        }
        if (h.handoff === 'ios-background' && b.background) {
          await b.background();
          for (const at of [3, 15]) { await sleep(at === 3 ? 1000 : 10000); await dsample(`background+${at}s`); }
          row.memoryWarning = (await b.memoryWarning()).code;
          await sleep(2000);
          await dsample('background+memwarn');
          await b.foreground();
          await sleep(3000);
          await dsample('foreground+3s');
          break;
        }
        if (h.handoff === 'close-tab' || h.handoff === 'driver-nav' || h.handoff === 'ios-background') { row.note = h.handoff + ' unsupported by ' + backend; break; }
      }
      if (Date.now() > deadline) { row.timeout = true; break; }
    }
    const result = s && s.done;
    if (s) row.timeline = s.marks.filter(m => m.sample).map(m => `${m.phase}:${m.sample.cores}c/${m.sample.running}R/${m.sample.threads}t/${m.sample.rssMB}MB`).join(' ');
    if (result) Object.assign(row, {leak: result.leakedCores, marks: result.marks, started: result.started, sidefx: result.sidefx, bench: result.bench, error: result.error, loadMs: result.loadMs, calibration: result.calibration, softStop: result.softStop, stopMs: result.stopMs, jsrate: result.jsrate, coi: result.coi, wasm: result.wasm, events: result.events && result.events.length ? result.events : undefined});
    console.log(`[wkz-result] ${label} ${exp.id} ${JSON.stringify(row)}`);
  } catch (error) {
    row.error = String(error.stack || error).slice(0, 300);
    console.log(`[wkz-result] ${label} ${exp.id} FAILED ${row.error}`);
  } finally {
    await b.stop().catch(() => {});
    await sleep(1000);
    row.postCloseCores = (await dsample('post-close')).cores;
    table.push(row);
  }
}
console.log(`[wkz-table] ${label} ${b.version || ''}`);
for (const r of table) console.log(`[wkz-table] ${label} ${r.id.padEnd(28)} leak=${String(r.leak).padEnd(5)} ${r.timeout ? 'TIMEOUT ' : ''}${r.error ? 'ERROR ' + r.error.slice(0, 80) : ''}${r.stopMs ? 'stopMs=' + JSON.stringify(r.stopMs) + ' jsrate=' + JSON.stringify(r.jsrate) + ' ' : ''}${r.softStop ? 'soft=' + JSON.stringify(r.softStop) + ' ' : ''}${r.calibration ? 'cal=' + r.calibration + ' ' : ''}${r.bench ? 'bench=' + JSON.stringify(r.bench) + ' ' : ''}${r.nav ? 'nav=' + JSON.stringify(r.nav) + ' ' : ''}${r.sidefx ? 'sidefx=' + JSON.stringify(r.sidefx) + ' ' : ''}| ${r.timeline || ''} | ${r.driver.join(' ')}`);
process.exit(0);
