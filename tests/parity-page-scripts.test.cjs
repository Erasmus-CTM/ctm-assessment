// The parity extractor must execute both legacy component-owned and shared
// matrix dependencies from rendered tags before component initialization.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const page = require('../integration/feedback/page-scripts.cjs');

const library = process.env.CTM_LIBS_EXTENSION || path.resolve(__dirname, '../_extensions/ctm-libs');
const sourceFile = path.join(library, 'ui/ctm-matrix-input.js');
for (const shared of [false, true]) test(`parity loads ${shared ? 'shared' : 'legacy'} matrix dependency in rendered order`,
  {skip: !fs.existsSync(sourceFile) && 'Shared matrix source required; set CTM_LIBS_EXTENSION'}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctm-parity-matrix-'));
  const owner = shared ? 'ctm-matrix-input-0.15.0' : 'math-exercise-0.11.0';
  const matrix = `site_libs/quarto-contrib/${owner}/matrix-input.js`;
  const component = 'site_libs/quarto-contrib/math-exercise-0.11.0/math-exercise.js';
  const ignored = 'site_libs/quarto-contrib/unrelated-1.0.0/unrelated.js';
  const files = {
    [matrix]: 'window.order=["matrix"];' + fs.readFileSync(sourceFile, 'utf8'),
    [component]: 'window.matrixReady=window.MatrixInput.create({idPrefix:"parity"}).renderHTML({name:"A",rows:{auto:false,min:1,max:1,initial:1},cols:{auto:false,min:1,max:1,initial:1}}); window.order.push("component");',
    [ignored]: 'throw new Error("unrelated dependency executed");',
  };
  let dom;
  try {
    for (const [file, source] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
      fs.writeFileSync(path.join(dir, file), source);
    }
    dom = new JSDOM(`<script src="${matrix}"></script><script src="${component}"></script><script src="${ignored}"></script>`, {runScripts: 'outside-only'});
    const loaded = page.run(dom.window, path.join(dir, 'index.html'), page.MATH);
    assert.match(dom.window.matrixReady.html, /data-matrix-name="A"/);
    assert.match(dom.window.matrixReady.html, /parity-dm-A-1-1/);
    assert.deepEqual(Array.from(dom.window.order), ['matrix', 'component']);
    assert.deepEqual(loaded, [`${shared ? 'ctm-matrix-input' : 'math-exercise'}/matrix-input.js`, 'math-exercise/math-exercise.js']);
  } finally {
    if (dom) dom.window.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
