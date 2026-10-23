// Bounded upstream candidate proof. These source copies are diagnostic inputs;
// the production renderer, packaged extensions and strict suite stay unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as playwright from 'playwright';
import {serve} from '../../tools/compare-browser.mjs';
import {sha256,quartoPhase,monacoPhase} from './source-phase.mjs';

const fixture=path.resolve(process.env.CTM_RESIZE_FIXTURE || '.resize-fixture/before/_site');
const monaco=path.resolve(process.env.CTM_RESIZE_MONACO || '.resize-monaco/package');
const output=path.resolve(process.env.CTM_RESIZE_REPORT || '.resize-source-phase');
const engine=process.env.CTM_BROWSER || 'webkit';
assert.ok(['chromium','firefox','webkit'].includes(engine));
const html=fs.readFileSync(path.join(fixture,'index.html'),'utf8');
const quartoPath='site_libs/quarto-html/quarto.js';
const quarto=fs.readFileSync(path.join(fixture,quartoPath),'utf8');
assert.equal(sha256(quarto),'14589dacd0cf625c4e6891269681a0a8e20aaa5390864ca6a69f2fff1514719a');
const mainPath='min/vs/editor/editor.main.js';
const main=fs.readFileSync(path.join(monaco,mainPath),'utf8');
assert.equal(JSON.parse(fs.readFileSync(path.join(monaco,'package.json'),'utf8')).version,'0.46.0');
const changedQuarto=quartoPhase(quarto),changedMonaco=monacoPhase(main);
const cdn='https://cdn.jsdelivr.net/npm/monaco-editor@0.46.0/';
assert.equal(html.split(cdn).length,4,'exact three Monaco asset roots in actual HTML');
const localHtml=html.replaceAll(cdn,'/fixture/diagnostic-monaco/');
assert.equal(localHtml.replaceAll('/fixture/diagnostic-monaco/',cdn),html);
const marginHtml='<button id="probe-reader-toggle" class="quarto-reader-toggle" type="button" onclick="quartoToggleReader()">Reader</button><div id="probe-margin-box" style="position:relative;height:100px"><div id="probe-margin-a" class="aside" style="position:absolute;top:0;height:40px;margin:0">Margin A</div><div id="probe-margin-b" class="aside" style="position:absolute;top:10px;height:40px;margin:0">Margin B</div></div>';
const report={browser:engine,fixtureHtmlSha256:sha256(html),quartoSha256:sha256(quarto),monacoSha256:sha256(main),
  changedQuartoSha256:sha256(changedQuarto),changedMonacoSha256:sha256(changedMonaco),
  intervention:'Quarto schedules its original throttled layout work; Monaco schedules and coalesces latest dimensions. Native HTTP matched source copies; no routing.',samples:[]};
fs.mkdirSync(output,{recursive:true});
const servers={},origins={};let browser;
try {
  for(const mode of ['native','source-phase'])for(const variant of ['actual','margins','transform']) {
    const key=mode+'-'+variant,copy=output+'-'+key;
    fs.cpSync(fixture,copy,{recursive:true});
    fs.cpSync(path.join(monaco,'min'),path.join(copy,'diagnostic-monaco/min'),{recursive:true});
    let variantHtml=localHtml;
    if(variant==='margins')variantHtml=variantHtml.replace('</body>',marginHtml+'</body>');
    if(variant==='transform')variantHtml=variantHtml.replace('</body>','<style>body{transform:scale(.5);transform-origin:top left}</style></body>');
    fs.writeFileSync(path.join(copy,'index.html'),variantHtml);
    if(mode==='source-phase') {
      fs.writeFileSync(path.join(copy,quartoPath),changedQuarto);
      fs.writeFileSync(path.join(copy,'diagnostic-monaco',mainPath),changedMonaco);
    }
    servers[key]=await serve({fixture:copy},true,'require-corp');
    origins[key]='http://127.0.0.1:'+servers[key].address().port;
  }
  browser=await playwright[engine].launch({headless:true});report.browserVersion=browser.version();
  const cases=[
    {name:'normal-desktop',variant:'actual',reader:false,width:1280,repeats:12},
    {name:'reader-desktop',variant:'actual',reader:true,width:1280,repeats:4},
    {name:'reader-mobile',variant:'actual',reader:true,width:390,repeats:4},
    {name:'reader-transform',variant:'transform',reader:true,width:1280,repeats:4},
    {name:'margin-reader-resize',variant:'margins',reader:true,width:1280,resize:390,repeats:4},
    {name:'editor-transitions',variant:'actual',reader:false,width:1280,editors:true,repeats:4},
    {name:'after-start-storage-denial',variant:'actual',reader:false,width:1280,denial:true,repeats:2}
  ];
  for(const control of cases)for(let sample=0;sample<control.repeats;sample++)for(const mode of ['native','source-phase']) {
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:control.width,height:900}});
    await context.addInitScript(({reader})=>{
      if(window!==top)return;
      localStorage.setItem('quarto-reader-mode',String(reader));
      const trace=window.__sourcePhase={depth:0,current:null,observers:[],bodyReads:[],errors:[]};
      const Native=window.ResizeObserver;
      window.ResizeObserver=new Proxy(Native,{construct(Constructor,args,newTarget){
        const callback=args[0];if(typeof callback!=='function')return Reflect.construct(Constructor,args,newTarget);
        const stack=String(new Error().stack||'');
        const state={id:trace.observers.length,owner:stack.includes('/quarto-html/quarto.js')?'quarto':stack.includes('/diagnostic-monaco/')?'monaco':'other',deliveries:0,last:[]};
        trace.observers.push(state);
        return Reflect.construct(Constructor,[function(entries,observer){
          state.deliveries++;state.last=[...entries].map(entry=>({id:entry.target.id,tag:entry.target.tagName,width:entry.contentRect.width,height:entry.contentRect.height}));
          const prior=trace.current;trace.current=state;trace.depth++;
          try{return Reflect.apply(callback,this,arguments);}finally{trace.depth--;trace.current=prior;}
        },...args.slice(1)],newTarget);
      }});
      const geometry=Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect=function(...args){
        const rect=Reflect.apply(geometry,this,args);
        if(this===document.body&&trace.bodyReads.length<160)trace.bodyReads.push({time:performance.now(),depth:trace.depth,observer:trace.current?.id,
          entry:trace.current?.last,rect:{width:rect.width,height:rect.height},stack:String(new Error().stack||'').slice(0,900)});
        return rect;
      };
      addEventListener('error',event=>trace.errors.push({message:event.message,time:performance.now()}));
    },{reader:control.reader});
    const page=await context.newPage(),errors=[],failedRequests=[],consoleErrors=[];page.setDefaultTimeout(90000);
    page.on('pageerror',error=>errors.push({message:error.message,stack:error.stack}));
    page.on('requestfailed',request=>failedRequests.push({url:request.url(),failure:request.failure()}));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    const response=await page.goto(origins[mode+'-'+control.variant]+'/fixture/index.html',{waitUntil:'load'});
    assert.equal(response.status(),200);assert.equal(response.headers()['cross-origin-opener-policy'],'same-origin');
    assert.equal(response.headers()['cross-origin-embedder-policy'],'require-corp');
    await page.locator('.ctm-save-bar').waitFor({state:'visible'});await page.waitForTimeout(1100);
    const snapshot=()=>page.evaluate(()=>({isolated:crossOriginIsolated,reader:localStorage.getItem('quarto-reader-mode'),
      toggles:[...document.querySelectorAll('.quarto-reader-toggle')].map(el=>el.classList.contains('reader')),
      body:{width:document.body.getBoundingClientRect().width,height:document.body.getBoundingClientRect().height},
      inputs:document.querySelectorAll('input.math-input').length,answers:document.querySelectorAll('.math-exercise-cell > .math-saved-answer').length,
      results:document.querySelectorAll('.math-exercise-cell > .math-saved-result').length,store:!!window.CTMStore,
      margin:document.getElementById('probe-margin-b')?.style.marginTop,
      trace:window.__sourcePhase}));
    const initial=await snapshot();
    assert.equal(initial.isolated,true);assert.equal(initial.store,true);assert.equal(initial.inputs,7);assert.equal(initial.answers,7);assert.equal(initial.results,7);
    const expectedReader=control.reader&&control.width>=990&&control.variant!=='transform';
    assert.equal(initial.reader,String(expectedReader));assert.ok(initial.toggles.every(active=>active===expectedReader));
    assert.ok(initial.trace.observers.some(state=>state.owner==='quarto'&&state.deliveries>0));
    let resized=null,editorState=null,storageDenial=null;
    if(control.resize) {
      assert.deepEqual(initial.toggles,[true]);assert.equal(initial.margin,'30px');
      await page.setViewportSize({width:control.resize,height:900});await page.waitForTimeout(250);
      resized=await snapshot();assert.equal(resized.reader,'false');assert.deepEqual(resized.toggles,[false]);assert.equal(resized.margin,'30px');
    }
    if(control.editors) {
      await page.waitForFunction(()=>window.monaco?.editor?.getEditors?.().length===2&&window.qpyodideCellsReady&&window.qpyodideStartupPhaseDone);
      await page.getByRole('tab',{name:'Code',exact:true}).click();
      await page.waitForTimeout(200);
      const values=await page.evaluate(()=>monaco.editor.getEditors().map((editor,index)=>{const value='print("phase '+index+'")\n'.repeat(8);editor.setValue(value);return value;}));
      for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.waitForTimeout(200);}
      await page.getByRole('tab',{name:'Scalar',exact:true}).click();await page.getByRole('tab',{name:'Code',exact:true}).click();await page.waitForTimeout(200);
      editorState=await page.evaluate(()=>monaco.editor.getEditors().map(editor=>({value:editor.getValue(),layout:editor.getLayoutInfo(),
        container:{width:editor.getContainerDomNode().clientWidth,height:editor.getContainerDomNode().clientHeight}})));
      assert.deepEqual(editorState.map(state=>state.value),values);
      for(const state of editorState){assert.ok(state.layout.width>5&&state.layout.height>5);assert.ok(Math.abs(state.layout.width-state.container.width)<=1);assert.ok(Math.abs(state.layout.height-state.container.height)<=1);}
    }
    if(control.denial) {
      const before=await page.evaluate(()=>{
        const trace=window.__sourcePhase;trace.deniedReads=0;trace.originalGet=Storage.prototype.getItem;
        Storage.prototype.getItem=function(key){if(key==='quarto-reader-mode'){trace.deniedReads++;throw new DOMException('diagnostic storage denial','SecurityError');}return Reflect.apply(trace.originalGet,this,arguments);};
        const count=trace.observers.find(state=>state.owner==='quarto').deliveries;
        const element=document.createElement('div');element.style.height='100px';document.body.append(element);return count;
      });
      await page.waitForFunction(before=>window.__sourcePhase.observers.find(state=>state.owner==='quarto').deliveries>before,before);await page.waitForTimeout(200);
      storageDenial=await page.evaluate(()=>{const trace=window.__sourcePhase;Storage.prototype.getItem=trace.originalGet;delete trace.originalGet;return {deniedReads:trace.deniedReads};});
      assert.equal(storageDenial.deniedReads,0,'wide-page callback preserves original width-first storage short circuit');
    }
    const final=await snapshot();
    const quartoReads=final.trace.bodyReads.filter(read=>read.stack.includes('/quarto-html/quarto.js'));
    assert.ok(quartoReads.length>0);
    if(mode==='source-phase')assert.ok(quartoReads.every(read=>read.depth===0),'candidate Quarto layout reads run outside native observer delivery');
    assert.deepEqual(failedRequests,[]);assert.deepEqual(consoleErrors,[]);
    assert.ok(errors.every(error=>error.message==='ResizeObserver loop completed with undelivered notifications.'),'retain raw RO errors and reject unrelated errors');
    const result={case:control.name,mode,sample,errors,failedRequests,consoleErrors,initial,resized,editorState,storageDenial,final};
    report.samples.push(result);console.log(JSON.stringify(result));await context.close();
  }
  report.summary=[...new Set(report.samples.map(sample=>sample.case))].flatMap(name=>['native','source-phase'].map(mode=>{
    const samples=report.samples.filter(sample=>sample.case===name&&sample.mode===mode);
    return {case:name,mode,loads:samples.length,errorLoads:samples.filter(sample=>sample.errors.length).length,errors:samples.flatMap(sample=>sample.errors).length};
  }));console.log(JSON.stringify({summary:report.summary},null,2));
  if(engine==='webkit')assert.ok(report.samples.some(sample=>sample.mode==='native'&&sample.errors.length),'matched native positive control must reproduce');
  assert.ok(report.samples.filter(sample=>sample.mode==='source-phase').every(sample=>sample.errors.length===0),'candidate must retain zero raw errors across all bounded behavior controls');
} finally {
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(browser)await browser.close();for(const server of Object.values(servers))await new Promise(resolve=>server.close(resolve));
}
