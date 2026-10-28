// DIAGNOSTIC ONLY: patch a copy of the deployed site so the Pyodide worker
// sets a non-shared interrupt buffer right after loadPyodide(). CPython then
// calls into JavaScript periodically, where WebKit can deliver terminate().
const fs = require('node:fs'), path = require('node:path');
const patch = '\n  pyodide.setInterruptBuffer(new Uint8Array(1)); // P13 DIAGNOSTIC PATCH\n';
let count = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/^pyodide-worker(-core)?\.js$/.test(entry.name)) {
      const text = fs.readFileSync(file, 'utf8');
      const start = text.indexOf('pyodide = await mod.loadPyodide({');
      if (start < 0) continue;
      const end = text.indexOf('\n  });\n', start) + '\n  });\n'.length - 1;
      fs.writeFileSync(file, text.slice(0, end) + patch + text.slice(end));
      console.log('patched', file); count++;
    }
  }
})(process.argv[2]);
if (!count) throw new Error('no worker patched');
