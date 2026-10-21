const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const libs = process.env.CTM_ASSETS_LIBS_SOURCE;
const C = libs ? require(path.join(path.resolve(libs), 'tests/helpers/ctm-libs.cjs')) : null;
const extension = path.join(__dirname, '..', '_extensions/ctm-assessment');
function project(source, {privateIndex=true,cdn=false}={}) {
  assert.ok(C.hasQuarto, 'dedicated import gate job requires real Quarto');
  const dir=C.tempdir('ctm-author-imports-');
  C.install(dir,{withAlias:false}); C.installProbe(dir);
  const assessment=C.installPackage(dir);
  for(const file of ['ctm-assessment.lua','author-imports.lua','author-imports.py','author-imports-end.lua'])
    fs.copyFileSync(path.join(extension,file),path.join(assessment,file));
  const table=JSON.parse(fs.readFileSync(path.join(C.library,'assets.json'),'utf8'));
  const runtime=fs.readFileSync(path.join(C.library,'runtime/pyodide-runtime.js'),'utf8');
  const py=runtime.match(/var indexURL = '[^']+\/v([^/]+)\/full\/';/)[1];
  const versions=Object.fromEntries(Object.entries(table.assets).map(([k,v])=>[k,v.version]));
  versions.pyodide=py;
  const probe=[
    'local collector=assert(rawget(_G,"__ctmAuthorImports"))',
    'doc.blocks:walk({CodeBlock=function(b)',
    ' if b.classes:includes("authored-python") then collector.add{source=b.text,packages={},origin="actual starter"} end',
    'end})',
    'return true'
  ].join('\n');
  C.write(dir,{
    '_quarto.yml':'project:\n  type: default\n  render: [sub/page.qmd]\n  resources: ["_ctm-assets/**"]\nfilters: [ctm-assessment, ctm-libs, probe, _extensions/ctm-assessment/author-imports-end.lua]\nformat:\n  html:\n    theme: [default, offline-system.scss]\nctm-assessment:\n  assets: '+(cdn?'cdn':'local')+'\nai-feedback:\n  enabled: false\n',
    'offline-system.scss':fs.readFileSync(path.join(extension,'offline-system.scss'),'utf8'),
    '_ctm-assets/manifest.json':JSON.stringify({v:1,versions,files:{}}),
    ['_ctm-assets/pyodide/'+py+'/pyodide-lock.json']:JSON.stringify({info:{python:'fixture-release'},packages:{numpy:{}}}),
    'sub/helper.py':'raise RuntimeError("local helper is never executed")\n',
    'sub/page.qmd':'---\ntitle: Author import gate\n---\n\n~~~{.authored-python}\n'+source+'\n~~~\n'+C.probe('registered',probe)
  });
  if(privateIndex)C.write(dir,{'.private-extensions/assets-imports.json':JSON.stringify({
    v:1,python:'fixture-release',stdlib_modules:['os','importlib'],
    packages:{numpy:{imports:['numpy']},pandas:{imports:['pandas']}}
  })});
  return dir;
}
test('package end scans actual fragments without running author code and resolves page-local files', {skip:!C},()=>{
  const dir=project('import numpy\nimport os\nimport helper\nraise RuntimeError("authored code never executes")');
  try {const r=C.render(dir);assert.equal(r.status,0,r.stderr);assert.equal(C.probes(C.html(dir,'sub/page.qmd')).registered,true);}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('package end stops missing and unmapped author imports with their origin', {skip:!C},()=>{
  for(const source of ['import pandas','from importlib import import_module as load\nload("pandas")','import definitely_unmapped']){
    const dir=project(source);
    try {const r=C.render(dir);assert.notEqual(r.status,0);assert.match(r.stderr,/actual starter/);assert.match(r.stderr,/absent from the local bundle|neither release stdlib/);}
    finally {fs.rmSync(dir,{recursive:true,force:true});}
  }
});
test('local import check requires its private index; CDN mode needs no scanner environment', {skip:!C},()=>{
  const local=project('import numpy',{privateIndex:false});
  try {const r=C.render(local);assert.notEqual(r.status,0);assert.match(r.stderr,/private Python import index is missing/);}
  finally {fs.rmSync(local,{recursive:true,force:true});}
  const cdn=project('import unavailable_online_module',{privateIndex:false,cdn:true});
  try {const r=C.render(cdn);assert.equal(r.status,0,r.stderr);}
  finally {fs.rmSync(cdn,{recursive:true,force:true});}
});
