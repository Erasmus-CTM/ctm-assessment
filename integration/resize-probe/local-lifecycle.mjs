// Bounded CTM lifecycle trace: vendor sources and observer constructor untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as playwright from 'playwright';
import {serve} from '../../tools/compare-browser.mjs';

const fixture=path.resolve(process.env.CTM_RESIZE_FIXTURE);
const output=path.resolve(process.env.CTM_RESIZE_REPORT);
const quartoPath='site_libs/quarto-html/quarto.js';
const sha=text=>createHash('sha256').update(text).digest('hex');
const html=fs.readFileSync(path.join(fixture,'index.html'),'utf8');
const quarto=fs.readFileSync(path.join(fixture,quartoPath),'utf8');
assert.equal(sha(quarto),'14589dacd0cf625c4e6891269681a0a8e20aaa5390864ca6a69f2fff1514719a');
const mark=(name,data='null')=>'globalThis.__ctmLifecycleMark('+JSON.stringify(name)+','+data+');';
function once(source,before,after){assert.equal(source.split(before).length,2,'exact CTM boundary occurs once: '+before);return source.replace(before,after);}
const transforms=[
  {path:'site_libs/quarto-contrib/ctm-store-0.9.0/ctm-store.js',sha:'ecb646274c3c6dda5e3f3a790350839dd0e8b3c5be0d53d9031d2b76f35e7d41',spans:[
    ['  function start() {','  function start() {'+mark('store-start')],
    ['      bar.hidden = false;','      '+mark('store-bar-before')+'bar.hidden = false;'+mark('store-bar-after')]
  ]},
  {path:'site_libs/quarto-contrib/ctm-progress-0.9.0/ctm-progress.js',sha:'8964f91791b82527f5ff10d9b3f208bd54243bd83fea62ef92e2e9e1fcf1a247',spans:[
    ['  function init() {','  function init() {'+mark('progress-init')],
    ['      region.append(heading, total, list); slot.append(region);','      region.append(heading, total, list);'+mark('progress-panel-before','{title,slot:slot.className}')+'slot.append(region);'+mark('progress-panel-after','{title,slot:slot.className}')],
    ['    update(); // No live region on load; tiles are available before Python starts.','    update();'+mark('progress-complete')+' // No live region on load; tiles are available before Python starts.']
  ]},
  {path:'site_libs/quarto-contrib/ctm-reveal-0.9.0/ctm-reveal.js',sha:'d7bb0cecd7147810aa8f0aeeb15a3ca6d9b37959aefed6248efacc1aca355500',spans:[
    ['  function start() {','  function start() {'+mark('reveal-start')],
    ["      window.dispatchEvent(new Event('resize'));","      "+mark('reveal-resize')+"window.dispatchEvent(new Event('resize'));"]
  ]},
  {path:'site_libs/quarto-contrib/ctm-nav-0.9.0/ctm-nav.js',sha:'bacdf393784c065ef168930ba1830651c565871ec6f388d1fd83f6e5646ec8bf',spans:[
    ['  function navigate(position, target, how) {','  function navigate(position, target, how) {'+mark('nav-start',"{target:target&&target.id,position:!!position,how}")],
    ["      window.dispatchEvent(new Event('resize'));","      "+mark('nav-resize')+"window.dispatchEvent(new Event('resize'));"]
  ]},
  {path:'site_libs/quarto-contrib/py-exercise-0.5.0/py-exercise.js',sha:'ab429398278e1fd364ec8ffafe4faf5a2838ada4911cd65ff56ef40c5826740b',spans:[
    ['      var updateHeight = function () {\n        var h = Math.max(80, editor.getContentHeight());\n        editorContainer.style.height = h + \'px\';\n        editor.layout();\n      };',
     '      var updateHeight = function () {\n        var h = Math.max(80, editor.getContentHeight());'+mark('py-height-before','{height:h,previous:editorContainer.style.height}')+'\n        editorContainer.style.height = h + \'px\';\n        editor.layout();'+mark('py-height-after','{height:editorContainer.style.height}')+'\n      };']
  ]},
  {path:'site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-cell-classes.js',sha:'7f9308aa0e55cd76eb4d96ebc7dc19bfc0109346cf072be5995e8949c468f055',spans:[
    ['      const updateHeight = () => {\n        const contentHeight = thiz.editor.getContentHeight();\n        thiz.editorDiv.style.height = `${contentHeight}px`;\n        thiz.editor.layout();\n      };',
     '      const updateHeight = () => {\n        const contentHeight = thiz.editor.getContentHeight();'+mark('pyo-height-before','{height:contentHeight,previous:thiz.editorDiv.style.height}')+'\n        thiz.editorDiv.style.height = `${contentHeight}px`;\n        thiz.editor.layout();'+mark('pyo-height-after','{height:thiz.editorDiv.style.height}')+'\n      };']
  ]},
  {path:'site_libs/quarto-contrib/pyodide-interaktiv-1.10.0/qpyodide-cell-initialization.js',sha:'5fa5172383817b383a5e5d7ef0911acf3cfd9f81ad630363cbe5a534bf0bf940',spans:[
    ['qpyodideCellDetails.forEach((entry) => {',mark('pyo-build-start')+'qpyodideCellDetails.forEach((entry) => {'],
    ['  qpyodideCellContainer.addCell(qpyodideCreateCell(entry));\n});','  qpyodideCellContainer.addCell(qpyodideCreateCell(entry));\n});'+mark('pyo-build-end')]
  ]},
  {path:'site_libs/quarto-contrib/math-exercise-0.11.0/math-exercise.js',sha:'5755cea1b18f15546b80ace8748f665ed4cd3cb476845ed50e3216514553c311',spans:[
    ["  document.addEventListener('DOMContentLoaded', async function () {","  document.addEventListener('DOMContentLoaded', async function () {"+mark('math-DCL')],
    ['    cells.forEach(setupCell);',mark('math-setup-before')+'    cells.forEach(setupCell);'+mark('math-setup-after')]
  ]}
];
const report={fixtureHtmlSha256:sha(html),quartoSha256:sha(quarto),sources:[],samples:[]};
const servers={},origins={};let browser;
fs.mkdirSync(output,{recursive:true});
try{
  for(const mode of ['original','trace']){
    const copy=output+'-'+mode;fs.cpSync(fixture,copy,{recursive:true});
    assert.equal(fs.readFileSync(path.join(copy,'index.html'),'utf8'),html);
    for(const transform of transforms){
      const source=fs.readFileSync(path.join(copy,transform.path),'utf8');assert.equal(sha(source),transform.sha);
      let changed=source;for(const [before,after] of transform.spans)changed=once(changed,before,after);
      if(mode==='trace')fs.writeFileSync(path.join(copy,transform.path),changed);
      if(mode==='trace')report.sources.push({path:transform.path,originalSha256:sha(source),traceSha256:sha(changed),boundaries:transform.spans.length});
    }
    assert.equal(fs.readFileSync(path.join(copy,quartoPath),'utf8'),quarto);
    servers[mode]=await serve({fixture:copy},true,'require-corp');origins[mode]='http://127.0.0.1:'+servers[mode].address().port;
  }
  browser=await playwright.webkit.launch({headless:true});report.browserVersion=browser.version();
  for(const control of [{name:'startup',repeats:6},{name:'editors',repeats:2}])for(let sample=0;sample<control.repeats;sample++)for(const mode of ['original','trace']){
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
    await context.addInitScript(()=>{
      if(window!==top)return;
      localStorage.setItem('quarto-reader-mode','false');
      const trace=window.__ctmLifecycle={events:[],errors:[]};let sequence=0;
      const record=(kind,data)=>{if(trace.events.length<1200)trace.events.push({sequence:sequence++,time:performance.now(),readyState:document.readyState,kind,data});};
      window.__ctmLifecycleMark=record;
      for(const name of ['DOMContentLoaded','load','pageshow'])addEventListener(name,()=>record(name),true);
      addEventListener('error',event=>{const error={time:performance.now(),message:event.message,readyState:document.readyState};trace.errors.push(error);record('error',error);});
      const geometry=Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect=function(...args){
        const rect=Reflect.apply(geometry,this,args);
        if(this===document.body)record('original-body-read',{width:rect.width,height:rect.height,stack:String(new Error().stack||'').slice(0,850)});
        return rect;
      };
      new MutationObserver(records=>{
        const interesting=records.filter(r=>r.type==='childList'||['hidden','style','class','data-bs-theme'].includes(r.attributeName));
        if(!interesting.length)return;
        record('mutations',interesting.slice(0,25).map(r=>({type:r.type,attribute:r.attributeName,target:r.target.nodeName,id:r.target.id,
          classes:typeof r.target.className==='string'?r.target.className:'',style:r.target.getAttribute?.('style'),
          added:[...r.addedNodes].slice(0,4).map(n=>({tag:n.nodeName,id:n.id,classes:typeof n.className==='string'?n.className:''}))})));
      }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','class','data-bs-theme']});
    });
    const page=await context.newPage(),pageerrors=[],failedRequests=[],consoleErrors=[];page.setDefaultTimeout(90000);
    page.on('pageerror',error=>pageerrors.push({message:error.message,stack:error.stack}));
    page.on('requestfailed',request=>failedRequests.push({url:request.url(),failure:request.failure()}));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    const response=await page.goto(origins[mode]+'/fixture/index.html',{waitUntil:'load'});assert.equal(response.status(),200);
    assert.equal(response.headers()['cross-origin-embedder-policy'],'require-corp');
    await page.locator('.ctm-save-bar').waitFor({state:'visible'});await page.waitForTimeout(1100);
    if(control.name==='editors'){
      await page.waitForFunction(()=>window.monaco?.editor?.getEditors?.().length===2&&window.qpyodideCellsReady&&window.qpyodideStartupPhaseDone);
      await page.getByRole('tab',{name:'Code',exact:true}).click();await page.waitForTimeout(150);
      await page.evaluate(()=>monaco.editor.getEditors().forEach((editor,index)=>editor.setValue('print("local '+index+'")\n'.repeat(8))));
      for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.waitForTimeout(200);}
      await page.getByRole('tab',{name:'Scalar',exact:true}).click();await page.getByRole('tab',{name:'Code',exact:true}).click();await page.waitForTimeout(200);
    }
    const state=await page.evaluate(()=>({trace:window.__ctmLifecycle,isolated:crossOriginIsolated,store:!!window.CTMStore,
      inputs:document.querySelectorAll('input.math-input').length,answers:document.querySelectorAll('.math-exercise-cell > .math-saved-answer').length,
      results:document.querySelectorAll('.math-exercise-cell > .math-saved-result').length,progress:document.querySelectorAll('.ctm-progress').length,
      body:{width:document.body.getBoundingClientRect().width,height:document.body.getBoundingClientRect().height}}));
    assert.equal(state.isolated,true);assert.equal(state.store,true);assert.equal(state.inputs,7);assert.equal(state.answers,7);assert.equal(state.results,7);assert.equal(state.progress,2);
    assert.deepEqual(failedRequests,[]);assert.deepEqual(consoleErrors,[]);
    assert.ok([...pageerrors,...state.trace.errors].every(error=>error.message==='ResizeObserver loop completed with undelivered notifications.'));
    const result={case:control.name,mode,sample,pageerrors,failedRequests,consoleErrors,...state};report.samples.push(result);console.log(JSON.stringify(result));await context.close();
  }
  report.summary=['startup','editors'].flatMap(name=>['original','trace'].map(mode=>{const samples=report.samples.filter(s=>s.case===name&&s.mode===mode);return{
    case:name,mode,loads:samples.length,pageerrorLoads:samples.filter(s=>s.pageerrors.length).length,windowErrorLoads:samples.filter(s=>s.trace.errors.length).length};}));
  console.log(JSON.stringify({summary:report.summary},null,2));
  assert.ok(report.samples.some(s=>s.mode==='original'&&s.trace.errors.length),'original positive control must reproduce');
  assert.ok(report.samples.some(s=>s.mode==='trace'&&s.trace.errors.length),'transparent CTM trace must retain the signal');
}finally{
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(browser)await browser.close();for(const server of Object.values(servers))await new Promise(resolve=>server.close(resolve));
}
