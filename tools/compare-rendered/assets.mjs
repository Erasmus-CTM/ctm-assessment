// Bounded CDN migration eligibility. HTML is never its own source of truth.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), yaml=require('js-yaml');
const hash=b=>createHash('sha256').update(b).digest('hex');
const insist=(ok,message)=>{if(!ok)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(sorted):Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])]))):x;
const attrs=(el,except)=>[...el.attributes].filter(a=>a.name!==except).map(a=>[a.name,a.value]).sort();
const raw=el=>el.getAttribute(el.tagName==='LINK'?'href':'src');
const resources=doc=>[...doc.querySelectorAll('script[src],link[rel="stylesheet"]')];
const normalize=u=>u.split('?')[0].replace(/(?:^|.*\/)(?:site_libs\/|[^/]*_files\/libs\/)/,'').replace(/quarto-contrib\/([\w-]+?)-\d+\.\d+\.\d+[^/]*\//,'$1/');
const monacoCode=(s,expression)=>new RegExp('^// Configure the Monaco Editor\'s loader\\s+require\\.config\\(\\{\\s*paths\\s*:\\s*\\{\\s*[\'"]vs[\'"]\\s*:\\s*'+expression+'\\s*\\}\\s*\\}\\);$').test(s.trim());
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function loadAssetSources(project,pinsFile) {
  insist(Boolean(project)===Boolean(pinsFile),'--asset-sources and --asset-pins must be supplied together');
  if(!project)return null;
  const pins=JSON.parse(fs.readFileSync(pinsFile,'utf8'));
  const candidates=['resolved-repos.json','_extensions/ctm-assessment/resolved-repos.json'].map(p=>path.join(project,p)).filter(p=>fs.existsSync(p));
  insist(candidates.length,'Missing installed source record');
  const records=candidates.map(p=>JSON.parse(fs.readFileSync(p,'utf8')));
  insist(records.every(r=>same(sorted(r),sorted(records[0]))),'Conflicting installed source records');
  const record=records[0];
  for(const name of ['ctm-libs','pyodide-interaktiv']) {
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
    const match=/^(https:\/\/cdn\.jsdelivr\.net\/npm\/(?:@[^/]+\/)?[^/@]+@[^/]+\/)/.exec(board[key]);
    insist(match,'Malformed canonical board URL');
    insist(!bases[name]||bases[name]===match[1],'Conflicting canonical board bases');
    bases[name]=match[1];
  }
  const template=read('pyodide-interaktiv','qpyodide-monaco-editor-init.html').toString('utf8');
  const body=/<script type="module" id="qpyodide-monaco-editor-init">([\s\S]*?)<\/script>/.exec(template);
  insist(body&&monacoCode(body[1],"CTMAssets\\.url\\('monaco-editor', 'min/vs'\\)"),'Unexpected canonical Monaco initializer');
  return {config:{v:1,mode:'cdn',bases},helperHash:hash(helper),table};
}
export function markAssetChanges(A,B,items,context,page,afterFile,beforeFile) {
  const configScripts=doc=>[...doc.querySelectorAll('script:not([src])')].filter(s=>s.textContent.includes('CTM_ASSETS'));
  const helperScripts=doc=>resources(doc).filter(e=>normalize(raw(e))==='ctm-assets/assets.js');
  const active=configScripts(A.doc).length||configScripts(B.doc).length||helperScripts(A.doc).length||helperScripts(B.doc).length;
  if(!active&&!context)return;
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
      insist(ca.length===1&&ha.length===1&&ca[0].outerHTML===config.outerHTML&&same(attrs(ha[0],'src'),attrs(helper,'src')),'Existing asset registration changed');
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
        if(match.length===1)insist((beforeResources.indexOf(a)<beforeResources.indexOf(x))===(afterResources.indexOf(b)<afterResources.indexOf(match[0])),'Existing asset order changed');
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
        if(retained.length===1)insist((ra.indexOf(e)<ra.indexOf(old[0]))===(rb.indexOf(retained[0])<rb.indexOf(fresh[0])),'Asset resource order changed');
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
      const ma=A.doc.querySelectorAll('script#MathJax-script'),mb=B.doc.querySelectorAll('script#MathJax-script');
      insist(oldPoly.length===1&&!rb.some(e=>raw(e)===poly)&&oldPoly[0].attributes.length===1,'Unexpected legacy polyfill change');
      insist(ma.length===1&&mb.length===1&&ma[0].outerHTML===mb[0].outerHTML,'Actual MathJax loader changed');
      eligible.add('script '+normalize(poly));
    }
    for(const [a,b] of pairs)for(const [x,y] of pairs)insist((ra.indexOf(a)<ra.indexOf(x))===(rb.indexOf(b)<rb.indexOf(y)),'Migrated resource order changed');
    eligible.add('script ctm-assets/assets.js');
    const configKind=B.inline.find(i=>i.code===config.textContent.trim())?.kind;
    const initKind=monacoPresent?A.inline.find(i=>i.code===initA[0].textContent.trim())?.kind:null;
    for(const item of items){
      if(item.area==='file'&&eligible.has(item.what))item.assets='resource';
      if(item.area==='inline'&&item.change==='added'&&item.what===configKind)item.assets='configuration';
      if(item.area==='inline'&&item.change==='changed'&&item.what===initKind)item.assets='monaco';
    }
  }catch(error){fail(error.message);}
}
