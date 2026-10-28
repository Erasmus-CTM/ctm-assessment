// DIAGNOSTIC ONLY (WebKit terminated-wasm-worker investigation).
// One worker script for every variant. The page (or a parent worker) sends a
// config object; the worker instantiates the chosen wasm loop and enters it.
//   shape    loop | memops | call | callind | grow | throw | jscall | counter | jsloop | idle
//   mask     jscall: call the import whenever (i & mask) == 0
//   callee   jscall: arrow (empty JS function) | long (200 ms JS busy loop)
//            | native (Math.random) | dateNow (Date.now)
//   prewarm  call the JS callee this many times from JS first (JIT tier-up)
//   pages    64 KiB pages of linear memory to allocate and touch
//   memory   a shared WebAssembly.Memory from the page (counter shape)
//   nested   'parent': spawn a child that spins, stay idle;
//            'parent-kills-child': as parent, then terminate the child on
//            request ({type:'kill-child'})
//   sidefx   jscall callee also tries postMessage / fetch / IndexedDB
//   wasm     base64 module bytes (sent by the page, so module and shared
//            workers need no importScripts)
let port = null;
const send = (m, transfer) => (port ? port.postMessage(m, transfer || []) : postMessage(m, transfer || []));
const bytesOf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
let child = null;
const noop = () => {};

async function run(c) {
  const t0 = performance.now();
  if (c.nested === 'parent' || c.nested === 'parent-kills-child') {
    child = new Worker(c.workerURL || '/wkz-worker.js');
    child.onmessage = e => send({...e.data, via: 'parent'});
    child.postMessage({...c, nested: null});
    send({type: 'parent-ready'});
    return;
  }
  if (c.shape === 'idle') { send({type: 'started', ms: performance.now() - t0, idle: true}); return; }
  if (c.shape === 'jsloop') { send({type: 'started', ms: performance.now() - t0}); for (;;) {} }
  const memory = c.memory || new WebAssembly.Memory({initial: c.pages || 1});
  if (c.pages > 1) new Uint8Array(memory.buffer).fill(1);
  let calls = 0, first = 0, lastSide = 0;
  let warming = false;
  const stamp = () => {
    if (warming) return;
    calls++;
    if (calls === 1) first = performance.now();
    if (calls === 4) send({type: 'jsrate', intervalMs: (performance.now() - first) / 3});
    if (c.sidefx && Date.now() - lastSide > 250) { lastSide = Date.now(); sideEffects(c, calls); }
  };
  const callees = {
    arrow: stamp,
    long: () => { stamp(); const end = performance.now() + 200; while (performance.now() < end) {} },
    native: Math.random,
    dateNow: Date.now,
    // Host calls inside the callee: does a C++ path with an exception scope
    // service the pending termination even when the callee is DFG/FTL code?
    json: () => { stamp(); JSON.stringify(0); },
    jsonparse: () => { stamp(); JSON.parse('0'); },
    now: () => { stamp(); performance.now(); },
    apply: () => { stamp(); Reflect.apply(noop, null, []); },
    eval: () => { stamp(); eval('0'); },
    proxy: new Proxy(() => { stamp(); }, {})
  };
  const f = callees[c.callee || 'arrow'];
  warming = true;
  for (let i = 0; i < (c.prewarm || 0); i++) f();
  warming = false;
  const inst = new WebAssembly.Instance(new WebAssembly.Module(bytesOf(c.wasm)), {e: {m: memory, f}});
  send({type: 'started', ms: Math.round(performance.now() - t0), crossOriginIsolated: self.crossOriginIsolated, hasWasm: typeof WebAssembly});
  inst.exports.spin(c.mask >>> 0, c.slot | 0);
}

// Zombie side effects: does a terminated-but-running worker still reach the
// outside world when its loop calls JavaScript?
function sideEffects(c, n) {
  try { send({type: 'zombie-post', n, t: Date.now()}); } catch (e) {}
  try { fetch('/zombie?run=' + encodeURIComponent(c.run) + '&kind=fetch&n=' + n + '&t=' + Date.now()).catch(() => {}); } catch (e) {}
  try {
    const r = indexedDB.open('wkz-zombie');
    r.onupgradeneeded = () => r.result.createObjectStore('s');
    r.onsuccess = () => { const tx = r.result.transaction('s', 'readwrite'); tx.objectStore('s').put(Date.now(), 'n' + n); };
  } catch (e) {}
}

function handle(e) {
  const c = e.data;
  if (c && c.type === 'kill-child') { if (child) child.terminate(); send({type: 'child-killed'}); return; }
  run(c).catch(error => send({type: 'error', error: String(error && error.stack || error)}));
}
if ('onconnect' in self) {
  self.onconnect = e => { port = e.ports[0]; port.onmessage = handle; port.start(); };
} else {
  self.onmessage = handle;
}
