// A complete canonical fixture; mutations exercise the real comparator CLI.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sorted=x=>x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asset-compare-')),project=path.join(dir,'project');
  const pins={repositories:{'ctm-libs':{repository:'fixture/libs',commit:'1'.repeat(40)},'pyodide-interaktiv':{repository:'fixture/python',commit:'2'.repeat(40)},jsxgraph:{repository:'fixture/board',commit:'3'.repeat(40)}}};
  const record={repositories:structuredClone(pins.repositories),extension_sha256:{}};
  const put=(folder,file,text)=>{
    const p=path.join(project,'_extensions',folder,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);
    (record.extension_sha256[folder]||={})[file]=sha(text);
  };
  const table={v:1,assets:{'monaco-editor':{version:'0.46.0',cdn:'https://cdn.jsdelivr.net/npm/monaco-editor@{version}/',local:'npm/monaco-editor@{version}/'},'font-awesome':{version:'6.5.1',cdn:'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@{version}/',local:'npm/fa@{version}/'}}};
  const helper='globalThis.CTMAssets={url(){}};';
  put('ctm-libs','assets.json',JSON.stringify(table));
  put('ctm-libs','assets.js',helper);
  put('ctm-libs','runtime/pyodide-runtime.js',"var indexURL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';");
  put('ctm-assessment','jsxgraph-pins.yml','jsxgraph:\n  src_jxg: https://cdn.jsdelivr.net/npm/jsxgraph@1/distrib/jsxgraphcore.js\n  src_css: https://cdn.jsdelivr.net/npm/jsxgraph@1/distrib/jsxgraph.css\n  src_mjx: https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-svg.js\n');
  const code=expression=>"// Configure the Monaco Editor's loader\nrequire.config({paths:{'vs': "+expression+"}});";
  put('pyodide-interaktiv','qpyodide-monaco-editor-init.html','<script type="module" id="qpyodide-monaco-editor-init">'+code("CTMAssets.url('monaco-editor', 'min/vs')")+'</script>');
  fs.writeFileSync(path.join(project,'resolved-repos.json'),JSON.stringify(record));
  const pinsFile=path.join(dir,'pins.json');fs.writeFileSync(pinsFile,JSON.stringify(pins));
  const config={v:1,mode:'cdn',bases:{'monaco-editor':'https://cdn.jsdelivr.net/npm/monaco-editor@0.46.0/','font-awesome':'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/',pyodide:'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/',jsxgraph:'https://cdn.jsdelivr.net/npm/jsxgraph@1/',mathjax4:'https://cdn.jsdelivr.net/npm/mathjax@4/'}};
  const monaco=(v)=>'<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/monaco-editor@'+v+'/min/vs/editor/editor.main.css"><script src="https://cdn.jsdelivr.net/npm/monaco-editor@'+v+'/min/vs/loader.js"></script>';
  const init=x=>'<script type="module" id="qpyodide-monaco-editor-init">'+code(x)+'</script>';
  const math='<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml-full.js" id="MathJax-script" async type="text/javascript"></script>';
  const body='<p id="lesson">Unchanged prose and <span class="math">x+1</span>.</p><script>window.__mathExerciseConfig={"grading":{"answer":2}};</script><script src="checker.js"></script><script src="ordinary.js"></script>';
  const before='<!doctype html><html><head>'+monaco('0.46')+'<script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/js/all.min.js"></script><script src="https://cdnjs.cloudflare.com/polyfill/v3/polyfill.min.js?features=es6"></script>'+math+init("'https://cdn.jsdelivr.net/npm/monaco-editor@0.46/min/vs'")+'</head><body>'+body+'</body></html>';
  const after='<!doctype html><html><head><script src="site_libs/quarto-contrib/ctm-assets-1.0.0/assets.js"></script><script>globalThis.CTM_ASSETS='+JSON.stringify(sorted(config))+';</script>'+monaco('0.46.0')+'<script src="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/js/all.min.js"></script>'+math+init("CTMAssets.url('monaco-editor', 'min/vs')")+'</head><body>'+body+'</body></html>';
  for(const side of ['before','after'])fs.mkdirSync(path.join(dir,side));
  const helperFile=path.join(dir,'after/site_libs/quarto-contrib/ctm-assets-1.0.0/assets.js');fs.mkdirSync(path.dirname(helperFile),{recursive:true});fs.writeFileSync(helperFile,helper);
  fs.writeFileSync(path.join(dir,'before/page.html'),before);
  const run=(html=after,extra=[])=>{
    fs.writeFileSync(path.join(dir,'after/page.html'),html);
    const report=path.join(dir,'report.json');
    const p=spawnSync(process.execPath,['tools/compare-rendered.mjs','--before',path.join(dir,'before'),'--after',path.join(dir,'after'),'--expect','tools/compare-rendered/expect/step4.yml','--report',report,'--asset-sources',project,'--asset-pins',pinsFile,...extra],{cwd:root,encoding:'utf8'});
    return {status:p.status,stderr:p.stderr,report:fs.existsSync(report)?JSON.parse(fs.readFileSync(report)):null};
  };
  return {dir,project,pinsFile,helperFile,after,before,run,record,table,math,put};
}
test('only ten structurally verified asset rows are eligible',()=>{
  const f=fixture();try{
    const r=f.run();assert.equal(r.status,0,r.stderr+JSON.stringify(r.report));
    assert.equal(r.report.items.length,10);assert.ok(r.report.items.every(i=>i.category==='assets'));
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('P13 permits only exact pinned worker bytes; code and attribute mutations stay unexplained',()=>{
 const f=fixture();try{
  f.put('ctm-libs','runtime/pyodide-runtime.js',"var indexURL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';\nroot.CTMWorker.page({});");
  for(const name of ['pyodide-worker.js','coi-serviceworker.js','coi-frame-startup.js'])f.put('ctm-libs','runtime/'+name,'/* canonical '+name+' */');
  fs.writeFileSync(path.join(f.project,'resolved-repos.json'),JSON.stringify(f.record));
  const file=path.join(f.dir,'after/site_libs/quarto-contrib/ctm-worker-0.9.0/pyodide-worker.js');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'/* canonical pyodide-worker.js */');
  const tag='<script src="site_libs/quarto-contrib/ctm-worker-0.9.0/pyodide-worker.js"></script>';
  const html=f.after.replace('</head>',tag+'</head>'),expect=['--expect','tools/compare-rendered/expect/step5-p13.yml'];
  let result=f.run(html,expect);
  assert.equal(result.status,0,result.stderr+JSON.stringify(result.report));
  assert.equal(result.report.items.filter(i=>i.category==='p13-worker-delivery').length,1);
  fs.writeFileSync(file,'/* altered executable worker */');
  result=f.run(html,expect);assert.equal(result.status,1);
  fs.writeFileSync(file,'/* canonical pyodide-worker.js */');
  result=f.run(html.replace(tag,tag.replace('<script ','<script async ')),expect);assert.equal(result.status,1);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
const mutations={
  'missing helper':s=>s.replace(/<script src="site_libs[^"]+assets.js"><\/script>/,''),
  'duplicate helper':s=>s.replace(/(<script src="site_libs[^"]+assets.js"><\/script>)/,'$1$1'),
  'missing config':s=>s.replace(/<script>globalThis.CTM_ASSETS=[\s\S]*?<\/script>/,''),
  'duplicate config':s=>s.replace(/(<script>globalThis.CTM_ASSETS=[\s\S]*?<\/script>)/,'$1$1'),
  'self consistent hostile URLs':s=>s.replaceAll('https://cdn.jsdelivr.net/npm/monaco-editor@0.46.0/','https://untrusted.invalid/monaco/'),
  'wrong raw query':s=>s.replace('0.46.0/min/vs/loader.js','0.46.0/min/vs/loader.js?changed=1'),
  'extra initializer code':s=>s.replace("CTMAssets.url('monaco-editor', 'min/vs')","CTMAssets.url('monaco-editor', 'min/vs'), changed: true"),
  'changed real MathJax':s=>s.replace('mathjax@3/es5','mathjax@4/es5'),
  'removed real MathJax':s=>s.replace(/<script[^>]+id="MathJax-script"[^>]*><\/script>/,''),
  'resource order':s=>s.replace(/(<script src="https:[^"]+loader.js"><\/script>)(<script src="https:[^"]+all.min.js"><\/script>)/,'$2$1'),
  'helper after consumer':s=>s.replace(/(<script src="site_libs[^"]+assets.js"><\/script>)/,'').replace('</head>','<script src="site_libs/quarto-contrib/ctm-assets-1.0.0/assets.js"></script></head>'),
  prose:s=>s.replace('Unchanged prose','Different prose'),
  math:s=>s.replace('x+1','x-1'),
  grading:s=>s.replace('"answer":2','"answer":3'),
  ids:s=>s.replace('id="lesson"','id="other"'),
  'unrelated script':s=>s.replace('src="checker.js"','src="different.js"'),
  'unrelated loader order':s=>s.replace('<script src="checker.js"></script><script src="ordinary.js"></script>','<script src="ordinary.js"></script><script src="checker.js"></script>'),
  'unrelated raw query':s=>s.replace('src="checker.js"','src="checker.js?tamper=1"'),
  'unrelated duplicate':s=>s.replace('<script src="checker.js"></script>','<script src="checker.js"></script><script src="checker.js"></script>'),
  'unrelated async':s=>s.replace('src="checker.js"','async src="checker.js"'),
  'unrelated module':s=>s.replace('src="checker.js"','type="module" src="checker.js"'),
  'unrelated onload':s=>s.replace('src="checker.js"','onload="changed()" src="checker.js"'),
  'missing registration':s=>s.replace(/<script>window.__mathExerciseConfig=.*?<\/script>/,'')
};
for(const [name,mutate]of Object.entries(mutations))test(name+' remains unexplained',()=>{
  const f=fixture();try{const r=f.run(mutate(f.after));assert.equal(r.status,1,r.stderr+JSON.stringify(r.report));assert.ok(r.report.items.some(i=>!i.category));}
  finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('canonical inputs and helper bytes fail closed',()=>{
  const f=fixture();try{
    fs.appendFileSync(f.helperFile,'// altered');assert.equal(f.run().status,1);
    fs.writeFileSync(path.join(f.project,'_extensions/ctm-libs/assets.json'),JSON.stringify({...f.table,changed:true}));
    assert.equal(f.run().status,2);
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('source tuple, same-version table edits, and missing inputs fail closed',()=>{
  const f=fixture();try{
    f.record.repositories['ctm-libs'].commit='9'.repeat(40);
    fs.writeFileSync(path.join(f.project,'resolved-repos.json'),JSON.stringify(f.record));
    assert.equal(f.run().status,2);
    f.record.repositories['ctm-libs'].commit='1'.repeat(40);
    fs.writeFileSync(path.join(f.project,'resolved-repos.json'),JSON.stringify(f.record));
    f.table.assets['monaco-editor'].cdn='https://untrusted.invalid/{version}/';
    fs.writeFileSync(path.join(f.project,'_extensions/ctm-libs/assets.json'),JSON.stringify(f.table));
    assert.equal(f.run().status,2);
    assert.equal(f.run(f.after,['--asset-pins','']).status,2);
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('an unchanged existing asset capability remains comparable',()=>{
  const f=fixture();try{
    fs.writeFileSync(path.join(f.dir,'before/page.html'),f.after);
    const dest=path.join(f.dir,'before/site_libs');
    fs.cpSync(path.join(f.dir,'after/site_libs'),dest,{recursive:true});
    assert.equal(f.run().status,0);
    assert.equal(f.run(f.after.replace('0.46.0/min/vs/loader.js','0.46.0/min/vs/loader.js?tamper')).status,1);
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('legacy polyfill query aliases and inline kind collisions stay unexplained',()=>{
  const f=fixture();try{
    assert.equal(f.run(f.after.replace('</head>','<script src="https://cdnjs.cloudflare.com/polyfill/v3/polyfill.min.js?features=changed"></script></head>')).status,1);
    const collision="<script>// Configure the Monaco Editor's loader\nrequire.config({paths:{'vs': 'authored'}});</script>";
    fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace('</head>',collision+'</head>'));
    assert.equal(f.run(f.after.replace('</head>',collision.replace('authored','changed')+'</head>')).status,1);
  }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
function boardDoc(jxg,mjx,css){
 return '<!DOCTYPE html> <html lang="en"> <head> <meta charset="UTF-8"> <script id="MathJax-script" async src="'+mjx+'"></script> <script src="'+jxg+'"></script> <style>@import url("'+css+'");</style> <style>html,body{margin:0;}</style> </head> <body> <div id="JXG12345678_1234_1234_1234_12345678" class="jxgbox"></div> <script>window.BOARDID="JXG12345678_1234_1234_1234_12345678"; const board=JXG.JSXGraph.initBoard(BOARDID,{}); window.grading={answer:2};</script> </body> </html>';
}
for(const frameId of ['JXG12345678_1234_1234_1234_12345678','assessment-triangle'])test('only exact canonical board default URL changes are eligible: '+frameId,()=>{
 const f=fixture();try{
   const old=boardDoc('https://cdn.jsdelivr.net/npm/jsxgraph@1/distrib/jsxgraphcore.js','https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-svg.js','https://cdn.jsdelivr.net/npm/jsxgraph@1/distrib/jsxgraph.css');
   const current=old.replaceAll('jsxgraph@1/','jsxgraph@1.14.1/').replaceAll('mathjax@4/','mathjax@4.1.3/');
   const frame=html=>'<iframe id="'+frameId+'" src="data:text/html;base64,'+Buffer.from(html).toString('base64')+'"></iframe>';
   f.put('ctm-assessment','jsxgraph-pins.yml','jsxgraph:\n  src_jxg: https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraphcore.js\n  src_css: https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraph.css\n  src_mjx: https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-svg.js\n');
   fs.writeFileSync(path.join(f.project,'resolved-repos.json'),JSON.stringify(f.record));
   fs.writeFileSync(path.join(f.dir,'before/page.html'),'<html><body>'+frame(old)+'</body></html>');
   // Existing asset capability is identical; only embedded board pin URLs vary.
   const registered=f.after.replace('</body>',frame(old)+'</body>');
   fs.writeFileSync(path.join(f.dir,'before/page.html'),registered.replaceAll('jsxgraph@1/','jsxgraph@1.14.1/').replaceAll('mathjax@4/','mathjax@4.1.3/'));
   fs.cpSync(path.join(f.dir,'after/site_libs'),path.join(f.dir,'before/site_libs'),{recursive:true});
   const make=board=>f.after.replaceAll('jsxgraph@1/','jsxgraph@1.14.1/').replaceAll('mathjax@4/','mathjax@4.1.3/').replace('</body>',frame(board)+'</body>');
   const good=f.run(make(current));assert.equal(good.status,0,JSON.stringify(good));
   assert.ok(good.report.items.some(i=>i.assets==='board-defaults'));
   for(const bad of [current.replace('jsxgraph@1.14.1/','jsxgraph@1.14.2/'),current.replace('initBoard(BOARDID,{})','initBoard(BOARDID,{axis:true})'),current.replace('class="jxgbox"','class="different"'),current.replace('answer:2','answer:3'),current.replace(' async ',' defer '),current.replace('jsxgraphcore.js','jsxgraphcore.js?tamper=1'),current.replace('jsxgraph.css','different.css'),current.replace('</head>','<script src="other.js"></script></head>')]){
     const r=f.run(make(bad));assert.equal(r.status,1,JSON.stringify(r));
   }
   assert.equal(f.run(make(current).replace('<iframe id=', '<iframe sandbox="allow-scripts" id=')).status,1);
   assert.equal(f.run(make(current).replace('src="data:text/html;base64,','src="https://untrusted.invalid/?payload=')).status,1);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('unchanged standalone pages need no asset capability',()=>{
 const f=fixture();try{
   fs.writeFileSync(path.join(f.dir,'before/page.html'),'<html><body><p>Standalone page</p></body></html>');
   assert.equal(f.run('<html><body><p>Standalone page</p></body></html>').status,0);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('polyfill removal permits zero actual loaders but never a deleted real loader',()=>{
 const f=fixture();try{
   fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace(f.math,''));
   assert.equal(f.run(f.after.replace(f.math,'')).status,0);
   fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before);
   assert.equal(f.run(f.after.replace(f.math,'')).status,1);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('retained duplicate groups preserve each ordered raw URL and attribute identity',()=>{
 const f=fixture();try{
   const one='<script src="checker.js"></script>',two=one+one;
   const before=f.before.replace(one,two),after=f.after.replace(one,two);
   fs.writeFileSync(path.join(f.dir,'before/page.html'),before);
   assert.equal(f.run(after).status,0);
   for(const changed of [
      after.replace(one,'<script async src="checker.js"></script>'),
      after.replace(one,'<script type="module" src="checker.js"></script>'),
      after.replace(one,'<script src="checker.js?changed=1"></script>'),
      after.replace(one,'<script onload="changed()" src="checker.js"></script>')
   ])assert.equal(f.run(changed).status,1);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('MathJax loader preservation also covers default scripts without an id',()=>{
 const f=fixture();try{
   const before=f.before.replace(' id="MathJax-script"',''),after=f.after.replace(' id="MathJax-script"','');
   fs.writeFileSync(path.join(f.dir,'before/page.html'),before);
   assert.equal(f.run(after).status,0);
   assert.equal(f.run(after.replace(/<script src="https:\/\/cdn.jsdelivr.net\/npm\/mathjax[^>]+><\/script>/,'')).status,1);
   assert.equal(f.run(after.replace('mathjax@3/es5','mathjax@4/es5')).status,1);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('actual-page calibration handles MathJax loaders without ids and truly absent loaders',()=>{
 for(const hasLoader of [true,false]){
   const f=fixture();try{
     const before=hasLoader?f.before.replace(' id="MathJax-script"',''):f.before.replace(f.math,'');
     const after=hasLoader?f.after.replace(' id="MathJax-script"',''):f.after.replace(f.math,'');
     fs.writeFileSync(path.join(f.dir,'before/page.html'),before);
     fs.writeFileSync(path.join(f.dir,'after/page.html'),after);
     const result=spawnSync(process.execPath,['tests/compare-rendered-store-calibration.cjs',path.join(f.dir,'before'),path.join(f.dir,'after'),'--asset-sources',f.project,'--asset-pins',f.pinsFile],{cwd:root,encoding:'utf8'});
     assert.equal(result.status,0,result.stdout+result.stderr);
     assert.ok(result.stdout.includes(hasLoader?'real-missing-MathJax:':'No actual MathJax loader in this render'));
     assert.ok(result.stdout.includes('real-altered-helper:'));
   }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
 }
});


test('resource-order failures retain their full diagnostic evidence',()=>{
 const f=fixture();try{
   const after=f.after.replace('<script src="checker.js"></script><script src="ordinary.js"></script>','<script src="ordinary.js"></script><script src="checker.js"></script>');
   const result=f.run(after);
   assert.equal(result.status,1);
   const failure=result.report.items.find(i=>i.what==='Retained resource order changed');
   assert.ok(failure&&failure.before.length&&failure.after.length);
   assert.deepEqual(failure.before.slice(-2).map(i=>i.url),['checker.js','ordinary.js']);
   assert.deepEqual(failure.after.slice(-2).map(i=>i.url),['ordinary.js','checker.js']);
   assert.ok(result.stderr.includes('Retained resource order evidence: '));
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});


test('historical asset replay fixes both package sides and course sources',()=>{
 const workflow=require('js-yaml').load(fs.readFileSync(path.join(root,'.github/workflows/compare-assets-baseline.yml'),'utf8'));
 assert.deepEqual(Object.keys(workflow.jobs).sort(),['campaign','demo','examples','main-course']);
 assert.equal(workflow.jobs.campaign.steps[0].env.CONFIRMATION,'${{ inputs.confirmation }}');
 assert.match(workflow.jobs.campaign.steps[0].run,/exit 1/);
 const sides=new Set(),bases=new Set();
 for(const name of ['examples','main-course','demo']){
   const job=workflow.jobs[name];
   assert.deepEqual(job.needs,['campaign']);
   assert.equal(job.uses,'./.github/workflows/compare-courses.yml');
   assert.equal(job.with['tooling-ref'],'${{ github.event.pull_request.head.sha || github.sha }}');
   assert.match(job.with.base,/^[a-f0-9]{40}$/);
   assert.match(job.with.head,/^[a-f0-9]{40}$/);
   assert.notEqual(job.with.base,job.with.head);
   sides.add(job.with.head);bases.add(job.with.base);
   if(job.with.course!=='examples')assert.match(job.with['course-ref'],/^[a-f0-9]{40}$/);
   assert.equal(job.with.convert,undefined);
   assert.equal(job.with['review-refs'],undefined);
 }
 assert.equal(bases.size,1);
 assert.equal(sides.size,2);
 assert.equal(workflow.jobs.examples.with.head,workflow.jobs.demo.with.head);
 assert.notEqual(workflow.jobs['main-course'].with.head,workflow.jobs.demo.with.head);
});


test('only an absent captured preload default becoming boolean true is equivalent',()=>{
 const f=fixture();try{
   const settings=(value,extra='')=>'<script>// qpyodide-document-settings.js\nglobalThis.qpyodideInstallPythonPackagesList = ["numpy"];\n'+(value===undefined?'':'globalThis.qpyodidePreloadPackages = '+value+';\n')+extra+'</script>';
   const before=f.before.replace('</head>',settings()+'</head>');
   const after=(value,extra='')=>f.after.replace('</head>',settings(value,extra)+'</head>');
   fs.writeFileSync(path.join(f.dir,'before/page.html'),before);
   const good=f.run(after('true'));assert.equal(good.status,0,JSON.stringify(good));
   const row=good.report.items.find(i=>i.assets==='preload-default');
   assert.equal(row.category,'pyodide-default-preloads');
   assert.equal(row.path,'/0/qpyodidePreloadPackages');
   assert.equal(row.after,true);assert.equal(row.before,undefined);
   for(const value of ['false','"true"','1','null','[]','{}'])assert.equal(f.run(after(value)).status,1,value+' must stay unexplained');
   assert.equal(f.run(after('true','globalThis.unrelated = true;\n')).status,1,'additional fields stay unexplained');
   assert.equal(f.run(after('true').replace('["numpy"]','["scipy"]')).status,1,'other keys stay unexplained');
   fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace('</head>',settings('true')+'</head>'));
   assert.equal(f.run(after('true')).status,0,'existing true remains unchanged');
   assert.equal(f.run(after('false')).status,1,'true to false stays unexplained');
   assert.equal(f.run(after()).status,1,'removing an existing option stays unexplained');
   fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace('</head>',settings('false')+'</head>'));
   assert.equal(f.run(after('true')).status,1,'existing false cannot become true silently');
   fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace('</head>',settings('null')+'</head>'));
   assert.equal(f.run(after('true')).status,1,'existing null cannot become true silently');
   fs.writeFileSync(path.join(f.dir,'before/page.html'),before.replace('</head>',settings()+'</head>'));
   assert.equal(f.run(after('true').replace('</head>',settings()+'</head>')).status,1,'additional captured array positions stay unexplained');
   const other=settings().replace('["numpy"]','["sympy"]');
   fs.writeFileSync(path.join(f.dir,'before/page.html'),before.replace('</head>',other+'</head>'));
   assert.equal(f.run(f.after.replace('</head>',other+settings('true')+'</head>')).status,1,'moved captured array positions stay unexplained');
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('the preload default composes only with the separately validated legacy UI language addition',()=>{
 const f=fixture();try{
   const settings=(lang,feedback,preload)=>'<script>// qpyodide-document-settings.js\nglobalThis.qpyodideLang='+JSON.stringify(lang)+';\nglobalThis.qpyodideFeedbackOptions='+JSON.stringify(feedback)+';\n'+(preload===undefined?'':'globalThis.qpyodidePreloadPackages='+JSON.stringify(preload)+';\n')+'</script>';
   const feedback={enabled:true,storage:'local',hints:true};
   const before=(lang='nb',options=feedback,preload)=>fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace('</head>',settings(lang,options,preload)+'</head>'));
   const after=(lang='nb',options={...feedback,uiLanguage:'nb'},preload=true)=>f.after.replace('</head>',settings(lang,options,preload)+'</head>');
   const run=(html=after(),extra=[])=>f.run(html,['--expect','tools/compare-rendered/expect/step3.yml',...extra]);
   before();
   const good=run();assert.equal(good.status,0,JSON.stringify(good));
   assert.equal(good.report.items.find(i=>i.path==='/0/qpyodidePreloadPackages').category,'pyodide-default-preloads');
   assert.equal(good.report.items.find(i=>i.path==='/0/qpyodideFeedbackOptions/uiLanguage').category,'pyodide-ui-language');
   assert.equal(f.run(after()).status,1,'language addition still requires its independent step3 expectation');
   for(const preload of [false,'true',null,1])assert.equal(run(after('nb',{...feedback,uiLanguage:'nb'},preload)).status,1,'only boolean true preserves preloads');
   for(const options of [{...feedback,uiLanguage:'en'},{...feedback,uiLanguage:'nb',hints:false},{...feedback,uiLanguage:'nb',extra:true}])
     assert.equal(run(after('nb',options)).status,1,'other nested settings stay unexplained');
   assert.equal(run(after('en',{...feedback,uiLanguage:'en'})).status,1,'document language must remain identical');
   before('zz');assert.equal(run(after('zz',{...feedback,uiLanguage:'zz'})).status,1,'unsupported language remains unexplained by step3');
   before('nb',{...feedback,uiLanguage:null});assert.equal(run().status,1,'existing null UI language cannot be replaced');
   before('nb',{...feedback,uiLanguage:'en'});assert.equal(run().status,1,'existing UI language changes prevent preload calibration');
   before('nb',feedback,false);assert.equal(run().status,1,'existing false preload cannot become true');
   before();assert.equal(run(after().replace('</head>',settings('nb',feedback)+'</head>')).status,1,'an additional settings object stays unexplained');
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('an exact Git board transition preserves code, grades and resource attributes',()=>{
 const f=fixture();try{
  const sha='a'.repeat(40),git='https://cdn.jsdelivr.net/gh/owner/runtime@'+sha+'/',resource=git+'_extensions/jsxgraph/resources/';
  const math='https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-svg.js';
  const old=boardDoc('https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraphcore.js',math,'https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraph.css');
  const current=boardDoc(resource+'js/jsxgraphcore.js',math,resource+'css/jsxgraph.css');
  const frame=html=>'<iframe id="assessment-triangle" src="data:text/html;base64,'+Buffer.from(html).toString('base64')+'"></iframe>';
  f.put('ctm-assessment','jsxgraph-pins.yml','jsxgraph:\n  src_jxg: '+resource+'js/jsxgraphcore.js\n  src_css: '+resource+'css/jsxgraph.css\n  src_mjx: '+math+'\n');
  fs.writeFileSync(path.join(f.project,'resolved-repos.json'),JSON.stringify(f.record));
  fs.writeFileSync(path.join(f.dir,'before/page.html'),f.after.replaceAll('mathjax@4/','mathjax@4.1.3/').replace('</body>',frame(old)+'</body>'));
  fs.cpSync(path.join(f.dir,'after/site_libs'),path.join(f.dir,'before/site_libs'),{recursive:true});
  const make=html=>f.after.replaceAll('https://cdn.jsdelivr.net/npm/jsxgraph@1/',git).replaceAll('mathjax@4/','mathjax@4.1.3/').replace('</body>',frame(html)+'</body>');
  const good=f.run(make(current),['--expect','tools/compare-rendered/expect/step6-a1.yml']);assert.equal(good.status,0,JSON.stringify(good));
  for(const bad of [current.replace(sha,'b'.repeat(40)),current.replace('answer:2','answer:3'),current.replace(' async ',' defer '),current.replace('axis:true','axis:false').replace('initBoard(BOARDID,{})','initBoard(BOARDID,{axis:true})')])assert.equal(f.run(make(bad),['--expect','tools/compare-rendered/expect/step6-a1.yml']).status,1);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});


test('P13 worker order move is exact and preserves all other resource order',()=>{
 const f=fixture();try{
  f.put('ctm-libs','runtime/pyodide-runtime.js',"var indexURL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';\nroot.CTMWorker.page({});");
  for(const name of ['pyodide-worker.js','coi-serviceworker.js','coi-frame-startup.js'])f.put('ctm-libs','runtime/'+name,'/* canonical '+name+' */');
  fs.writeFileSync(path.join(f.project,'resolved-repos.json'),JSON.stringify(f.record));
  const source=path.join(f.dir,'after/site_libs/quarto-contrib/ctm-worker-0.9.0/pyodide-worker.js');
  fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,'/* canonical pyodide-worker.js */');
  const script=name=>'<script src="site_libs/quarto-contrib/'+name+'"></script>';
  const runtime=script('ctm-runtime-0.9.0/pyodide-runtime.js'),worker=script('ctm-worker-0.9.0/pyodide-worker.js');
  const checker=script('ctm-checkers-0.12.0/ctm-checkers.js'),locale=script('ctm-locale-pyodide-interaktiv-0.9.0/pyodide-interaktiv.js');
  fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace('</head>',runtime+checker+worker+locale+'</head>'));
  const expected=['--expect','tools/compare-rendered/expect/step5-p13.yml'];
  const html=f.after.replace('</head>',runtime+worker+checker+locale+'</head>');
  let result=f.run(html,expected);assert.equal(result.status,0,result.stderr+JSON.stringify(result.report));
  assert.equal(result.report.items.filter(i=>i.category==='p13-worker-order').length,1);
  result=f.run(html.replace(checker+locale,locale+checker),expected);assert.equal(result.status,1,'unrelated order mutation stays unexplained');
  fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace('</head>',checker+worker+locale+'</head>'));
  result=f.run(html.replace(runtime,''),expected);assert.equal(result.status,1,'a missing runtime cannot justify moving worker to slot zero');
  fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace('</head>',runtime+checker+worker+worker+locale+'</head>'));
  result=f.run(html.replace(runtime+worker,runtime+worker+worker),expected);assert.equal(result.status,1,'duplicate workers cannot justify an order exception');
  fs.writeFileSync(path.join(f.dir,'before/page.html'),f.before.replace('</head>',runtime+checker+worker+locale+'</head>'));
  fs.writeFileSync(source,'/* unpinned worker */');result=f.run(html,expected);assert.equal(result.status,1,'worker movement needs canonical source bytes');
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
