// DIAGNOSTIC ONLY (WebKit terminated-wasm-worker investigation).
// Static server for tools/wkz plus a host-side process sampler. The test page
// drives itself and POSTs /mark at each phase; the server measures the
// browser's content processes over a short window (CPU from cumulative
// process time, thread counts, running threads, RSS) and answers with the
// sample, so the same page works in Playwright, Safari, the iOS Simulator and
// a WKWebView app without a driver protocol. Summaries go to stdout (the job
// log); nothing large is written.
//   node tools/wkz/server.mjs PORT [--root DIR]
//   /coi/<path>   same file with COOP/COEP (cross-origin isolated)
//   POST /mark    {run, phase, window?, extra?} -> sample
//   POST /done    {run, result}
//   GET  /state?run=ID  latest marks and done flag (for drivers)
//   GET  /zombie?...    logged hit (zombie side-effect probe)
//   GET  /sample?window=ms  ad-hoc sample (drivers)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';

const port = +(process.argv[2] || 8790);
const rootArg = process.argv.indexOf('--root');
const root = fs.realpathSync(rootArg > 0 ? process.argv[rootArg + 1] : path.dirname(new URL(import.meta.url).pathname));
const PROC = new RegExp(process.env.WKZ_PROC || 'WebContent|WebKitWebProcess|--type=renderer');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.zip': 'application/zip', '.whl': 'application/zip', '.tar': 'application/x-tar', '.css': 'text/css'};
const runs = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = (cmd, args) => new Promise(resolve => execFile(cmd, args, {timeout: 10000, maxBuffer: 16 << 20}, (e, out) => resolve(e ? '' : out)));
const secs = t => { const m = String(t).match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/); return m ? (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+m[3]) * 60 + (+m[4]) : NaN; };
const darwin = os.platform() === 'darwin';
const TICK = 100; // Linux clock ticks per second (USER_HZ)

// Snapshot of every process: cumulative CPU seconds, RSS, command.
async function snapshot() {
  const t = performance.now();
  const procs = new Map();
  if (darwin) {
    for (const line of (await run('ps', ['-axo', 'pid=,time=,rss=,command='])).split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
      if (m) procs.set(+m[1], {cpu: secs(m[2]), rssMB: Math.round(+m[3] / 1024), cmd: m[4]});
    }
  } else {
    for (const pid of fs.readdirSync('/proc').filter(x => /^\d+$/.test(x))) {
      try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
        procs.set(+pid, {cpu: (+f[11] + +f[12]) / TICK, rssMB: Math.round(+f[21] * 4096 / 1048576), cmd});
      } catch (e) {}
    }
  }
  return {t, procs};
}
// Threads of one process: total and running (state R). macOS `ps -M` thread
// lines lack USER/TT, so the STAT column is located by pattern.
async function threads(pid) {
  if (darwin) {
    const rows = (await run('ps', ['-M', '-p', String(pid)])).split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(f => f.length >= 5);
    const stats = rows.map(f => f.find((x, i) => i > 0 && /^[RSITUZ][A-Za-z+<>]*$/.test(x))).filter(Boolean);
    return {n: stats.length, r: stats.filter(s => s.startsWith('R')).length};
  }
  try {
    const tids = fs.readdirSync(`/proc/${pid}/task`);
    let r = 0;
    for (const tid of tids) { try { const s = fs.readFileSync(`/proc/${pid}/task/${tid}/stat`, 'utf8'); if (s.slice(s.lastIndexOf(')') + 2)[0] === 'R') r++; } catch (e) {} }
    return {n: tids.length, r};
  } catch (e) { return {n: 0, r: 0}; }
}
// CPU over a window: per content process and the other busiest processes.
export async function sample(windowMs = 2000) {
  const a = await snapshot();
  await sleep(windowMs);
  const b = await snapshot();
  const dt = (b.t - a.t) / 1000;
  const content = [], others = [];
  for (const [pid, p] of b.procs) {
    const before = a.procs.get(pid);
    const cpu = before ? Math.round(100 * (p.cpu - before.cpu) / dt) : null;
    if (PROC.test(p.cmd) && !/ps -axo|server\.mjs/.test(p.cmd)) content.push({pid, cpu, rssMB: p.rssMB, new: !before, sim: /CoreSimulator/.test(p.cmd) || undefined});
    else if (cpu >= 20 && pid !== process.pid) others.push(`${path.basename(p.cmd.split(' ')[0]).slice(0, 32)}#${pid}:${cpu}%`);
  }
  const gone = [...a.procs.keys()].filter(pid => !b.procs.has(pid) && PROC.test(a.procs.get(pid).cmd));
  for (const c of content) Object.assign(c, await threads(c.pid));
  const total = content.reduce((s, c) => s + (c.cpu || 0), 0);
  return {at: Date.now(), windowMs: Math.round(dt * 1000), cpu: total, cores: +(total / 100).toFixed(2), threads: content.reduce((s, c) => s + c.n, 0), running: content.reduce((s, c) => s + c.r, 0), rssMB: content.reduce((s, c) => s + c.rssMB, 0), content, gone, others: others.slice(0, 6), load: os.loadavg().map(x => +x.toFixed(2))};
}
export const brief = s => s ? `cpu=${s.cpu}% thr=${s.threads} R=${s.running} rss=${s.rssMB}MB procs=${s.content.map(c => `${c.pid}${c.sim ? 's' : ''}:${c.cpu}%/${c.n}t/${c.r}R/${c.rssMB}MB${c.new ? '(new)' : ''}`).join(',')}${s.gone.length ? ' gone=' + s.gone.join(',') : ''}${s.others.length ? ' others=' + s.others.join(',') : ''}` : 'n/a';

function body(req) { return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch (e) { r({}); } }); }); }
const state = id => { if (!runs.has(id)) runs.set(id, {marks: [], done: null, zombie: []}); return runs.get(id); };
const json = (res, v) => { res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin'}); res.end(JSON.stringify(v)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, {'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST'}); return res.end(); }
  if (url.pathname === '/mark' && req.method === 'POST') {
    const m = await body(req), st = state(m.run);
    const s = m.window === 0 ? null : await sample(m.window || 2000);
    const entry = {phase: m.phase, t: Date.now(), extra: m.extra, sample: s, handoff: m.handoff};
    st.marks.push(entry);
    console.log(`[wkz] ${m.run} ${m.phase} ${brief(s)}${m.extra ? ' ' + JSON.stringify(m.extra).slice(0, 400) : ''}`);
    // A page that is about to block its own main thread asks the server to
    // keep sampling on its behalf.
    if (m.handoff === 'watch-main') (async () => {
      const t = Date.now();
      for (const at of [2000, 10000, 25000]) {
        await sleep(Math.max(0, at - (Date.now() - t)));
        const w = await sample(2000);
        st.marks.push({phase: 'main+' + at / 1000 + 's', t: Date.now(), sample: w});
        console.log(`[wkz] ${m.run} main+${at / 1000}s ${brief(w)}`);
      }
      st.watched = true;
    })();
    return json(res, entry);
  }
  if (url.pathname === '/done' && req.method === 'POST') {
    const m = await body(req), st = state(m.run);
    st.done = m.result || {};
    console.log(`[wkz] ${m.run} DONE ${JSON.stringify(m.result || {}).slice(0, 1500)}`);
    return json(res, {ok: true});
  }
  if (url.pathname === '/log' && req.method === 'POST') { const m = await body(req); console.log(`[wkz] ${m.run} log ${String(m.text).slice(0, 600)}`); return json(res, {ok: true}); }
  if (url.pathname === '/state') return json(res, runs.get(url.searchParams.get('run')) || null);
  if (url.pathname === '/sample') { const s = await sample(+(url.searchParams.get('window') || 2000)); return json(res, {sample: s, brief: brief(s)}); }
  if (url.pathname === '/zombie') {
    const id = url.searchParams.get('run') || 'any';
    state(id).zombie.push(Object.fromEntries(url.searchParams));
    console.log(`[wkz] zombie-hit ${url.search}`);
    return json(res, {ok: true});
  }
  // Static files; /coi/ prefix adds the isolation headers.
  const coi = url.pathname.startsWith('/coi/');
  const rel = decodeURIComponent(coi ? url.pathname.slice(4) : url.pathname);
  const file = path.join(root, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (error, st) => {
    if (error || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const headers = {'content-type': types[path.extname(file)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store', 'cross-origin-resource-policy': 'same-origin'};
    if (coi) Object.assign(headers, {'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp'});
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
});
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  server.listen(port, '0.0.0.0', () => console.log(`[wkz] serving ${root} on :${port}`));
}
