const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repo = path.join(__dirname, '..');
const libsSource = process.env.CTM_ASSETS_LIBS_SOURCE;
const C = libsSource ? require(path.join(path.resolve(libsSource), 'tests/helpers/ctm-libs.cjs')) : null;
const root = path.join(repo, '_extensions/ctm-assessment');
const board = {
  src_jxg: 'https://cdn.jsdelivr.net/npm/jsxgraph@1.2.3/distrib/jsxgraphcore.js',
  src_css: 'https://cdn.jsdelivr.net/npm/jsxgraph@1.2.3/distrib/jsxgraph.css',
  src_mjx: 'https://cdn.jsdelivr.net/npm/mathjax@4.5.6/tex-mml-svg.js',
  mjx_fonts: 'https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@7.8.9/'
};
function project(front = '') {
  assert.ok(C.hasQuarto, 'dedicated assets provenance job requires real Quarto');
  const dir = C.tempdir('ctm-assets-hook-');
  C.install(dir, {withAlias: false});
  C.installProbe(dir);
  const assessment = C.installPackage(dir);
  // Production hook verbatim; unrelated component filters are omitted.
  fs.copyFileSync(path.join(root, 'ctm-assessment.lua'), path.join(assessment, 'ctm-assessment.lua'));
  fs.copyFileSync(path.join(root, 'author-imports.lua'), path.join(assessment, 'author-imports.lua'));
  fs.writeFileSync(path.join(assessment, 'jsxgraph-pins.yml'),
    'jsxgraph:\n' + Object.entries(board).map(([k,v]) => '  ' + k + ': ' + v + '\n').join(''));
  const table = JSON.parse(fs.readFileSync(path.join(C.library, 'assets.json'), 'utf8'));
  const runtime = fs.readFileSync(path.join(C.library, 'runtime/pyodide-runtime.js'), 'utf8');
  const py = runtime.match(/var indexURL = '[^']+\/v([^/]+)\/full\/';/)[1];
  const versions = Object.fromEntries(Object.entries(table.assets).map(([k,v]) => [k,v.version]));
  Object.assign(versions, {pyodide:py,jsxgraph:'1.2.3',mathjax4:'4.5.6','mathjax-newcm-font':'7.8.9'});
  C.write(dir, {
    '_quarto.yml': 'project:\n  type: default\n  render: [sub/page.qmd]\n  resources: ["_ctm-assets/**"]\nfilters: [ctm-assessment, ctm-libs, probe]\nformat:\n  html:\n    theme: [default, offline-system.scss]\nctm-assessment:\n  assets: local\nai-feedback:\n  enabled: false\n',
    'offline-system.scss': fs.readFileSync(path.join(root, 'offline-system.scss'), 'utf8'),
    '_ctm-assets/manifest.json': JSON.stringify({v:1,versions,files:{}}),
    ['_ctm-assets/pyodide/' + py + '/pyodide-lock.json']: JSON.stringify({packages:{numpy:{}}}),
    'sub/page.qmd': '---\ntitle: Actual assets hook\n' + front + '---\n\n' +
      C.probe('pins', 'local m=ctm.settings.meta(); local out={}; for k,v in pairs(m.jsxgraph) do out[k]=pandoc.utils.stringify(v) end; return out')
  });
  return dir;
}
test('actual assessment hook defaults are rewritten to local board and font URLs', {skip:!C}, () => {
  const dir=project();
  try {
    const r=C.render(dir); assert.equal(r.status,0,r.stderr);
    const pins=C.probes(C.html(dir,'sub/page.qmd')).pins;
    assert.equal(pins.src_jxg,'../_ctm-assets/npm/jsxgraph@1.2.3/distrib/jsxgraphcore.js');
    assert.equal(pins.src_css,'../_ctm-assets/npm/jsxgraph@1.2.3/distrib/jsxgraph.css');
    assert.equal(pins.src_mjx,'../_ctm-assets/npm/mathjax@4.5.6/tex-mml-svg.js');
    assert.equal(pins.mjx_fonts,'../_ctm-assets/npm/@mathjax/mathjax-newcm-font@7.8.9/');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('an authored HTTP URL equal to the pin is rejected by actual hook provenance', {skip:!C}, () => {
  const dir=project('jsxgraph:\n  src_jxg: ' + board.src_jxg + '\n');
  try {const r=C.render(dir);assert.notEqual(r.status,0);assert.match(r.stderr,/author HTTP jsxgraph\.src_jxg/);}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual hook overwrites an author-forged private default marker', {skip:!C}, () => {
  const dir=project('jsxgraph:\n  src_jxg: ' + board.src_jxg +
    '\n_ctm-assessment-pin-defaults:\n  src_jxg: ' + board.src_jxg + '\n');
  try {const r=C.render(dir);assert.notEqual(r.status,0);assert.match(r.stderr,/author HTTP jsxgraph\.src_jxg/);}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
});
