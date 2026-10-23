// Bounded diagnostic only: no generated production source is changed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as playwright from 'playwright';
import {serve} from '../../tools/compare-browser.mjs';

const fixture=path.resolve(process.env.CTM_RESIZE_FIXTURE || '.resize-fixture/before/_site');
const output=path.resolve(process.env.CTM_RESIZE_REPORT || '.resize-reader-first');
const engine=process.env.CTM_BROWSER || 'webkit';
assert.ok(['chromium','firefox','webkit'].includes(engine));
const sha=text=>createHash('sha256').update(text).digest('hex');
const html=fs.readFileSync(path.join(fixture,'index.html'),'utf8');
const sourcePath='site_libs/quarto-html/quarto.js';
const source=fs.readFileSync(path.join(fixture,sourcePath),'utf8');
assert.equal(sha(source),'14589dacd0cf625c4e6891269681a0a8e20aaa5390864ca6a69f2fff1514719a','frozen Quarto source matches reviewed artifact');
const before='          window.document.body.getBoundingClientRect().width < 990 &&\n          isReaderMode()';
const after='          isReaderMode() &&\n          window.document.body.getBoundingClientRect().width < 990';
assert.equal(source.split(before).length,2,'exact original reader predicate occurs once');
assert.ok(source.includes('return window.localStorage.getItem("quarto-reader-mode") === "true";'));
const changed=source.replace(before,after);
assert.equal(changed.replace(after,before),source,'all other source bytes stay unchanged');
const marginHtml='<div id="probe-margin-box" style="position:relative;height:100px"><div id="probe-margin-a" class="aside" style="position:absolute;top:0;height:40px;margin:0">Margin A</div><div id="probe-margin-b" class="aside" style="position:absolute;top:10px;height:40px;margin:0">Margin B</div></div>';
assert.equal(html.split('</body>').length,2);
const report={browser:engine,fixtureHtmlSha256:sha(html),sourceSha256:sha(source),changedSha256:sha(changed),
  intervention:{before,after,transport:'native HTTP, matched copies, zero navigation interception'},samples:[]};
const servers={},origins={};
fs.mkdirSync(output,{recursive:true});
let browser;
try {
  for(const mode of ['native','reader-first'])for(const variant of ['actual','margins','transform']){
    const key=mode+'-'+variant,copy=output+'-'+key;
    fs.cpSync(fixture,copy,{recursive:true});
    assert.equal(fs.readFileSync(path.join(copy,sourcePath),'utf8'),source);
    if(mode==='reader-first')fs.writeFileSync(path.join(copy,sourcePath),changed);
    if(variant==='margins')fs.writeFileSync(path.join(copy,'index.html'),html.replace('</body>',marginHtml+'</body>'));
    if(variant==='transform')fs.writeFileSync(path.join(copy,'index.html'),html.replace('</body>','<style>body{transform:scale(.5);transform-origin:top left}</style></body>'));
    servers[key]=await serve({fixture:copy},true,'require-corp');
    origins[key]='http://127.0.0.1:'+servers[key].address().port;
  }
  browser=await playwright[engine].launch({headless:true});
  report.browserVersion=browser.version();
  const cases=[
    {name:'normal-desktop',variant:'actual',reader:false,width:1280,repeats:12},
    {name:'reader-desktop',variant:'actual',reader:true,width:1280,repeats:4},
    {name:'reader-mobile',variant:'actual',reader:true,width:390,repeats:4},
    {name:'reader-margin-resize',variant:'margins',reader:true,width:1280,resize:390,repeats:4},
    {name:'reader-transform',variant:'transform',reader:true,width:1280,repeats:4}
  ];
  for(const control of cases)for(let sample=0;sample<control.repeats;sample++)for(const mode of ['native','reader-first']){
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:control.width,height:900}});
    await context.addInitScript(({reader})=>{
      if(window!==top)return;
      localStorage.setItem('quarto-reader-mode',String(reader));
      window.__readerTrace={errors:[],bodyCallbacks:0};
      const Native=window.ResizeObserver;
      window.ResizeObserver=new Proxy(Native,{construct(Constructor,args,newTarget){
        const callback=args[0];
        return Reflect.construct(Constructor,[function(entries,observer){
          if([...entries].some(entry=>entry.target===document.body))window.__readerTrace.bodyCallbacks++;
          return Reflect.apply(callback,this,arguments);
        },...args.slice(1)],newTarget);
      }});
      addEventListener('error',event=>window.__readerTrace.errors.push({message:event.message,time:performance.now()}));
    },{reader:control.reader});
    const page=await context.newPage(),errors=[],failedRequests=[],consoleErrors=[];
    page.setDefaultTimeout(90000);
    page.on('pageerror',error=>errors.push({message:error.message,stack:error.stack}));
    page.on('requestfailed',request=>failedRequests.push({url:request.url(),failure:request.failure()}));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    const response=await page.goto(origins[mode+'-'+control.variant]+'/fixture/index.html',{waitUntil:'load'});
    assert.equal(response.status(),200);
    assert.equal(response.headers()['cross-origin-opener-policy'],'same-origin');
    assert.equal(response.headers()['cross-origin-embedder-policy'],'require-corp');
    await page.locator('.ctm-save-bar').waitFor({state:'visible'});
    await page.waitForTimeout(1100);
    const snapshot=()=>page.evaluate(()=>({
      isolated:crossOriginIsolated,reader:localStorage.getItem('quarto-reader-mode'),
      readerToggles:[...document.querySelectorAll('.quarto-reader-toggle')].map(el=>el.classList.contains('reader')),
      trace:window.__readerTrace,body:{width:document.body.getBoundingClientRect().width,height:document.body.getBoundingClientRect().height},
      viewport:{width:innerWidth,height:innerHeight},store:!!window.CTMStore,
      inputs:document.querySelectorAll('input.math-input').length,
      answers:document.querySelectorAll('.math-exercise-cell > .math-saved-answer').length,
      results:document.querySelectorAll('.math-exercise-cell > .math-saved-result').length,
      margins:[...document.querySelectorAll('.column-margin.column-container > *, .margin-caption, .aside')].map(el=>({
        id:el.id,marginTop:el.style.marginTop,top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height}))
    }));
    const initial=await snapshot();
    const expectedReader=control.reader && control.width>=990 && control.variant!=='transform';
    assert.equal(initial.reader,String(expectedReader),'initial reader state follows the original transformed BODY width threshold');
    assert.ok(initial.readerToggles.every(active=>active===expectedReader));
    assert.equal(initial.isolated,true);assert.equal(initial.store,true);
    assert.equal(initial.inputs,7);assert.equal(initial.answers,7);assert.equal(initial.results,7);
    assert.ok(initial.trace.bodyCallbacks>0,'native BODY callback remains active');
    let resized=null;
    if(control.resize){
      assert.equal(initial.reader,'true','reader mode is active before crossing the threshold');
      assert.equal(initial.margins.find(el=>el.id==='probe-margin-b')?.marginTop,'30px','unchanged margin layout separates synthetic overlapping margins');
      await page.setViewportSize({width:control.resize,height:900});
      await page.waitForTimeout(250);
      resized=await snapshot();
      assert.equal(resized.reader,'false','native observer exits reader mode below the original threshold');
      assert.ok(resized.readerToggles.every(active=>!active));
      assert.equal(resized.margins.find(el=>el.id==='probe-margin-b')?.marginTop,'30px');
      assert.ok(resized.trace.bodyCallbacks>initial.trace.bodyCallbacks);
    }
    assert.deepEqual(failedRequests,[]);assert.deepEqual(consoleErrors,[]);
    assert.ok(errors.every(error=>error.message==='ResizeObserver loop completed with undelivered notifications.'),'retain raw RO errors and reject unrelated errors');
    const result={case:control.name,mode,sample,errors,failedRequests,consoleErrors,initial,resized};
    report.samples.push(result);console.log(JSON.stringify(result));
    await context.close();
  }
  report.summary=[...new Set(report.samples.map(s=>s.case))].flatMap(name=>['native','reader-first'].map(mode=>{
    const samples=report.samples.filter(s=>s.case===name&&s.mode===mode);
    return {case:name,mode,loads:samples.length,errorLoads:samples.filter(s=>s.errors.length).length};
  }));
  console.log(JSON.stringify({summary:report.summary},null,2));
  assert.ok(report.samples.some(s=>s.case==='normal-desktop'&&s.mode==='native'&&s.errors.length),'unchanged positive control must reproduce');
  // Favorable results are evidence for a canonical upstream fix, never strict product acceptance.
} finally {
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(browser)await browser.close();
  for(const server of Object.values(servers))await new Promise(resolve=>server.close(resolve));
}
