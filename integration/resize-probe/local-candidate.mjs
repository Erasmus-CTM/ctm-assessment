// Local owned-source counterfactual. Quarto/Monaco source and constructors stay native.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import http from 'node:http';
import * as playwright from 'playwright';
import {serve} from '../../tools/compare-browser.mjs';

const fixture=path.resolve(process.env.CTM_RESIZE_FIXTURE);
const output=path.resolve(process.env.CTM_RESIZE_REPORT);
const helper=fs.readFileSync(path.resolve(process.env.CTM_LAYOUT_SOURCE),'utf8');
const sha=text=>createHash('sha256').update(text).digest('hex');
const helperHash='2eb6721c8e750a2214997af2f0447511255363e22f9160a0fadc2381c26a80bd';
assert.equal(sha(helper),helperHash,'exact canonical ctm-libs helper');
const engine=process.env.CTM_BROWSER||'webkit';assert.ok(['chromium','firefox','webkit'].includes(engine));
const html=fs.readFileSync(path.join(fixture,'index.html'),'utf8');
const quartoPath='site_libs/quarto-html/quarto.js';
const quarto=fs.readFileSync(path.join(fixture,quartoPath),'utf8');
assert.equal(sha(quarto),'14589dacd0cf625c4e6891269681a0a8e20aaa5390864ca6a69f2fff1514719a');
assert.ok(!helper.includes('</script>'));
const helperTag='<script>'+helper+'</script>';
const beforeTag='<script src="site_libs/quarto-contrib/ctm-reveal-0.9.0/ctm-reveal.js"></script>';
assert.equal(html.split(beforeTag).length,2);const matchedHtml=html.replace(beforeTag,helperTag+'\n'+beforeTag);
assert.equal(matchedHtml.replace(helperTag+'\n',''),html,'only one identical helper script tag is added to every control');
function once(source,before,after){assert.equal(source.split(before).length,2,'exact owned source span occurs once: '+before);return source.replace(before,after);}
const readyFiles=[
  ['ctm-reveal-0.9.0/ctm-reveal.js','d7bb0cecd7147810aa8f0aeeb15a3ca6d9b37959aefed6248efacc1aca355500',"  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);\n  else start();",'  CTMLayout.ready(start);'],
  ['ctm-store-0.9.0/ctm-store.js','ecb646274c3c6dda5e3f3a790350839dd0e8b3c5be0d53d9031d2b76f35e7d41',"  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();",'  CTMLayout.ready(start);'],
  ['ctm-progress-0.9.0/ctm-progress.js','8964f91791b82527f5ff10d9b3f208bd54243bd83fea62ef92e2e9e1fcf1a247','  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once: true});\n  else init();','  CTMLayout.ready(init);']
];
const editorFiles=[
  ['py-exercise-0.5.0/py-exercise.js','ab429398278e1fd364ec8ffafe4faf5a2838ada4911cd65ff56ef40c5826740b',[
    ['        automaticLayout: true,','        automaticLayout: false,'],
    ['      var updateHeight = function () {\n        var h = Math.max(80, editor.getContentHeight());\n        editorContainer.style.height = h + \'px\';\n        editor.layout();\n      };','      var ctmEditorLayout = CTMLayout.fitEditor(editor, editorContainer, {minHeight: 80});'],
    ['      editor.onDidContentSizeChange(updateHeight);','      // Shared ctm-libs owns the content-size subscription.'],
    ['      updateHeight();','      ctmEditorLayout.request();']
  ]],
  ['pyodide-interaktiv-1.10.0/qpyodide-cell-classes.js','7f9308aa0e55cd76eb4d96ebc7dc19bfc0109346cf072be5995e8949c468f055',[
    ['        automaticLayout: true,           // Works wonderfully with RevealJS','        automaticLayout: false,          // Shared ctm-libs owns explicit layout.'],
    ['      const updateHeight = () => {\n        const contentHeight = thiz.editor.getContentHeight();\n        thiz.editorDiv.style.height = `${contentHeight}px`;\n        thiz.editor.layout();\n      };','      const ctmEditorLayout = CTMLayout.fitEditor(thiz.editor, thiz.editorDiv);'],
    ['      thiz.editor.onDidContentSizeChange(updateHeight);','      // Shared ctm-libs owns the content-size subscription.'],
    ['      updateHeight();','      ctmEditorLayout.request();']
  ]]
];
const marginHtml='<button id="probe-reader-toggle" class="quarto-reader-toggle" type="button" onclick="quartoToggleReader()">Reader</button><div id="probe-margin-box" style="position:relative;height:100px"><div id="probe-margin-a" class="aside" style="position:absolute;top:0;height:40px;margin:0">Margin A</div><div id="probe-margin-b" class="aside" style="position:absolute;top:10px;height:40px;margin:0">Margin B</div></div>';
const report={engine,helperHead:'670fee5431e743889bfcbc6e4c1ef1853482387d',helperSha256:sha(helper),fixtureHtmlSha256:sha(html),quartoSha256:sha(quarto),
  modes:{native:'byte-original HTML and owned sources, no helper',original:'matched canonical helper inline but inactive',ready:'shared parsed-content initialization only',editors:'shared supported explicit editor layout only',both:'both owned integrations'},samples:[]};
fs.mkdirSync(output,{recursive:true});const servers={},origins={};let browser;
try{
  for(const mode of ['native','original','ready','editors','both'])for(const variant of ['actual','margins','transform']){
    const key=mode+'-'+variant,copy=output+'-'+key;fs.cpSync(fixture,copy,{recursive:true});
    let content=mode==='native'?html:matchedHtml;
    if(variant==='margins')content=content.replace('</body>',marginHtml+'</body>');
    if(variant==='transform')content=content.replace('</body>','<style>body{transform:scale(.5);transform-origin:top left}</style></body>');
    fs.writeFileSync(path.join(copy,'index.html'),content);
    for(const [relative,hash,before,after] of readyFiles){const file=path.join(copy,'site_libs/quarto-contrib',relative),source=fs.readFileSync(file,'utf8');assert.equal(sha(source),hash);if(['ready','both'].includes(mode))fs.writeFileSync(file,once(source,before,after));}
    for(const [relative,hash,spans] of editorFiles){const file=path.join(copy,'site_libs/quarto-contrib',relative),source=fs.readFileSync(file,'utf8');assert.equal(sha(source),hash);let changed=source;for(const [before,after] of spans)changed=once(changed,before,after);if(['editors','both'].includes(mode))fs.writeFileSync(file,changed);}
    assert.equal(fs.readFileSync(path.join(copy,quartoPath),'utf8'),quarto);
    servers[key]=await serve({fixture:copy},true,'require-corp');origins[key]='http://127.0.0.1:'+servers[key].address().port;
  }
  browser=await playwright[engine].launch({headless:true});report.browserVersion=browser.version();
  // Hold an actual HTTP parser inside an inert script, then append to its
  // existing text node. No timer controls product initialization.
  let streamResponse;
  const parserServer=http.createServer((request,response)=>{streamResponse=response;response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});response.write('<!doctype html><script>'+helper+'</script><script>window.parserReady=[];CTMLayout.ready(()=>parserReady.push({state:document.readyState,text:document.getElementById("ctm-store-manifest").textContent}));</script><main id="parsed-content">complete CTM content</main><script type="application/json" id="ctm-store-manifest">{"v":');});
  await new Promise(resolve=>parserServer.listen(0,'127.0.0.1',resolve));servers.parser=parserServer;
  const parserPage=await browser.newPage();await parserPage.goto('http://127.0.0.1:'+parserServer.address().port,{waitUntil:'commit'});
  await parserPage.waitForFunction(()=>document.getElementById('ctm-store-manifest')?.textContent==='{"v":');
  assert.deepEqual(await parserPage.evaluate(()=>parserReady),[]);streamResponse.write('1}');
  await parserPage.waitForFunction(()=>parserReady.length===1);
  report.incrementalParser=await parserPage.evaluate(()=>({state:document.readyState,ready:parserReady,content:document.getElementById('parsed-content').textContent}));
  assert.equal(report.incrementalParser.state,'loading');assert.equal(report.incrementalParser.ready[0].state,'loading');assert.equal(report.incrementalParser.ready[0].text,'{"v":1}');
  streamResponse.end('</script></body>');await parserPage.waitForLoadState('load');assert.equal(await parserPage.evaluate(()=>parserReady.length),1);await parserPage.close();
  console.log(JSON.stringify({incrementalParser:report.incrementalParser}));
  const cases=[
    {name:'startup',variant:'actual',reader:false,width:1280,repeats:12,modes:['native','original','ready','both']},
    {name:'editors',variant:'actual',reader:false,width:1280,repeats:4,modes:['native','original','editors','both'],editors:true},
    {name:'reader-desktop',variant:'actual',reader:true,width:1280,repeats:4,modes:['original','both']},
    {name:'reader-mobile',variant:'actual',reader:true,width:390,repeats:4,modes:['original','both']},
    {name:'reader-transform',variant:'transform',reader:true,width:1280,repeats:2,modes:['original','both'],editors:true},
    {name:'margins-reader-resize',variant:'margins',reader:true,width:1280,repeats:4,modes:['original','both'],resize:390},
    {name:'after-start-storage-denial',variant:'actual',reader:false,width:1280,repeats:2,modes:['original','both'],denial:true}
  ];
  for(const control of cases)for(let sample=0;sample<control.repeats;sample++)for(const mode of control.modes){
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:control.width,height:900}});
    await context.addInitScript(({reader})=>{if(window!==top)return;localStorage.setItem('quarto-reader-mode',String(reader));
      window.__localLayout={nativeObserver:ResizeObserver,errors:[],bodyReads:[]};
      addEventListener('error',event=>__localLayout.errors.push({message:event.message,time:performance.now()}));
      const original=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...args){const rect=Reflect.apply(original,this,args);if(this===document.body&&__localLayout.bodyReads.length<120)__localLayout.bodyReads.push({width:rect.width,height:rect.height,time:performance.now(),stack:String(new Error().stack||'').slice(0,800)});return rect;};
    },{reader:control.reader});
    const page=await context.newPage(),pageerrors=[],failedRequests=[],consoleErrors=[];page.setDefaultTimeout(90000);
    page.on('pageerror',error=>pageerrors.push({message:error.message,stack:error.stack}));page.on('requestfailed',request=>failedRequests.push({url:request.url(),failure:request.failure()}));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    const response=await page.goto(origins[mode+'-'+control.variant]+'/fixture/index.html',{waitUntil:'load'});assert.equal(response.status(),200);assert.equal(response.headers()['cross-origin-embedder-policy'],'require-corp');
    await page.locator('.ctm-save-bar').waitFor({state:'visible'});await page.waitForTimeout(1100);
    const snapshot=()=>page.evaluate(()=>({isolated:crossOriginIsolated,store:!!window.CTMStore,helper:window.CTMLayout?.version,nativeObserver:ResizeObserver===__localLayout.nativeObserver,
      reader:localStorage.getItem('quarto-reader-mode'),toggles:[...document.querySelectorAll('.quarto-reader-toggle')].map(el=>el.classList.contains('reader')),
      body:{width:document.body.getBoundingClientRect().width,height:document.body.getBoundingClientRect().height},
      inputs:document.querySelectorAll('input.math-input').length,answers:document.querySelectorAll('.math-exercise-cell > .math-saved-answer').length,results:document.querySelectorAll('.math-exercise-cell > .math-saved-result').length,
      progress:document.querySelectorAll('.ctm-progress').length,margin:document.getElementById('probe-margin-b')?.style.marginTop,errors:__localLayout.errors,reads:__localLayout.bodyReads}));
    const initial=await snapshot();assert.equal(initial.isolated,true);assert.equal(initial.store,true);assert.equal(initial.helper,mode==='native'?undefined:1);assert.equal(initial.nativeObserver,true);
    assert.equal(initial.inputs,7);assert.equal(initial.answers,7);assert.equal(initial.results,7);assert.equal(initial.progress,2);
    const expectedReader=control.reader&&control.width>=990&&control.variant!=='transform';assert.equal(initial.reader,String(expectedReader));assert.ok(initial.toggles.every(active=>active===expectedReader));
    let resized=null,editorState=null,editorStages=[],editorStartErrors=null,disposal=null,denial=null;
    if(control.resize){assert.deepEqual(initial.toggles,[true]);assert.equal(initial.margin,'30px');await page.setViewportSize({width:390,height:900});await page.waitForTimeout(250);resized=await snapshot();assert.equal(resized.reader,'false');assert.deepEqual(resized.toggles,[false]);assert.equal(resized.margin,'30px');}
    if(control.editors){
      await page.waitForFunction(()=>window.monaco?.editor?.getEditors?.().length===2&&window.qpyodideCellsReady&&window.qpyodideStartupPhaseDone);
      editorStartErrors=await page.evaluate(()=>__localLayout.errors.length);
      await page.getByRole('tab',{name:'Code',exact:true}).click();await page.waitForTimeout(200);
      const capture=()=>page.evaluate(()=>monaco.editor.getEditors().map(editor=>{const node=editor.getContainerDomNode();return{value:editor.getValue(),contentHeight:editor.getContentHeight(),layout:editor.getLayoutInfo(),container:{width:node.clientWidth,height:node.clientHeight,styleHeight:node.style.height,display:getComputedStyle(node).display},rectWidth:node.getBoundingClientRect().width};}));
      const record=async(name,hidden=false)=>{const states=await capture();for(const state of states){if(hidden){assert.equal(state.container.width,0);assert.equal(state.layout.width,5);assert.equal(state.layout.height,5);}else{assert.ok(state.layout.width>5&&state.layout.height>5);assert.ok(Math.abs(state.layout.width-state.container.width)<=1);assert.ok(Math.abs(state.layout.height-state.container.height)<=1);assert.ok(parseFloat(state.container.styleHeight)>=state.contentHeight);if(control.variant==='transform')assert.ok(Math.abs(state.rectWidth-state.container.width*.5)<=1,'editor layout retains untransformed content dimensions');}}editorStages.push({name,states});};
      let values;
      for(const [name,count,long] of [['grow',16,false],['shrink',2,false],['empty',0,false],['long-line',1,true]]){
        values=await page.evaluate(({count,long})=>monaco.editor.getEditors().map((editor,index)=>{const value=long?'print("'+String(index).repeat(300)+'")':('print("local '+index+'")\n').repeat(count);editor.setValue(value);return value;}),{count,long});await page.waitForTimeout(200);await record(name);
      }
      for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.waitForTimeout(200);await record('width-'+width);}
      await page.evaluate(()=>monaco.editor.getEditors().forEach(editor=>{const node=editor.getContainerDomNode();node.dataset.probeDisplay=node.style.display;node.style.display='none';}));await page.waitForTimeout(200);await record('both-hidden',true);
      await page.evaluate(()=>monaco.editor.getEditors().forEach(editor=>{const node=editor.getContainerDomNode();node.style.display=node.dataset.probeDisplay;delete node.dataset.probeDisplay;}));await page.waitForTimeout(200);await record('both-visible');
      await page.getByRole('tab',{name:'Scalar',exact:true}).click();await page.getByRole('tab',{name:'Code',exact:true}).click();await page.waitForTimeout(200);
      await record('tab-roundtrip');editorState=await capture();assert.deepEqual(editorState.map(state=>state.value),values);
      await page.evaluate(()=>{__localLayout.disposals=monaco.editor.getEditors().map(editor=>{const node=editor.getContainerDomNode(),row={afterDispose:false,layoutAfterDispose:0,height:null,node},original=editor.layout;editor.layout=function(...args){if(row.afterDispose)row.layoutAfterDispose++;return Reflect.apply(original,this,args);};editor.setValue('print("queued disposal")\n'.repeat(30));editor.dispose();row.afterDispose=true;row.height=node.style.height;return row;});});
      await page.waitForTimeout(250);disposal=await page.evaluate(()=>__localLayout.disposals.map(row=>({layoutAfterDispose:row.layoutAfterDispose,heightAtDispose:row.height,heightAfter:row.node.style.height})));for(const row of disposal){assert.equal(row.layoutAfterDispose,0);assert.equal(row.heightAfter,row.heightAtDispose);}
    }
    if(control.denial){
      await page.evaluate(()=>{__localLayout.deniedReads=0;__localLayout.originalGet=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='quarto-reader-mode'){__localLayout.deniedReads++;throw new DOMException('diagnostic storage denial','SecurityError');}return Reflect.apply(__localLayout.originalGet,this,arguments);};const element=document.createElement('div');element.style.height='100px';document.body.append(element);});
      await page.waitForTimeout(200);denial=await page.evaluate(()=>{Storage.prototype.getItem=__localLayout.originalGet;return{deniedReads:__localLayout.deniedReads};});assert.equal(denial.deniedReads,0);
    }
    const final=await snapshot();assert.ok(final.reads.some(read=>read.stack.includes('/quarto-html/quarto.js')),'unchanged native Quarto callback still reads BODY');
    assert.deepEqual(failedRequests,[]);assert.deepEqual(consoleErrors,[]);assert.ok([...pageerrors,...final.errors].every(error=>error.message==='ResizeObserver loop completed with undelivered notifications.'));
    const result={case:control.name,mode,sample,pageerrors,failedRequests,consoleErrors,initial,resized,editorState,editorStages,editorStartErrors,interactionErrors:editorStartErrors===null?null:final.errors.length-editorStartErrors,disposal,denial,final};report.samples.push(result);console.log(JSON.stringify(result));await context.close();
  }
  report.summary=cases.flatMap(control=>control.modes.map(mode=>{const s=report.samples.filter(s=>s.case===control.name&&s.mode===mode);return{case:control.name,mode,loads:s.length,pageerrorLoads:s.filter(s=>s.pageerrors.length).length,windowErrorLoads:s.filter(s=>s.final.errors.length).length};}));console.log(JSON.stringify({summary:report.summary},null,2));
  assert.ok(report.samples.filter(s=>s.mode==='editors').every(s=>s.interactionErrors===0),'explicit editor integration must retain zero new raw errors after the measured editor boundary');
  if(engine==='webkit'){
    assert.ok(report.samples.some(s=>s.mode==='native'&&s.initial.errors.length),'byte-original early startup signal must reproduce before interactions');
    assert.ok(report.samples.some(s=>s.mode==='original'&&s.initial.errors.length),'matched inline inactive early startup signal must reproduce before interactions');
  }
  assert.ok(report.samples.filter(s=>s.mode==='both').every(s=>s.pageerrors.length===0&&s.final.errors.length===0),'shared local pair must retain zero raw errors in both collectors');
}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();for(const server of Object.values(servers))await new Promise(resolve=>server.close(resolve));}
