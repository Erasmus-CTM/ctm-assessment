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

const mathSource=fs.readFileSync(path.join(fixture,'site_libs/quarto-contrib/math-exercise-0.11.0/math-exercise.js'),'utf8');
const mathSourceBlob=createHash('sha1').update('blob '+Buffer.byteLength(mathSource)+'\0').update(mathSource).digest('hex');
assert.equal(mathSourceBlob,'84ecea4405576614c22f87adb10b4aefe719e453','actual fixture uses the exact reviewed math module');
const mathSetupBlock='    if (!cells.length) return;\n    cells.forEach(setupCell);';
function mathControl(incoming,mode) {
  assert.equal(incoming,mathSource,'timing intervention uses the exact original math module');
  assert.equal(incoming.split(mathSetupBlock).length,2,'interactive setup boundary is unique');
  assert.ok(['native','frame'].includes(mode));
  const replacement=[
    '    if (!cells.length) return;',
    "    window.__mathSetupProbe={phase:'before-setup',started:performance.now(),visible:document.visibilityState,",
    "      katexReady:katexReady,katexFunctions:typeof katexLib.renderToString==='function',cells:cells.length};",
    ...(mode==='frame'?[
      "    if(document.visibilityState!=='visible')throw new Error('Visible-fixture timing counterfactual only');",
      '    await new Promise(resolve=>requestAnimationFrame(resolve));'
    ]:[]),
    '    cells.forEach(setupCell);',
    "    var katexProbe=document.createElement('span');katexProbe.textContent='$x^2$';",
    '    renderMathInQuestion(katexProbe);',
    "    window.__mathSetupProbe={...window.__mathSetupProbe,phase:'setup-complete-before-preload',completed:performance.now(),",
    "      katexRendered:!!katexProbe.querySelector('.katex'),",
    "      inputCount:document.querySelectorAll('input.math-input').length,",
    "      adapterNotes:[...cells].filter(cell=>cell.querySelector(':scope > .math-saved-answer')).length,",
    "      adapterResults:[...cells].filter(cell=>cell.querySelector(':scope > .math-saved-result')).length};"
  ].join('\n');
  return incoming.replace(mathSetupBlock,()=>replacement);
}

const fixtureHtml=fs.readFileSync(path.join(fixture,'index.html'),'utf8');
// Exact CTM plus enhancement startup dependency set. Inline settings/manifest data stay.
// Font Awesome/Monaco dynamic style/icon creation is intentionally part of the omitted group.
const startupPaths=[
  "site_libs/quarto-contrib/ctm-assets-0.9.0/assets.js",
  "site_libs/quarto-contrib/ctm-reveal-0.9.0/ctm-reveal.js",
  "site_libs/quarto-contrib/ctm-nav-0.9.0/ctm-nav.js",
  "site_libs/quarto-contrib/ai-feedback-0.9.0/feedback-core.js",
  "site_libs/quarto-contrib/ai-feedback-0.9.0/feedback-dom.js",
  "site_libs/quarto-contrib/ai-feedback-0.9.0/ai-feedback.js",
  "site_libs/quarto-contrib/ctm-runtime-0.9.0/pyodide-runtime.js",
  "site_libs/quarto-contrib/ctm-checkers-0.6.1.dev0+9ebf60db/ctm-checkers.js",
  "site_libs/quarto-contrib/ctm-locale-0.9.0/ctm-locale.js",
  "site_libs/quarto-contrib/ctm-locale-0.9.0/common.js",
  "site_libs/quarto-contrib/ctm-locale-math-exercise-0.9.0/math-exercise.js",
  "site_libs/quarto-contrib/ctm-locale-ui-0.9.0/ui.js",
  "site_libs/quarto-contrib/ctm-copy-0.9.0/ctm-copy.js",
  "site_libs/quarto-contrib/ctm-store-0.9.0/ctm-store.js",
  "site_libs/quarto-contrib/ctm-locale-py-exercise-0.9.0/py-exercise.js",
  "site_libs/quarto-contrib/ctm-worker-0.9.0/pyodide-worker.js",
  "site_libs/quarto-contrib/ctm-locale-pyodide-interaktiv-0.9.0/pyodide-interaktiv.js",
  "site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-locale.js",
  "site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-storage.js",
  "site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-document-status.js",
  "site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-storage-settings.js",
  "site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-worker-plugin.js",
  "site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-document-engine-initialization.js",
  "site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-canvas-plots.js",
  "site_libs/quarto-contrib/ctm-export-0.9.0/ctm-export.js",
  "site_libs/quarto-contrib/ctm-progress-0.9.0/ctm-progress.js",
  "site_libs/quarto-contrib/math-exercise-0.11.0/matrix-input.js",
  "site_libs/quarto-contrib/math-exercise-0.11.0/math-store.js",
  "site_libs/quarto-contrib/math-exercise-0.11.0/math-exercise.js",
  "site_libs/quarto-contrib/py-exercise-0.5.0/py-exercise.js",
  "site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-cell-classes.js",
  "site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-cell-initialization.js"
];
const startupTags=startupPaths.map(src=>'<script src="'+src+'"'+
  (src.includes('/pyodide-interaktiv-1.10.0/')?' type="module"':'')+'></script>');
startupTags.push(
  '<script src="./coi-serviceworker.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/js/all.min.js" defer="" crossorigin="anonymous"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.46.0/min/vs/loader.js"></script>',
  "<script type=\"module\" id=\"qpyodide-monaco-editor-init\">\n\n  // Configure the Monaco Editor's loader\n  require.config({\n    paths: {\n      'vs': CTMAssets.url('monaco-editor', 'min/vs')\n    }\n  });\n</script>"
);
assert.equal(startupTags.length,36);
const scriptInventory=[...fixtureHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(match=>({
  attrs:match[1],bytes:Buffer.byteLength(match[0]),
  sha256:createHash('sha256').update(match[0]).digest('hex')
}));
const omittedManifest=startupTags.map(tag=>({tag,bytes:Buffer.byteLength(tag),
  sha256:createHash('sha256').update(tag).digest('hex')}));
function startupControl(incoming,mode){
  assert.equal(incoming,fixtureHtml,'startup comparison uses exact original fixture HTML bytes');
  assert.ok(['native','omit'].includes(mode));
  for(const tag of startupTags)assert.equal(incoming.split(tag).length,2,'exact startup tag occurs once: '+tag);
  if(mode==='native')return incoming;
  let changed=incoming;
  for(const tag of startupTags)changed=changed.replace(tag,'');
  // This equality also protects every non-script content/style byte and all retained scripts.
  const retained=[...incoming.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)]
    .map(match=>match[0]).filter(tag=>!startupTags.includes(tag));
  assert.deepEqual([...changed.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(match=>match[0]),retained);
  return changed;
}
if(process.env.CTM_RESIZE_STARTUP_ONLY==='1'){
  console.log(JSON.stringify({startupInventory:scriptInventory,omittedManifest}));
  startupControl(fixtureHtml,'omit'); // Fail closed before browser work if any expected byte/count differs.
}

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
        mathSetup:window.__mathSetupProbe?{...window.__mathSetupProbe}:null,
        entries:[...entries].slice(0,4).map(entry=>({tag:entry.target.tagName,id:entry.target.id,
          rect:{width:entry.contentRect.width,height:entry.contentRect.height}}))});
      return Reflect.apply(callback,this,arguments);
    },...args.slice(1)],newTarget);
  }});
  addEventListener('error',event=>{
    if(trace.errors.length<32)trace.errors.push({message:event.message,time:performance.now(),readyState:document.readyState,
      mathSetup:window.__mathSetupProbe?{...window.__mathSetupProbe}:null});
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
const corpServer=await serve({stock,fixture,plain},true,'require-corp');
const corpBase='http://127.0.0.1:'+corpServer.address().port;
const report={browser:engine,quartoVersion:'1.8.27',sourceSha256,
  headers:{coop:'same-origin',coep:'credentialless'},samples:[]};
if(process.env.CTM_RESIZE_STARTUP_ONLY==='1')report.startup={
  fixtureHtmlSha256:createHash('sha256').update(fixtureHtml).digest('hex'),omittedManifest,scriptInventory};
let browser;
try {
  browser=await playwright[engine].launch({headless:true});
  report.browserVersion=browser.version();
  report.mathSourceBlob=mathSourceBlob;
  const cases=process.env.CTM_RESIZE_STARTUP_ONLY==='1'?[
    {label:'startup-native-routed',root:'fixture',mode:'native',startupMode:'native',coep:'require-corp',repeats:12},
    {label:'startup-omitted',root:'fixture',mode:'native',startupMode:'omit',coep:'require-corp',repeats:12}
  ]:process.env.CTM_RESIZE_MATH_FRAME_ONLY==='1'?[
    {label:'math-native-routed',root:'fixture',mode:'native',mathMode:'native',repeats:12},
    {label:'math-frame',root:'fixture',mode:'native',mathMode:'frame',repeats:12},
    {label:'math-native-require-corp',root:'fixture',mode:'native',mathMode:'native',coep:'require-corp',repeats:12},
    {label:'math-frame-require-corp',root:'fixture',mode:'native',mathMode:'frame',coep:'require-corp',repeats:12}
  ]:process.env.CTM_RESIZE_ACTUAL_ONLY==='1'?[
    {label:'actual-native',root:'fixture',mode:'native',repeats:12},
    {label:'actual-native-routed',root:'fixture',mode:'native',route:true,repeats:12},
    {label:'actual-entry-width',root:'fixture',mode:'entry-width',repeats:12},
    {label:'actual-no-body-observer',root:'fixture',mode:'no-body-observer',repeats:12},
    {label:'actual-require-corp',root:'fixture',mode:'native',coep:'require-corp',repeats:12}
  ]:[
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
    const routed=control.route || (control.mode && control.mode!=='native');
    if(routed)await ctx.route('**/site_libs/quarto-html/quarto.js',async route=>{
      const response=await route.fetch();
      const incoming=await response.text();
      assert.equal(incoming,source,'counterfactual uses the exact stock source bytes');
      substitutions++;
      await route.fulfill({response,body:sourceControl(incoming,control.mode)});
    });
    let mathSubstitutions=0;
    if(control.mathMode)await ctx.route('**/site_libs/quarto-contrib/math-exercise-0.11.0/math-exercise.js',async route=>{
      const response=await route.fetch();mathSubstitutions++;
      await route.fulfill({response,body:mathControl(await response.text(),control.mathMode)});
    });
    let htmlSubstitutions=0;
    if(control.startupMode)await ctx.route('**/fixture/index.html',async route=>{
      const response=await route.fetch();htmlSubstitutions++;
      await route.fulfill({response,body:startupControl(await response.text(),control.startupMode)});
    });
    const page=await ctx.newPage();
    page.setDefaultTimeout(90000);
    for(let navigation=0;navigation<(control.navigations||1);navigation++) {
      const errors=[],failedRequests=[],consoleMessages=[];
      let droppedConsole=0;
      const onConsole=message=>{
        const text=message.text();
        if(['error','warning'].includes(message.type()) || text.startsWith('[qpyodide-coi]')) {
          if(consoleMessages.length<96)consoleMessages.push({type:message.type(),text});else droppedConsole++;
        }
      };
      const onError=error=>errors.push({message:error.message,stack:error.stack});
      const onFailure=request=>failedRequests.push({url:request.url(),failure:request.failure()});
      page.on('pageerror',onError);page.on('requestfailed',onFailure);page.on('console',onConsole);
      const origin=control.coep==='require-corp'?corpBase:base;
      const coep=control.coep || 'credentialless';
      const response=await page.goto(origin+'/'+control.root+'/'+(control.file||'index.html'),{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200);
      assert.equal(response.headers()['cross-origin-opener-policy'],'same-origin');
      assert.equal(response.headers()['cross-origin-embedder-policy'],coep);
      if(control.root==='fixture' && control.startupMode!=='omit')await page.locator('.ctm-save-bar').waitFor({state:'visible'});
      await page.waitForLoadState('load');
      await page.waitForTimeout(1000);
      const snapshot=await page.evaluate(()=>({trace:window.__resizeProbe,readyState:document.readyState,
        isolated:crossOriginIsolated,mathSetup:window.__mathSetupProbe?{...window.__mathSetupProbe}:null,
        coi:{outcome:window.qpyodideCoiOutcome,inputState:window.qpyodideInputState,
          controlled:!!navigator.serviceWorker?.controller,
          navigation:performance.getEntriesByType('navigation')[0]?.type},
        storeReady:!!window.CTMStore,startupGlobals:{nav:!!window.CTMNav,reveal:!!window.CTMReveal,assets:!!window.CTMAssets},mathInputs:document.querySelectorAll('input.math-input').length,
        mathSavedAnswers:document.querySelectorAll('.math-exercise-cell > .math-saved-answer').length,
        mathSavedResults:document.querySelectorAll('.math-exercise-cell > .math-saved-result').length,
        body:window.__resizeProbe.callbacks.flatMap(callback=>callback.entries).filter(entry=>entry.tag==='BODY').at(-1)?.rect,
        controlHeight:document.getElementById('height-control')?.style.height,
        viewport:{width:innerWidth,height:innerHeight},
        marginCount:document.querySelectorAll('.column-margin.column-container > *, .margin-caption, .aside').length,
        ctmNodes:document.querySelectorAll('[data-ctm-component]').length,
        quarto:document.querySelector('meta[name="generator"]')?.content,
        scripts:[...document.scripts].map(s=>s.src).filter(Boolean)}));
      await page.waitForTimeout(100);
      report.samples.push({label:control.label,sample,navigation,coep,origin,quartoSubstitutions:substitutions,mathSubstitutions,htmlSubstitutions,startupMode:control.startupMode,errors,failedRequests,consoleMessages,droppedConsole,...snapshot});
      console.log(JSON.stringify({label:control.label,sample,navigation,coep,errors,failedRequests,coi:snapshot.coi,consoleMessages,
        quartoSubstitutions:substitutions,mathSubstitutions,htmlSubstitutions,startupMode:control.startupMode,mathSetup:snapshot.mathSetup,
        callbackCount:snapshot.trace.callbacks.length,body:snapshot.body,isolated:snapshot.isolated,marginCount:snapshot.marginCount}));
      if(control.mode==='no-body-observer' && control.root==='stock')assert.equal(snapshot.controlHeight,'1200px');
      else if(control.startupMode==='omit'){assert.equal(snapshot.body?.width,1280);assert.ok(snapshot.body.height>0);}
      else if(control.mode!=='no-body-observer')assert.ok(snapshot.body?.height>900,'native BODY entries retain a page taller than the viewport');
      if(control.root==='fixture' && control.startupMode!=='omit'){assert.equal(snapshot.storeReady,true);assert.ok(snapshot.mathInputs>0);}
      if(control.startupMode){
        assert.deepEqual(failedRequests,[],'startup comparison retains all required requests');
        assert.ok(errors.every(error=>error.message==='ResizeObserver loop completed with undelivered notifications.'),
          'startup omission must not introduce unrelated script/dependency errors');
        assert.equal(snapshot.ctmNodes,8,'actual build-time CTM content remains');
        if(control.startupMode==='native'){
          assert.equal(snapshot.mathInputs,7);assert.equal(snapshot.mathSavedAnswers,7);assert.equal(snapshot.mathSavedResults,7);
        }
        if(control.startupMode==='omit'){
          assert.equal(snapshot.storeReady,false);assert.equal(snapshot.mathInputs,0);assert.equal(snapshot.mathSetup,null);
          assert.deepEqual(snapshot.startupGlobals,{nav:false,reveal:false,assets:false});
        }
      }
      if(coep==='require-corp')assert.equal(snapshot.isolated,true);
      if(control.mathMode){
        assert.equal(snapshot.mathSetup?.phase,'setup-complete-before-preload');
        assert.equal(snapshot.mathSetup.visible,'visible');
        assert.equal(snapshot.mathSetup.katexReady,true);assert.equal(snapshot.mathSetup.katexFunctions,true);
        assert.equal(snapshot.mathSetup.katexRendered,true);assert.equal(snapshot.mathSetup.cells,7);
        assert.equal(snapshot.mathSetup.adapterNotes,7);assert.equal(snapshot.mathSetup.adapterResults,7);
        assert.equal(snapshot.mathSetup.inputCount,7);assert.equal(snapshot.mathInputs,7);
      }
      assert.deepEqual(snapshot.viewport,{width:1280,height:900});
      if(control.root==='stock') {
        assert.equal(snapshot.quarto,'quarto-1.8.27');assert.equal(snapshot.ctmNodes,0);assert.equal(snapshot.marginCount,0);
        assert.ok(!snapshot.scripts.some(s=>/quarto-contrib|ctm-|py-exercise|qpyodide/.test(s)));
        assert.ok(snapshot.scripts.some(s=>/bootstrap.min.js$/.test(s)));
      }
      if(control.mode==='no-body-observer')assert.ok(!snapshot.trace.callbacks.some(c=>c.entries.some(e=>e.tag==='BODY')));
      else assert.ok(snapshot.trace.callbacks.some(c=>c.entries.some(e=>e.tag==='BODY')),'native BODY observation delivered');
      page.off('pageerror',onError);page.off('requestfailed',onFailure);page.off('console',onConsole);
    }
    if(routed)assert.equal(substitutions,control.navigations||1);
    if(control.mathMode){assert.equal(mathSubstitutions,1);assert.equal(substitutions,0);}
    if(control.startupMode){assert.equal(htmlSubstitutions,1);assert.equal(mathSubstitutions,0);assert.equal(substitutions,0);}
    await ctx.close();
  }
  report.summary=[...new Set(report.samples.map(s=>s.label))].map(label=>{
    const samples=report.samples.filter(s=>s.label===label);
    return {label,navigations:samples.length,errorNavigations:samples.filter(s=>s.errors.length).length,
      errors:samples.flatMap(s=>s.errors).length,requestFailures:samples.flatMap(s=>s.failedRequests).length};
  });
  console.log(JSON.stringify({diagnosticSummary:report.summary},null,2));
  if(process.env.CTM_RESIZE_MATH_FRAME_ONLY==='1') {
    for(const coep of ['credentialless','require-corp']){
      const dimensions=report.samples.filter(s=>s.coep===coep).map(s=>JSON.stringify(s.body));
      assert.equal(new Set(dimensions).size,1,'real final native BODY geometry matches across math timing controls');
    }
  }
  for(const sample of report.samples.filter(s=>s.errors.length))console.log(JSON.stringify({failedSample:sample}));
  assert.ok(report.samples.some(s=>['actual-store-positive-control','actual-native','math-native-routed','startup-native-routed'].includes(s.label) && s.errors.length),
    'positive control must reproduce raw errors; otherwise stock negatives cannot establish causality');
} finally {
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await new Promise(resolve=>corpServer.close(resolve));
}
