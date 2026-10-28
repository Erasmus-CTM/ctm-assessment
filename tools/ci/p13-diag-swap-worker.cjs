// DIAGNOSTIC ONLY: replace the deployed ctm-libs worker files of a copy of the
// site with the candidate in tools/diag-runtime/ (the stop probe), and drop
// their precompressed copies so nothing serves the old bytes.
const fs = require('node:fs'), path = require('node:path');
const source = path.join(__dirname, '..', 'diag-runtime');
let count = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/^pyodide-worker(-core)?\.js$/.test(entry.name) && fs.readFileSync(file, 'utf8').includes('CTMWorker')) {
      fs.copyFileSync(path.join(source, entry.name), file);
      for (const extra of [file + '.gz', file + '.br']) if (fs.existsSync(extra)) fs.rmSync(extra);
      console.log('swapped', file); count++;
    }
  }
})(process.argv[2]);
if (count < 2) throw new Error('expected both worker files, swapped ' + count);
