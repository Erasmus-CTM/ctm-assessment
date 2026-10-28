// DIAGNOSTIC ONLY: minimal Pyodide worker for the residual-leak map. Mirrors
// the ctm-libs fix (Erasmus-CTM/ctm-libs#60): a non-shared interrupt buffer
// right after loadPyodide, so CPython calls into JavaScript every 50
// eval-breaker checks. config: {indexURL, fix, stopflag, flagURL, packages,
// setup, calibrate}
//   fix false      no interrupt buffer (the shipped worker before #60)
//   stopflag       mitigation prototypes for the interrupt buffer:
//     'u8'         new Uint8Array(1) (= the #60 fix; default when fix)
//     'getter-now' object whose [0] getter calls performance.now() (a host
//                  call that services pending VM traps), no stop flag
//     'getter-xhr' [0] getter: at most every 100 ms, a synchronous XHR to the
//                  page's blob URL; once the page revokes it, returns 2
//                  (SIGINT) so Python raises KeyboardInterrupt
let flagged = false, lastCheck = 0, xhrCount = 0, reads = 0;
const noop = () => {};
const HOST = {
  json: () => JSON.stringify(0),
  jsonparse: () => JSON.parse('0'),
  now: () => performance.now(),
  apply: () => Reflect.apply(noop, null, []),
  eval: () => eval('0')
};
function interruptBuffer(c) {
  //     'getter-host:<op>'  [0] getter makes one cheap host call (HOST[op])
  //     'proxy-buffer'      a Proxy around Uint8Array(1): every read goes
  //                         through the C++ proxy path
  if (/^getter-host:/.test(c.stopflag)) { const op = HOST[c.stopflag.split(':')[1]]; return {get 0() { op(); return 0; }, set 0(v) {}}; }
  if (c.stopflag === 'proxy-buffer') return new Proxy(new Uint8Array(1), {});
  if (c.stopflag === 'getter-now') return {get 0() { performance.now(); return 0; }, set 0(v) {}};
  if (c.stopflag === 'getter-xhr') return {
    get 0() {
      if (flagged) return 2;
      const now = performance.now();
      if (now - lastCheck < 100) return 0;
      lastCheck = now; xhrCount++;
      try { const x = new XMLHttpRequest(); x.open('GET', c.flagURL, false); x.send(); if (x.status !== 200) flagged = true; }
      catch (e) { flagged = true; }
      return flagged ? 2 : 0;
    },
    set 0(v) {}
  };
  return new Uint8Array(1);
}
self.onmessage = async e => {
  const c = e.data;
  try {
    if (c.type === 'run') {
      postMessage({type: 'running'});
      try { self.pyodide.runPython(c.code); postMessage({type: 'finished'}); }
      catch (error) { postMessage({type: 'stopped', error: error && error.type || String(error && error.message || error).split('\n').filter(Boolean).at(-1), xhrCount}); }
      return;
    }
    const t = performance.now();
    importScripts(c.indexURL + 'pyodide.js');
    self.pyodide = await loadPyodide({indexURL: c.indexURL});
    if (c.fix) self.pyodide.setInterruptBuffer(interruptBuffer(c));
    if (c.packages && c.packages.length) await self.pyodide.loadPackage(c.packages);
    if (c.setup) self.pyodide.runPython(c.setup);
    let calibration;
    if (c.calibrate) calibration = self.pyodide.runPython(c.calibrate);
    postMessage({type: 'ready', ms: Math.round(performance.now() - t), version: self.pyodide.version, calibration});
  } catch (error) { postMessage({type: 'error', error: String(error && error.message || error).slice(0, 500)}); }
};
