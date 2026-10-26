// Bounded CDN migration eligibility. HTML is never its own source of truth.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {loadRendererSources,proveRendererPair} from './jsxgraph-renderer.mjs';
const require=createRequire(import.meta.url), yaml=require('js-yaml');
const hash=b=>createHash('sha256').update(b).digest('hex');
const insist=(ok,message)=>{if(!ok)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(sorted):Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])]))):x;
const attrs=(el,except)=>[...el.attributes].filter(a=>a.name!==except).map(a=>[a.name,a.value]).sort();
const raw=el=>el.getAttribute(el.tagName==='LINK'?'href':'src');
const mathJaxScripts=doc=>[...doc.scripts].filter(e=>e.id==='MathJax-script'||/(?:^|\/)mathjax(?:[@\/.-]|$)/i.test(e.getAttribute('src')||''));
const resources=doc=>[...doc.querySelectorAll('script[src],link[rel="stylesheet"]')];
const normalize=u=>u.split('?')[0].replace(/(?:^|.*\/)(?:site_libs\/|[^/]*_files\/libs\/)/,'').replace(/quarto-contrib\/([\w-]+?)-\d+\.\d+\.\d+[^/]*\//,'$1/');
// The umbrella registers its unchanged asset helper before STACK prepares
// feedback. Permit only that earlier move across the four feedback resources.
function stackHelperMove(a,b) {
 if(!b.ctmStackTransition)return false;
 const x=resources(a).map(e=>e.tagName+'\0'+normalize(raw(e))),y=resources(b).map(e=>e.tagName+'\0'+normalize(raw(e)));
 const retained=new Set(x.filter(k=>y.includes(k))),before=x.filter(k=>retained.has(k)),after=y.filter(k=>retained.has(k));
 const helper='SCRIPT\0ctm-assets/assets.js',i=before.indexOf(helper),j=after.indexOf(helper);
 return i>j&&j>=0&&same(before.filter(k=>k!==helper),after.filter(k=>k!==helper))&&
   before.slice(j,i).every(k=>/^(?:SCRIPT\0ai-feedback\/(?:feedback-core|feedback-dom|ai-feedback)\.js|LINK\0ai-feedback\/ai-feedback\.css)$/.test(k));
}
const monacoCode=(s,expression)=>new RegExp('^// Configure the Monaco Editor\'s loader\\s+require\\.config\\(\\{\\s*paths\\s*:\\s*\\{\\s*[\'"]vs[\'"]\\s*:\\s*'+expression+'\\s*\\}\\s*\\}\\);$').test(s.trim());
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function loadAssetSources(project,pinsFile,rendererBeforeProject,rendererBeforePinsFile) {
  insist(Boolean(project)===Boolean(pinsFile),'--asset-sources and --asset-pins must be supplied together');
  insist(Boolean(rendererBeforeProject)===Boolean(rendererBeforePinsFile),'--renderer-before-sources and --renderer-before-pins must be supplied together');
  insist(!rendererBeforeProject||project,'Renderer calibration requires canonical after asset sources');
  if(!project)return null;
  const pins=JSON.parse(fs.readFileSync(pinsFile,'utf8'));
  const candidates=['resolved-repos.json','_extensions/ctm-assessment/resolved-repos.json'].map(p=>path.join(project,p)).filter(p=>fs.existsSync(p));
  insist(candidates.length,'Missing installed source record');
  const records=candidates.map(p=>JSON.parse(fs.readFileSync(p,'utf8')));
  insist(records.every(r=>same(sorted(r),sorted(records[0]))),'Conflicting installed source records');
  const record=records[0];
  for(const [folder,entries]of Object.entries(record.extension_sha256||{})){
    const normalized=Object.create(null);
    for(const [name,digest]of Object.entries(entries)){
      const key=name.replaceAll(String.fromCharCode(92),'/');
      insist(!Object.hasOwn(normalized,key),'Ambiguous source hash path: '+folder+'/'+key);
      normalized[key]=digest;
    }
    record.extension_sha256[folder]=normalized;
  }
  for(const name of ['ctm-libs','pyodide-interaktiv','jsxgraph']) {
    const pin=pins.repositories?.[name], actual=record.repositories?.[name];
    insist(pin&&/^[a-f0-9]{40}$/.test(pin.commit||'')&&actual?.repository===pin.repository&&actual.commit===pin.commit&&!actual.local_override&&!(actual.dirty_files||[]).length,'Asset source tuple mismatch: '+name);
  }
  const read=(folder,file)=>{
    const bytes=fs.readFileSync(path.join(project,'_extensions',folder,file));
    insist(record.extension_sha256?.[folder]?.[file]===hash(bytes),'Asset source hash mismatch: '+folder+'/'+file);
    return bytes;
  };
  const table=JSON.parse(read('ctm-libs','assets.json')), helper=read('ctm-libs','assets.js');
  insist(table.v===1&&table.assets&&typeof table.assets==='object','Invalid canonical asset table');
  const runtime=read('ctm-libs','runtime/pyodide-runtime.js').toString('utf8');
  const p13 = runtime.includes('root.CTMWorker.page({') ? Object.fromEntries([
    ['ctm-worker/pyodide-worker.js','runtime/pyodide-worker.js'],
    ['coi-serviceworker.js','runtime/coi-serviceworker.js'],
    ['ctm-coi-frame-startup/coi-frame-startup.js','runtime/coi-frame-startup.js'],
  ].map(([url,file])=>[url,hash(read('ctm-libs',file))])) : null;
  const py=[...runtime.matchAll(/var indexURL = '(https:\/\/cdn\.jsdelivr\.net\/pyodide\/v[^'\/]+\/full\/)';/g)];
  insist(py.length===1,'Ambiguous canonical Pyodide URL');
  // Assessment-owned board defaults are read from the installed after package.
  const boardPath=path.join(project,'_extensions/ctm-assessment/jsxgraph-pins.yml');
  const boardBytes=fs.readFileSync(boardPath);
  insist(record.extension_sha256?.['ctm-assessment']?.['jsxgraph-pins.yml']===hash(boardBytes),'Asset board source hash mismatch');
  const board=yaml.load(boardBytes.toString('utf8')).jsxgraph;
  const bases={};
  for(const [name,a] of Object.entries(table.assets)){
    insist(typeof a.version==='string'&&typeof a.cdn==='string'&&typeof a.local==='string','Malformed canonical asset entry');
    bases[name]=a.cdn.replaceAll('{version}',a.version);
  }
  bases.pyodide=py[0][1];
  for(const [key,name] of Object.entries({src_jxg:'jsxgraph',src_css:'jsxgraph',src_mjx:'mathjax4',mjx_fonts:'mathjax-newcm-font'})){
    if(!board[key])continue;
    const match=/^(https:\/\/cdn\.jsdelivr\.net\/npm\/(?:@[^/]+\/)?[^/@]+@[^/]+\/)/.exec(board[key]) ||
      /^(https:\/\/cdn\.jsdelivr\.net\/gh\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}\/)/.exec(board[key]);
    insist(match,'Malformed canonical board URL');
    insist(!bases[name]||bases[name]===match[1],'Conflicting canonical board bases');
    bases[name]=match[1];
  }
  const template=read('pyodide-interaktiv','qpyodide-monaco-editor-init.html').toString('utf8');
  const body=/<script type="module" id="qpyodide-monaco-editor-init">([\s\S]*?)<\/script>/.exec(template);
  insist(body&&monacoCode(body[1],"CTMAssets\\.url\\('monaco-editor', 'min/vs'\\)"),'Unexpected canonical Monaco initializer');
  return {config:{v:1,mode:'cdn',bases},helperHash:hash(helper),table,board,
    p13,renderer:loadRendererSources(rendererBeforeProject,rendererBeforePinsFile,project,pinsFile)};
}
export function markAssetChanges(A,B,items,context,page,afterFile,beforeFile) {
  markP13Changes(A,B,items,context);
  markBoardChanges(A,items,context,page);
  markPreloadDefault(A,B,items,context);
  const configScripts=doc=>[...doc.querySelectorAll('script:not([src])')].filter(s=>s.textContent.includes('CTM_ASSETS'));
  const helperScripts=doc=>resources(doc).filter(e=>normalize(raw(e))==='ctm-assets/assets.js');
  const active=configScripts(A.doc).length||configScripts(B.doc).length||helperScripts(A.doc).length||helperScripts(B.doc).length;
  if(!active&&!context)return;
  checkRetainedResources(A,B,items,page,context);
  if(!active){
    const consumer=doc=>[...doc.scripts].some(e=>e.textContent.includes('CTMAssets.url(')||
      /^(?:ctm-runtime|math-exercise|py-exercise|pyodide-interaktiv)\//.test(normalize(e.getAttribute('src')||''))||
      /(?:globalThis\.qpyodideCellDetails|window\.__mathExerciseConfig|window\.__pyExerciseConfig)/.test(e.textContent)||
      /(?:monaco-editor@|font-awesome\/[^/]+\/js\/all\.min\.js|@fortawesome\/fontawesome-free@)/.test(e.getAttribute('src')||''));
    if(consumer(A.doc)||consumer(B.doc))items.push({page,area:'assets',change:'invalid',what:'Missing asset registrations on consumer page',invariant:true});
    return;
  }
  const fail=message=>items.push({page,area:'assets',change:'invalid',what:message,invariant:true});
  try {
    insist(context,'Canonical installed asset sources are required');
    // This category covers the first CDN migration only, not local delivery.
    
    const configs=configScripts(B.doc),helpers=helperScripts(B.doc);
    insist(configs.length===1&&helpers.length===1,'Asset helper/config registration must occur once');
    const config=configs[0],helper=helpers[0];
    insist(config.parentElement===B.doc.head&&helper.parentElement===B.doc.head,'Asset registrations must be in head');
    insist(config.attributes.length===0&&same(attrs(helper,'src'),[]),'Unexpected asset registration attributes');
    const m=/^globalThis\.CTM_ASSETS=(\{[\s\S]*\});$/.exec(config.textContent.trim());
    insist(m&&same(sorted(JSON.parse(m[1])),sorted(context.config)),'Asset configuration differs from canonical sources');
    // Require a single assignment; duplicate JSON keys must not survive parsing.
    insist(m[1]===JSON.stringify(sorted(context.config)),'Noncanonical or ambiguous asset configuration');
    const helperURL=raw(helper);
    insist(!/[?#\\]/.test(helperURL)&&!/^\w+:|^\/\//.test(helperURL),'Invalid helper URL');
    insist(hash(fs.readFileSync(path.resolve(path.dirname(afterFile),helperURL)))===context.helperHash,'Rendered helper bytes differ from installed source');
    const scripts=[...B.doc.scripts];
    for(const consumer of scripts.filter(e=>e.textContent.includes('CTMAssets.url('))){
      insist(scripts.indexOf(config)<scripts.indexOf(consumer)&&scripts.indexOf(helper)<scripts.indexOf(consumer),'Asset registration follows consumer');
    }
    const ca=configScripts(A.doc),ha=helperScripts(A.doc);
    if(ca.length||ha.length){
      insist(ca.length===1&&ha.length===1&&same(attrs(ha[0],'src'),attrs(helper,'src')),'Existing asset registration changed');
      if(ca[0].outerHTML!==config.outerHTML){
        const old=/^globalThis\.CTM_ASSETS=(\{[\s\S]*\});$/.exec(ca[0].textContent.trim());
        const previous=old&&JSON.parse(old[1]),expected=structuredClone(context.config);
        const prior=previous?.bases?.jsxgraph;
        insist(/^https:\/\/cdn\.jsdelivr\.net\/gh\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}\/$/.test(expected.bases.jsxgraph||'') &&
          ['https://cdn.jsdelivr.net/npm/jsxgraph@1/','https://cdn.jsdelivr.net/npm/jsxgraph@1.14.1/'].includes(prior),
          'Existing asset registration changed beyond the pinned Git runtime');
        expected.bases.jsxgraph=prior;
        insist(ca[0].parentElement===A.doc.head && ca[0].attributes.length===0 &&
          old[1]===JSON.stringify(sorted(expected)), 'Existing asset registration changed beyond the JSXGraph base');
        const kind=B.inline.find(i=>i.code===config.textContent.trim())?.kind;
        for(const item of items)if(item.area==='inline'&&item.change==='changed'&&item.what===kind)item.assets='jsxgraph-git-configuration';
      }
      insist(normalize(raw(ha[0]))===normalize(helperURL)&&!/[?#\\]/.test(raw(ha[0])),'Existing helper URL changed');
      insist(hash(fs.readFileSync(path.resolve(path.dirname(beforeFile),raw(ha[0]))))===context.helperHash,'Existing helper bytes differ');
      const beforeResources=resources(A.doc),afterResources=resources(B.doc);
      const managed=e=>e===ha[0]||Object.values(context.config.bases).some(base=>raw(e).startsWith(base));
      const pairs=[];
      for(const a of beforeResources.filter(managed)){
        const match=afterResources.filter(b=>normalize(raw(b))===normalize(raw(a)));
        insist(match.length===1&&raw(match[0])===raw(a)&&same(attrs(a,a.tagName==='LINK'?'href':'src'),attrs(match[0],match[0].tagName==='LINK'?'href':'src')),'Existing managed resource changed');
        pairs.push([a,match[0]]);
      }
      for(const [a,b]of pairs)for(const x of beforeResources){
        const match=afterResources.filter(y=>raw(y)===raw(x));
        if(match.length===1)insist((beforeResources.indexOf(a)<beforeResources.indexOf(x))===(afterResources.indexOf(b)<afterResources.indexOf(match[0]))||
          (a===ha[0]&&stackHelperMove(A.doc,B.doc)&&/^ai-feedback\//.test(normalize(raw(x)))),'Existing asset order changed');
      }
      return;
    }
    const ra=resources(A.doc),rb=resources(B.doc), eligible=new Set(),pairs=[];
    const pair=(oldURL,newURL,required=false)=>{
      const old=ra.filter(e=>raw(e)===oldURL),fresh=rb.filter(e=>raw(e)===newURL);
      if(!old.length&&!fresh.length&&!required)return;
      insist(old.length===1&&fresh.length===1&&ra.filter(e=>normalize(raw(e))===normalize(oldURL)).length===1&&rb.filter(e=>normalize(raw(e))===normalize(newURL)).length===1,'Missing or duplicate asset pair: '+oldURL);
      insist(old[0].tagName===fresh[0].tagName&&same(attrs(old[0],old[0].tagName==='LINK'?'href':'src'),attrs(fresh[0],fresh[0].tagName==='LINK'?'href':'src')),'Asset attributes changed');
      // A migrated resource keeps its position relative to every retained resource.
      for(const e of ra){
        if(e===old[0])continue;
        const retained=rb.filter(x=>raw(x)===raw(e)&&x.tagName===e.tagName);
        const occurrences=ra.filter(x=>raw(x)===raw(e)&&x.tagName===e.tagName);
        if(retained.length===occurrences.length)insist((ra.indexOf(e)<ra.indexOf(old[0]))===(rb.indexOf(retained[occurrences.indexOf(e)])<rb.indexOf(fresh[0])),'Asset resource order changed');
      }
      pairs.push([old[0],fresh[0]]);
      eligible.add((old[0].tagName==='LINK'?'css ':'script ')+normalize(oldURL));
      eligible.add((fresh[0].tagName==='LINK'?'css ':'script ')+normalize(newURL));
    };
    const monaco=context.table.assets['monaco-editor'];
    insist(/\.0$/.test(monaco.version),'Unsupported historical Monaco selector');
    const oldBase=monaco.cdn.replaceAll('{version}',monaco.version.slice(0,-2)),newBase=context.config.bases['monaco-editor'];
    const initA=A.doc.querySelectorAll('#qpyodide-monaco-editor-init'),initB=B.doc.querySelectorAll('#qpyodide-monaco-editor-init');
    const monacoPresent=ra.some(e=>raw(e)===oldBase+'min/vs/loader.js')||initA.length||initB.length;
    if(monacoPresent){
      pair(oldBase+'min/vs/editor/editor.main.css',newBase+'min/vs/editor/editor.main.css',true);
      pair(oldBase+'min/vs/loader.js',newBase+'min/vs/loader.js',true);
      insist(initA.length===1&&initB.length===1&&same(attrs(initA[0]),attrs(initB[0])),'Monaco initializer identity changed');
      insist(monacoCode(initA[0].textContent,'[\'"]'+escape(oldBase+'min/vs')+'[\'"]')&&monacoCode(initB[0].textContent,"CTMAssets\\.url\\('monaco-editor', 'min/vs'\\)"),'Monaco initializer program changed');
      const all=[...B.doc.querySelectorAll('script')];
      insist(all.indexOf(helper)<all.indexOf(initB[0])&&all.indexOf(config)<all.indexOf(initB[0]),'Asset registration follows its consumer');
    }
    const fa=context.table.assets['font-awesome'];
    pair('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/'+fa.version+'/js/all.min.js',context.config.bases['font-awesome']+'js/all.min.js');
    const poly='https://cdnjs.cloudflare.com/polyfill/v3/polyfill.min.js?features=es6';
    const oldPoly=ra.filter(e=>raw(e)===poly);
    if(oldPoly.length){
      const ma=mathJaxScripts(A.doc),mb=mathJaxScripts(B.doc);
      insist(oldPoly.length===1&&ra.filter(e=>normalize(raw(e))===normalize(poly)).length===1&&!rb.some(e=>normalize(raw(e))===normalize(poly))&&oldPoly[0].attributes.length===1,'Unexpected legacy polyfill change');
      insist(ma.length===mb.length&&ma.length<=1&&(!ma.length||ma[0].outerHTML===mb[0].outerHTML),'Actual MathJax loader changed: '+JSON.stringify({before:[...ma].map(e=>e.outerHTML),after:[...mb].map(e=>e.outerHTML)}));
      eligible.add('script '+normalize(poly));
    }
    for(const [a,b] of pairs)for(const [x,y] of pairs)insist((ra.indexOf(a)<ra.indexOf(x))===(rb.indexOf(b)<rb.indexOf(y)),'Migrated resource order changed');
    eligible.add('script ctm-assets/assets.js');
    const configKind=B.inline.find(i=>i.code===config.textContent.trim())?.kind;
    const initKind=monacoPresent?A.inline.find(i=>i.code===initA[0].textContent.trim())?.kind:null;
    if(monacoPresent)insist(A.inline.filter(i=>i.kind===initKind).length===1&&B.inline.filter(i=>i.kind===initKind).length===1,'Ambiguous Monaco inline kind');
    for(const item of items){
      if(item.area==='file'&&eligible.has(item.what))item.assets='resource';
      if(item.area==='inline'&&item.change==='added'&&item.what===configKind)item.assets='configuration';
      if(item.area==='inline'&&item.change==='changed'&&item.what===initKind)item.assets='monaco';
    }
  }catch(error){fail(error.message);}
}

// P13 explains only new canonical worker delivery and inert defaults. Every
// authored cell, grade setting, resource attribute and other value is retained.
function markP13Changes(A,B,items,context){
 if(!context?.p13)return;
 for(const item of items){
  if(item.area==='file'&&item.change==='added'&&item.what.startsWith('script ')){
   const url=item.what.slice(7),key=url.replace(/^(?:\.\.\/|\.\/)+/,'');
   const wanted=context.p13[key];if(!wanted)continue;
   const tags=[...B.doc.scripts].filter(e=>normalize(e.getAttribute('src')||'')===url);
   if(tags.length!==1||attrs(tags[0],'src').length||/[?#]/.test(tags[0].getAttribute('src')))continue;
   const source=B.sources[url];
   if(source&&fs.existsSync(source)&&hash(fs.readFileSync(source))===wanted)item.assets='p13-worker-delivery';
  }
  if(item.area==='config'&&item.change==='changed'&&item.object==='qpyodideSettings'&&item.before===undefined&&
     ((item.path==='/0/qpyodideExamOutput'&&item.after===false)||
      (item.path==='/0/qpyodideStopAfter'&&item.after===20)))item.assets='p13-inert-defaults';
 }
}

// Only the three default resource URLs may differ inside a generated board.
// Full decoded bytes (after the comparator's existing UUID/space normalization)
// must otherwise agree, including every authored board statement and element.
function markBoardChanges(A,items,context,page){
  const {JSDOM}=require('jsdom');
  for(const item of items){
    if(item.area!=='dom'||item.change!=='attribute changed'||item.tag!=='iframe'||item.attribute!=='src'||
       !String(item.before).startsWith('data:text/html;decoded,'))continue;
    try{
      insist(context,'Canonical installed board sources are required');
      const prefix='data:text/html;decoded,';
      insist(String(item.after).startsWith(prefix),'Board delivery encoding changed');
      let before=item.before.slice(prefix.length),after=item.after.slice(prefix.length);
      const original=before,evidence=[];
      const a=new JSDOM(before).window.document,b=new JSDOM(after).window.document;
      let changed=0;
      for(const [key,kind]of [['src_jxg','script'],['src_mjx','math'],['src_css','style']]){
        const target=context.board[key];
        const match=/^(https:\/\/cdn\.jsdelivr\.net\/npm\/(?:@[^/]+\/)?[^/@]+@)(\d+)\.\d+\.\d+(\/[^?#]+)$/.exec(target||'');
        const git=/^https:\/\/cdn\.jsdelivr\.net\/gh\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}\/_extensions\/jsxgraph\/resources\/(?:js\/jsxgraphcore\.js|css\/jsxgraph\.css)$/.test(target||'');
        insist(match||git,'Board target is not an exact canonical release or Git artifact');
        const candidates=match?[match[1]+match[2]+match[3],target]:
          ['1','1.14.1'].map(v=>'https://cdn.jsdelivr.net/npm/jsxgraph@'+v+'/distrib/'+(kind==='style'?'jsxgraph.css':'jsxgraphcore.js')).concat(target);
        const url=e=>kind==='style'?/^@import url\("([^"\n]+)"\);$/.exec(e.textContent.trim())?.[1]:e.getAttribute('src');
        const old=[...a.querySelectorAll(kind==='style'?'head > style':'head > script[src]')].filter(e=>candidates.includes(url(e)));
        const historical=old.length===1?url(old[0]):null;
        const fresh=kind==='style'?[...b.querySelectorAll('head > style')].filter(e=>e.textContent.trim()==='@import url("'+target+'");'):
          [...b.querySelectorAll('head > script[src]')].filter(e=>e.getAttribute('src')===target);
        insist(old.length===1&&fresh.length===1,'Board default resource pair missing or duplicated');
        if(kind==='math')insist(old[0].id==='MathJax-script'&&fresh[0].id==='MathJax-script','Board MathJax identity changed');
        insist(same(attrs(old[0],kind==='style'?undefined:'src'),attrs(fresh[0],kind==='style'?undefined:'src')),'Board resource attributes changed');
        insist(before.split(historical).length===2&&after.split(target).length===2,'Ambiguous embedded resource URL');
        evidence.push({historical,target,beforeCount:before.split(historical).length-1,afterCount:after.split(target).length-1});
        before=before.replace(historical,target);changed++;
      }
      if(context.renderer){
        const proof=proveRendererPair(item,context.renderer,A.doc,evidence);
        console.error('Canonical JSXGraph renderer evidence: '+JSON.stringify({page,element:item.element,...proof,resources:evidence}));
        item.assets='jsxgraph-renderer-1.2';
        continue;
      }
      insist(changed===3&&before===after,'Embedded board changed beyond canonical resource pins');
      console.error('Canonical board URL evidence: '+JSON.stringify({page,element:item.element,beforeLength:original.length,afterLength:after.length,beforeSha256:hash(original),afterSha256:hash(after),resources:evidence,exactAfterThreeSubstitutions:before===after}));
      item.assets='board-defaults';
    }catch(error){
      items.push({page,area:'assets',change:'invalid',what:error.message,invariant:true});
    }
  }
}

// Keep queries and attributes that the general render-noise URL normalization
// does not expose. A canonical asset migration never excuses another loader.
function checkRetainedResources(A,B,items,page,context){
 const a=A.doc,b=B.doc;
 const before=resources(a),after=resources(b);
 const url=e=>{const u=raw(e),q=u.indexOf('?');return normalize(u)+(q<0?'':u.slice(q));};
 const key=e=>e.tagName+'\0'+normalize(raw(e));
 const groups=list=>{
   const result=new Map();
   for(const e of list){const k=key(e);if(!result.has(k))result.set(k,[]);result.get(k).push(e);}
   return result;
 };
 const oldGroups=groups(before),newGroups=groups(after);
 const retained=new Set([...oldGroups.keys()].filter(k=>newGroups.has(k)));
 const oldOrder=before.map(key).filter(k=>retained.has(k)),newOrder=after.map(key).filter(k=>retained.has(k));
 const worker='SCRIPT\0ctm-worker/pyodide-worker.js',runtime='SCRIPT\0ctm-runtime/pyodide-runtime.js';
 const i=oldOrder.indexOf(worker),j=newOrder.indexOf(worker),source=B.sources['ctm-worker/pyodide-worker.js'];
 const crossed=new Set(['SCRIPT\0ctm-checkers/ctm-checkers.js','SCRIPT\0ctm-locale-math-exercise/math-exercise.js',
   'LINK\0ctm-matrix-input/ctm-matrix-input.css','LINK\0math-exercise/math-exercise.css','SCRIPT\0ctm-variants/variants.js',
   'SCRIPT\0ctm-copy/ctm-copy.js','SCRIPT\0ctm-store/ctm-store.js','SCRIPT\0ctm-locale-py-exercise/py-exercise.js',
   'LINK\0py-exercise/py-exercise.css']);
 const workerMove=context?.p13&&newOrder.indexOf(runtime)>=0&&
   oldOrder.filter(k=>k===runtime).length===1&&newOrder.filter(k=>k===runtime).length===1&&
   oldOrder.filter(k=>k===worker).length===1&&newOrder.filter(k=>k===worker).length===1&&
   i>j&&j===newOrder.indexOf(runtime)+1&&
   oldOrder[i+1]==='SCRIPT\0ctm-locale-pyodide-interaktiv/pyodide-interaktiv.js'&&
   same(oldOrder.filter(k=>k!==worker),newOrder.filter(k=>k!==worker))&&
   oldOrder.slice(j,i).every(k=>crossed.has(k))&&source&&fs.existsSync(source)&&
   hash(fs.readFileSync(source))===context.p13['ctm-worker/pyodide-worker.js'];
 if(workerMove)items.push({page,area:'assets',change:'changed',what:'Page worker precedes checker consumers',assets:'p13-worker-order'});
 if(!same(oldOrder,newOrder)&&!stackHelperMove(a,b)&&!workerMove){
   const identity=e=>({key:key(e),url:raw(e),attributes:attrs(e,e.tagName==='LINK'?'href':'src')});
   const evidence={page,before:before.filter(e=>retained.has(key(e))).map(identity),after:after.filter(e=>retained.has(key(e))).map(identity)};
   console.error('Retained resource order evidence: '+JSON.stringify(evidence));
   items.push({page,area:'assets',change:'invalid',what:'Retained resource order changed',before:evidence.before,after:evidence.after,invariant:true});
 }
 for(const [k,old]of oldGroups){
   const fresh=newGroups.get(k);
   if(!fresh)continue; // Removed resource rows remain ordinary differences.
   const identity=e=>[url(e),attrs(e,e.tagName==='LINK'?'href':'src')];
   if(!same(old.map(identity),fresh.map(identity)))
     items.push({page,area:'assets',change:'invalid',what:'Retained resource URL/attributes/multiplicity/order changed: '+normalize(raw(old[0])),invariant:true});
 }
}

// The historical worker always scheduled background preloads. The new option
// defaults to true; only making that existing behavior explicit is equivalent.
function markPreloadDefault(A,B,items,context){
 if(!context)return;
 const a=A.configs.qpyodideSettings,b=B.configs.qpyodideSettings;
 if(a?.length!==1||b?.length!==1)return;
 const old=a[0],fresh=b[0];
 if(!old||!fresh||Array.isArray(old)||Array.isArray(fresh)||Object.hasOwn(old,'qpyodidePreloadPackages')||fresh.qpyodidePreloadPackages!==true)return;
 const rest={...fresh};delete rest.qpyodidePreloadPackages;
 // Step 3 separately classifies the missing feedback UI language becoming
 // the unchanged document language. Keep that row subject to its own rule.
 const priorFeedback=old.qpyodideFeedbackOptions,nextFeedback=rest.qpyodideFeedbackOptions;
 if(priorFeedback&&nextFeedback&&!Array.isArray(priorFeedback)&&!Array.isArray(nextFeedback)&&
    !Object.hasOwn(priorFeedback,'uiLanguage')&&typeof old.qpyodideLang==='string'&&
    old.qpyodideLang===fresh.qpyodideLang&&nextFeedback.uiLanguage===fresh.qpyodideLang){
   rest.qpyodideFeedbackOptions={...nextFeedback};
   delete rest.qpyodideFeedbackOptions.uiLanguage;
 }
 if(!same(sorted(old),sorted(rest)))return;
 for(const item of items)if(item.area==='config'&&item.change==='changed'&&item.object==='qpyodideSettings'&&item.path==='/0/qpyodidePreloadPackages'&&item.before===undefined&&item.after===true)item.assets='preload-default';
}
