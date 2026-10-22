// Diagnostic controls only; counterfactuals never establish product acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as playwright from 'playwright';
import {serve} from '../../tools/compare-browser.mjs';

const output=path.resolve(process.env.CTM_RESIZE_REPORT || '.resize-probe');
const stock=path.resolve(process.env.CTM_RESIZE_STOCK || '.resize-stock/_site');
const fixture=path.resolve(process.env.CTM_RESIZE_FIXTURE || '.resize-fixture/before/_site');
const engine=process.env.CTM_BROWSER || 'webkit';
assert.ok(['chromium','firefox','webkit'].includes(engine));
fs.mkdirSync(output,{recursive:true});
const block=[
'  if (window.ResizeObserver) {',
'    const resizeObserver = new window.ResizeObserver(',
'      throttle(() => {',
'        layoutMarginEls();',
'        if (',
'          window.document.body.getBoundingClientRect().width < 990 &&',
'          isReaderMode()',
'        ) {',
'          quartoToggleReader();',
'        }',
'      }, 50)',
'    );',
'    resizeObserver.observe(window.document.body);',
'  }'
].join('\n');
function sourceControl(source,mode) {
  assert.equal(source.split(block).length,2,'exact Quarto 1.8.27 BODY observer block occurs once');
  if(mode==='native')return source;
  if(mode==='no-body-observer')return source.replace(block,'  // Diagnostic negative: this BODY observer is absent.');
  assert.equal(mode,'entry-width');
  return source.replace(block,block.replace('throttle(() => {','throttle((entries) => {')
    .replace('window.document.body.getBoundingClientRect().width','entries[0].contentRect.width'));
}
const source=fs.readFileSync(path.join(stock,'site_libs/quarto-html/quarto.js'),'utf8');
for(const mode of ['native','entry-width','no-body-observer'])sourceControl(source,mode);
const sourceSha256=createHash('sha256').update(source).digest('hex');

function traceNativeObservers() {
  const trace=window.__resizeProbe={created:[],callbacks:[],errors:[]};
  const NativeResizeObserver=window.ResizeObserver;
  let next=0;
  window.ResizeObserver=new Proxy(NativeResizeObserver,{construct(constructor,args,newTarget) {
    const id=next++;
    if(trace.created.length<16)trace.created.push({id,stack:String(new Error().stack||'').slice(0,1000)});
    const callback=args[0];
    if(typeof callback!=='function')return Reflect.construct(constructor,args,newTarget);
    return Reflect.construct(constructor,[function(entries,observer) {
      if(trace.callbacks.length<64)trace.callbacks.push({id,time:performance.now(),readyState:document.readyState,
        entries:[...entries].slice(0,4).map(entry=>({tag:entry.target.tagName,id:entry.target.id,
          rect:{width:entry.contentRect.width,height:entry.contentRect.height}}))});
      return Reflect.apply(callback,this,arguments);
    },...args.slice(1)],newTarget);
  }});
  addEventListener('error',event=>{
    if(trace.errors.length<32)trace.errors.push({message:event.message,time:performance.now(),readyState:document.readyState});
  });
}
const plain=path.join(output,'plain');fs.mkdirSync(plain,{recursive:true});
for(const mode of ['read','no-read']) {
  const expression=mode==='read'?'document.body.getBoundingClientRect().width;':'void entries[0].contentRect.width;';
  fs.writeFileSync(path.join(plain,mode+'.html'),[
    '<!doctype html><html><head><meta charset="utf-8"><title>Plain '+mode+'</title></head>',
    '<body><main style="height:1200px">Plain '+mode+' native observer control</main><script>',
    "addEventListener('DOMContentLoaded',()=>{",
    '  new ResizeObserver(entries=>{'+expression+'}).observe(document.body);',
    '});',
    '</script></body></html>'
  ].join('\n'));
}
const server=await serve({stock,fixture,plain},true);
const base='http://127.0.0.1:'+server.address().port;
const report={browser:engine,quartoVersion:'1.8.27',sourceSha256,
  headers:{coop:'same-origin',coep:'credentialless'},samples:[]};
let browser;
try {
  browser=await playwright[engine].launch({headless:true});
  const cases=[
    {label:'stock-quarto-native',root:'stock',mode:'native',repeats:8},
    {label:'stock-quarto-native-routed',root:'stock',mode:'native',route:true,repeats:8},
    {label:'stock-quarto-entry-width',root:'stock',mode:'entry-width',repeats:8},
    {label:'stock-quarto-no-body-observer',root:'stock',mode:'no-body-observer',repeats:8},
    {label:'plain-native-read',root:'plain',file:'read.html',repeats:8},
    {label:'plain-native-no-read',root:'plain',file:'no-read.html',repeats:8},
    {label:'actual-store-positive-control',root:'fixture',mode:'native',repeats:4,navigations:3}
  ];
  for(const control of cases)for(let sample=0;sample<control.repeats;sample++) {
    const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
    await ctx.addInitScript(traceNativeObservers);
    let substitutions=0;
    const routed=control.root==='stock' && (control.route || control.mode!=='native');
    if(routed)await ctx.route('**/site_libs/quarto-html/quarto.js',async route=>{
      const response=await route.fetch();
      const incoming=await response.text();
      assert.equal(incoming,source,'counterfactual uses the exact stock source bytes');
      substitutions++;
      await route.fulfill({response,body:sourceControl(incoming,control.mode)});
    });
    const page=await ctx.newPage();
    page.setDefaultTimeout(90000);
    for(let navigation=0;navigation<(control.navigations||1);navigation++) {
      const errors=[],failedRequests=[];
      const onError=error=>errors.push({message:error.message,stack:error.stack});
      const onFailure=request=>failedRequests.push({url:request.url(),failure:request.failure()});
      page.on('pageerror',onError);page.on('requestfailed',onFailure);
      const response=await page.goto(base+'/'+control.root+'/'+(control.file||'index.html'),{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200);
      assert.equal(response.headers()['cross-origin-opener-policy'],'same-origin');
      assert.equal(response.headers()['cross-origin-embedder-policy'],'credentialless');
      if(control.root==='fixture')await page.locator('.ctm-save-bar').waitFor({state:'visible'});
      await page.waitForLoadState('load');
      await page.waitForTimeout(1000);
      const snapshot=await page.evaluate(()=>({trace:window.__resizeProbe,readyState:document.readyState,
        isolated:crossOriginIsolated,
        body:window.__resizeProbe.callbacks.flatMap(callback=>callback.entries).filter(entry=>entry.tag==='BODY').at(-1)?.rect,
        controlHeight:document.getElementById('height-control')?.style.height,
        viewport:{width:innerWidth,height:innerHeight},
        marginCount:document.querySelectorAll('.column-margin.column-container > *, .margin-caption, .aside').length,
        ctmNodes:document.querySelectorAll('[data-ctm-component]').length,
        quarto:document.querySelector('meta[name="generator"]')?.content,
        scripts:[...document.scripts].map(s=>s.src).filter(Boolean)}));
      await page.waitForTimeout(100);
      if(control.mode==='no-body-observer')assert.equal(snapshot.controlHeight,'1200px');
      else assert.ok(snapshot.body?.height>900,'native BODY entries retain a page taller than the viewport');
      assert.deepEqual(snapshot.viewport,{width:1280,height:900});
      if(control.root==='stock') {
        assert.equal(snapshot.quarto,'quarto-1.8.27');assert.equal(snapshot.ctmNodes,0);assert.equal(snapshot.marginCount,0);
        assert.ok(!snapshot.scripts.some(s=>/quarto-contrib|ctm-|py-exercise|qpyodide/.test(s)));
        assert.ok(snapshot.scripts.some(s=>/bootstrap.min.js$/.test(s)));
      }
      if(control.mode==='no-body-observer')assert.ok(!snapshot.trace.callbacks.some(c=>c.entries.some(e=>e.tag==='BODY')));
      else assert.ok(snapshot.trace.callbacks.some(c=>c.entries.some(e=>e.tag==='BODY')),'native BODY observation delivered');
      report.samples.push({label:control.label,sample,navigation,errors,failedRequests,...snapshot});
      console.log(JSON.stringify({label:control.label,sample,navigation,errors,failedRequests,
        callbackCount:snapshot.trace.callbacks.length,body:snapshot.body,isolated:snapshot.isolated,marginCount:snapshot.marginCount}));
      page.off('pageerror',onError);page.off('requestfailed',onFailure);
    }
    if(routed)assert.equal(substitutions,control.navigations||1);
    await ctx.close();
  }
  report.summary=[...new Set(report.samples.map(s=>s.label))].map(label=>{
    const samples=report.samples.filter(s=>s.label===label);
    return {label,navigations:samples.length,errorNavigations:samples.filter(s=>s.errors.length).length,
      errors:samples.flatMap(s=>s.errors).length,requestFailures:samples.flatMap(s=>s.failedRequests).length};
  });
  console.log(JSON.stringify({diagnosticSummary:report.summary},null,2));
  assert.ok(report.samples.some(s=>s.label==='actual-store-positive-control' && s.errors.length),
    'positive control must reproduce raw errors; otherwise stock negatives cannot establish causality');
} finally {
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
