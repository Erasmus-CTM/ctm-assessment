// Actual Quarto output plus mutations; uses exact upstream checkouts, never eval.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const norm=s=>s.replace(/\s+/g,' ').trim(),hash=b=>createHash('sha256').update(b).digest('hex');
const randomId=/JXG[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{8}/g;
const run=(exe,args,cwd)=>{const r=spawnSync(exe,args,{cwd,encoding:'utf8',maxBuffer:32<<20});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'renderer-transition-'));

(async()=>{
 const M=await import(pathToFileURL(path.join(root,'tools/compare-rendered/jsxgraph-renderer.mjs')));
 const sources={},projects={},pins={};let checks=0;
 try {
  for(const side of ['before','after']) {
   const checkout=process.env[side==='before'?'JSXGRAPH_BEFORE_SOURCE':'JSXGRAPH_AFTER_SOURCE'];
   assert.ok(checkout,'Both exact upstream checkout paths are required');
   assert.equal(run('git',['rev-parse','HEAD'],checkout),M.RENDERERS[side].commit);
   const dir=projects[side]=path.join(tmp,side);fs.mkdirSync(dir,{recursive:true});
   fs.cpSync(path.join(checkout,'_extensions/jsxgraph'),path.join(dir,'_extensions/jsxgraph'),{recursive:true});
   const entry={repository:'jsxgraph/jsxgraph-quarto',commit:M.RENDERERS[side].commit};
   pins[side]={repositories:{jsxgraph:entry}};
   const record={repositories:{jsxgraph:entry},extension_sha256:{jsxgraph:{}}};
   for(const file of ['lua/jsxgraph.lua','graph-editor.js'])record.extension_sha256.jsxgraph[file]=hash(fs.readFileSync(path.join(dir,'_extensions/jsxgraph',file)));
   fs.writeFileSync(path.join(dir,'resolved-repos.json'),JSON.stringify(record));
   fs.writeFileSync(path.join(dir,'pins.json'),JSON.stringify(pins[side]));
   sources[side]=M.rendererSource(dir,pins[side],side);checks++;
   fs.writeFileSync(path.join(dir,'page.qmd'),`---\ntitle: Renderer regression\nfilters: [jsxgraph]\njsxgraph:\n  src_jxg: https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraphcore.js\n  src_css: https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/distrib/jsxgraph.css\n  src_mjx: https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-svg.js\n---\n\n\`\`\`{.jsxgraph assessment_id="strict-board" width="760" height="440" unit="px"}\n'use strict';\nvar board=JXG.JSXGraph.initBoard(BOARDID,{boundingbox:[-5,5,5,-5]});\nboard.create('point',[1,2]);\n\`\`\`\n\n\`\`\`{.jsxgraph assessment_id="relative-board" width="100" height="50" unit="%"}\nvar board=JXG.JSXGraph.initBoard(BOARDID,{boundingbox:[-4,4,4,-4]});\nboard.create('point',[2,1]);\n\`\`\`\n`);
   run(process.env.QUARTO||'quarto',['render','page.qmd','--to','html'],dir);
  }
  const frames=side=>[...fs.readFileSync(path.join(projects[side],'page.html'),'utf8').matchAll(/<iframe\b[^>]*>/g)].map(match=>{
   const attrs=Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&')]));
   return {getAttribute:name=>attrs[name]??null};
  });
  const old=frames('before'),fresh=frames('after');assert.equal(old.length,2);assert.equal(fresh.length,2);
  const decoded=frame=>'data:text/html;decoded,'+norm(Buffer.from(frame.getAttribute('src').slice(22),'base64').toString('utf8').replace(randomId,'JXG*'));
  const doc={querySelectorAll:()=>old};
  const items=old.map((frame,i)=>({before:decoded(frame),after:decoded(fresh[i])}));
  for(const item of items){assert.equal(M.proveRendererPair(item,sources,doc).allOtherNormalizedFrameBytesEqual,true);checks++;}
  const original=items[0];
  const reject=(name,change,side='after')=>{const item={...original,[side]:change(original[side])};assert.notEqual(item[side],original[side],name+' is a real mutation');assert.throws(()=>M.proveRendererPair(item,sources,doc),undefined,name);checks++;};
  reject('authored numeric value',s=>s.replace("board.create('point',[1,2])","board.create('point',[9,2])"));
  reject('authored appended statement',s=>s.replace('</body>','<script>window.extra=true;</script></body>'));
  reject('renderer statement',s=>s.replace('const version = 1;','const version = 2;'));
  reject('graph editor code',s=>s.replace('Graph editor requires a JSXGraph board','changed graph editor'));
  reject('MathJax URL',s=>s.replace('mathjax@4.1.3','mathjax@4.1.4'));
  reject('MathJax async lifecycle',s=>s.replace('id="MathJax-script" async','id="MathJax-script" defer'));
  reject('extra pre-loader',s=>s.replace('<script id="MathJax-script"','<script src="pre-loader.js"></script><script id="MathJax-script"'));
  reject('stylesheet',s=>s.replace('jsxgraph.css','other.css'));
  reject('inner frame DOM',s=>s.replace('class="jxgbox"','class="jxgbox changed"'));
  reject('board identity',s=>s.replace('const assessmentId = "strict-board"','const assessmentId = "other-board"'));
  reject('original provisional dimensions',s=>s.replace('const provisionalSize = [760, 440]','const provisionalSize = [760, 441]'),'before');
  const wrongGeometry={querySelectorAll:()=>old.map(frame=>({getAttribute:name=>name==='style'?'width:760px; height:441px;':frame.getAttribute(name)}))};
  assert.throws(()=>M.proveRendererPair(original,sources,wrongGeometry));checks++;
  const record=path.join(projects.after,'resolved-repos.json'),saved=fs.readFileSync(record);
  const bad=JSON.parse(saved);bad.repositories.jsxgraph.local_override=true;fs.writeFileSync(record,JSON.stringify(bad));
  assert.throws(()=>M.rendererSource(projects.after,pins.after,'after'));checks++;fs.writeFileSync(record,saved);
  const lua=path.join(projects.after,'_extensions/jsxgraph/lua/jsxgraph.lua'),bytes=fs.readFileSync(lua);fs.appendFileSync(lua,'\n-- changed');
  assert.throws(()=>M.rendererSource(projects.after,pins.after,'after'));checks++;
  const changed=JSON.parse(saved);changed.extension_sha256.jsxgraph['lua/jsxgraph.lua']=hash(fs.readFileSync(lua));fs.writeFileSync(record,JSON.stringify(changed));
  assert.throws(()=>M.rendererSource(projects.after,pins.after,'after'));checks++;
  fs.writeFileSync(lua,bytes);fs.writeFileSync(record,saved);
  const dirty=JSON.parse(saved);dirty.repositories.jsxgraph.dirty_files=['lua/jsxgraph.lua'];fs.writeFileSync(record,JSON.stringify(dirty));
  assert.throws(()=>M.rendererSource(projects.after,pins.after,'after'));checks++;fs.writeFileSync(record,saved);
  const ambiguous=JSON.parse(saved);ambiguous.extension_sha256.jsxgraph['lua\\jsxgraph.lua']=ambiguous.extension_sha256.jsxgraph['lua/jsxgraph.lua'];fs.writeFileSync(record,JSON.stringify(ambiguous));
  assert.throws(()=>M.rendererSource(projects.after,pins.after,'after'));checks++;fs.writeFileSync(record,saved);
  const unknown=JSON.parse(JSON.stringify(pins.after));unknown.repositories.jsxgraph.commit='a'.repeat(40);
  assert.throws(()=>M.rendererSource(projects.after,unknown,'after'));checks++;
  const fork=JSON.parse(JSON.stringify(pins.after));fork.repositories.jsxgraph.repository='aacchhee/jsxgraph-quarto';
  assert.throws(()=>M.rendererSource(projects.after,fork,'after'));checks++;
  assert.ok(M.loadRendererSources(projects.before,path.join(projects.before,'pins.json'),projects.after,path.join(projects.after,'pins.json')));checks++;
  console.log(JSON.stringify({checks,actualQuartoFrames:items.length,before:M.RENDERERS.before.commit,after:M.RENDERERS.after.commit,allNegativeMutationsRejected:true}));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
