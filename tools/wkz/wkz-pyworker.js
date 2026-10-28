// DIAGNOSTIC ONLY: minimal Pyodide worker for the residual-leak map. Mirrors
// the ctm-libs fix (Erasmus-CTM/ctm-libs#60): a non-shared interrupt buffer
// right after loadPyodide, so CPython calls into JavaScript every 50
// eval-breaker checks. config: {indexURL, fix, packages, setup, code, calibrate}
self.onmessage = async e => {
  const c = e.data;
  try {
    if (c.type === 'run') {
      postMessage({type: 'running'});
      self.pyodide.runPython(c.code);
      postMessage({type: 'finished'});
      return;
    }
    const t = performance.now();
    importScripts(c.indexURL + 'pyodide.js');
    self.pyodide = await loadPyodide({indexURL: c.indexURL});
    if (c.fix) self.pyodide.setInterruptBuffer(new Uint8Array(1));
    if (c.packages && c.packages.length) await self.pyodide.loadPackage(c.packages);
    if (c.setup) self.pyodide.runPython(c.setup);
    let calibration;
    if (c.calibrate) calibration = self.pyodide.runPython(c.calibrate);
    postMessage({type: 'ready', ms: Math.round(performance.now() - t), version: self.pyodide.version, calibration});
  } catch (error) { postMessage({type: 'error', error: String(error && error.message || error).slice(0, 500)}); }
};
