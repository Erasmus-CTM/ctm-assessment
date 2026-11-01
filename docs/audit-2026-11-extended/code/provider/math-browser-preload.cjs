// Audit-only local transport for exact npm/CDN assets. No browser TLS bypass.
// Core runtime remains npm Pyodide0.28.3; wheels match its unmodified lock.
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
const original=Module._load,patched=new WeakSet(),contexts=new WeakSet();
const npmRoot=process.env.CTM_AUDIT_NPM_ASSETS||'/tmp/ctm-audit-browser-assets';
const pyRoot=process.env.CTM_AUDIT_PYODIDE_CORE||'/workspace/ctm-assessment/node_modules/pyodide';
const wheels=process.env.PYODIDE_PACKAGES||'/workspace/audit-assets/pyodide-packages';
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.whl':'application/octet-stream','.zip':'application/zip','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.svg':'image/svg+xml'};
function localFile(raw){
 const url=new URL(raw);if(url.hostname!=='cdn.jsdelivr.net')return null;
 let p=decodeURIComponent(url.pathname),file;
 if(p.startsWith('/pyodide/v0.28.3/full/')){
  const name=p.slice('/pyodide/v0.28.3/full/'.length);if(name.includes('..'))return null;
  file=path.join(pyRoot,name);if(!fs.existsSync(file))file=path.join(wheels,name);
 }else if(p.startsWith('/npm/')){
  p=p.slice(5);const match=p.match(/^((?:@[^/]+\/)?[^/@]+)@([^/]+)\/(.*)$/);if(!match)return null;
  let [,name,version,rest]=match;if(name==='mathjax'&&version==='3')version='3.2.2';if(name==='mathjax'&&version==='4')version='4.1.3';if(name==='@mathjax/mathjax-newcm-font'&&version==='4')version='4.1.3';if(name==='katex'&&version==='0.16')version='0.16.47';
  if(rest.includes('..'))return null;file=path.join(npmRoot,name+'@'+version,rest);
 }
 return file&&fs.existsSync(file)&&fs.statSync(file).isFile()?file:null;
}
async function install(context){
 if(contexts.has(context))return;contexts.add(context);
 await context.route('https://cdn.jsdelivr.net/**',async route=>{
  const file=localFile(route.request().url());if(!file){console.error('AUDIT_LOCAL_MISSING '+route.request().url());return route.continue();}
  return route.fulfill({status:200,body:fs.readFileSync(file),headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin'}});
 });
}
function patchType(type){
 if(!type||patched.has(type))return;patched.add(type);const launch=type.launch.bind(type);
 type.launch=async function(...args){
  const browser=await launch(...args),nc=browser.newContext.bind(browser),np=browser.newPage.bind(browser);
  browser.newContext=async(...a)=>{const context=await nc(...a);await install(context);return context;};
  browser.newPage=async(...a)=>{const page=await np(...a);await install(page.context());return page;};
  return browser;
 };
}
Module._load=function(request,parent,isMain){const value=original.apply(this,arguments);if(request==='playwright'||request==='playwright-core'){patchType(value.chromium);patchType(value.firefox);patchType(value.webkit);}return value;};

module.exports={install,localFile,patchType};
