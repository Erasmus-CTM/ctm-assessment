// Browser-engine evidence; real SEB policy/device checks remain manual.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {chromium,webkit} from 'playwright';
import {control} from './p13-controls.mjs';

const engine=process.env.P13_BROWSER || 'chromium';
const lan=Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address;
assert.ok(lan,'non-loopback LAN address required');
const ports=JSON.parse(process.env.P13_PORTS || '{"plain":8765,"headers":8766}');
const browser=await ({chromium,webkit}[engine]).launch({headless:true,
  ...(engine==='chromium'?{executablePath:process.env.P13_BROWSER_EXECUTABLE||undefined,
    args:['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE '+lan]}:
    {proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,'+lan}})});
const version=browser.version(), report={engine,version,realSEB:false,results:[]};
if(process.env.P13_EXPECT_BROWSER_VERSION)assert.equal(version,process.env.P13_EXPECT_BROWSER_VERSION);
const prefix=process.env.P13_PATH_PREFIX || '/';
const timeout=180000;
async function ready(page) {
  await page.waitForFunction(()=>globalThis.qpyodideCellsReady && globalThis.qpyodideCellContainer?.cells[0]?.primaryUnit?.editor,null,{timeout});
  await control(page,'.qpyodide-button-run').first().waitFor();
}
async function code(page,text) {
  await page.evaluate(text=>qpyodideCellContainer.cells[0].primaryUnit.editor.setValue(text),text);
}
async function finished(page) {
  await page.waitForFunction(()=>globalThis.QP_L && globalThis.qpyodideCellContainer?.cells[0]?.primaryUnit?.runButton.title === globalThis.QP_L.runTitle && !globalThis.qpyodideCellContainer?.cells[0]?.primaryUnit?.runButton.disabled,null,{timeout});
}
async function run(page,text,expected) {
  await code(page,text);await control(page,'.qpyodide-button-run').first().click();
  await page.waitForFunction(expected=>document.querySelector('.qpyodide-output-code-area')?.textContent.includes(expected),expected,{timeout});
  await finished(page);
}
try {
  for(const isolated of [false,true]) {
    const base=isolated?`http://127.0.0.1:${ports.headers}${prefix}`:`http://${lan}:${ports.plain}${prefix}`;
    for(const name of ['index.html','nested/index.html']) {
      const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
      const evidence={base,name,isolated,external:[],errors:[],failed:[],responses:[]};
      context.on('requestfailed',r=>{if(!r.url().startsWith('blob:'))evidence.failed.push({url:r.url(),error:r.failure()?.errorText});});
      context.on('response',r=>{if(r.status()>=400)evidence.responses.push({url:r.url(),status:r.status()});});
      await context.route('**/*',route=>{
        if(new URL(route.request().url()).origin!==new URL(base).origin){evidence.external.push(route.request().url());return route.abort();}
        return route.continue();
      });
      await context.routeWebSocket('**/*',socket=>{evidence.external.push(socket.url());socket.close();});
      const pending=new Set();context.on('request',r=>pending.add(r.url()));context.on('requestfinished',r=>pending.delete(r.url()));context.on('requestfailed',r=>pending.delete(r.url()));
      const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
      try {
        await page.addInitScript(()=>{globalThis.__p13Ticks=0;globalThis.__p13MaxTickGap=0;let last=performance.now();setInterval(()=>{const now=performance.now();__p13MaxTickGap=Math.max(__p13MaxTickGap,now-last);last=now;__p13Ticks++;},20);});
        await page.goto(new URL(name,base).href,{waitUntil:"commit"});await ready(page);
        assert.equal(await page.evaluate(()=>qpyodideExamOutput),true);
        assert.equal(await page.evaluate(()=>qpyodidePreloadPackages),false);
        assert.equal(await page.evaluate(()=>crossOriginIsolated),isolated);
        assert.equal(await page.evaluate(()=>mainPyodide.isWorkerProxy),true);
        assert.equal(await page.evaluate(()=>isSecureContext),isolated);
        await run(page,'print("P13_RUN",6*7)','P13_RUN 42');
        const numpyCode='import numpy as np\nprint("P13_NUMPY",int(np.array([20,22]).sum()))';
        let numpyStart=Date.now();await run(page,numpyCode,'P13_NUMPY 42');evidence.numpyColdMs=Date.now()-numpyStart;
        numpyStart=Date.now();await run(page,numpyCode,'P13_NUMPY 42');evidence.numpyWarmMs=Date.now()-numpyStart;
        assert.equal(await page.evaluate(()=>typeof globalThis.loadPyodide),'undefined','no main-thread Pyodide loader');
        assert.equal(await page.evaluate(async()=>await MathExerciseRuntime.ensurePyodide()===mainPyodide),true);
        evidence.runaways=[];
        for(const program of ['while True: pass','while True: print("flood")','while True: print("")','while True:\n    try:\n        while True: pass\n    except KeyboardInterrupt: pass']) {
          const ticks=await page.evaluate(()=>__p13Ticks);
          await page.evaluate(()=>{globalThis.__p13BeforeProxy=mainPyodide;});
          await code(page,'P13_SESSION_MARKER=42\n'+program);await control(page,'.qpyodide-button-run').first().click();
          await page.waitForTimeout(300);
          assert.ok(await page.evaluate(()=>__p13Ticks)>ticks,'main thread stays responsive');
          await page.evaluate(()=>qpyodideCellContainer.cells[0].primaryUnit.editor.setValue('# preserved after Stop'));
          await page.evaluate(()=>{globalThis.__p13MaxTickGap=0;});
          const stop=Date.now();await control(page,'.qpyodide-button-run').first().click({noWaitAfter:true});
          await ready(page);await finished(page);
          const maxMainThreadGapMs=await page.evaluate(()=>__p13MaxTickGap);
          evidence.runaways.push({program,stopRecoveryMs:Date.now()-stop,maxMainThreadGapMs});
          assert.ok(maxMainThreadGapMs<2000,'Stop/restart must not stall the page event loop');
          assert.equal(await page.evaluate(()=>qpyodideCellContainer.cells[0].primaryUnit.editor.getValue()),'# preserved after Stop');
          const retained=await page.evaluate(()=>__p13BeforeProxy===mainPyodide);
          if(!retained)assert.ok((await control(page,'.qpyodide-output-code-area').first().textContent()).includes(await page.evaluate(()=>QP_L.abortedRestart)),'hard restart explains reset');
          await run(page,'print("P13_AFTER_STOP",42)\nprint("P13_SESSION_STATE", "P13_SESSION_MARKER" in globals())','P13_AFTER_STOP 42');
          assert.ok((await control(page,'.qpyodide-output-code-area').first().textContent()).includes('P13_SESSION_STATE '+(retained?'True':'False')));
          if(!isolated)assert.equal(retained,false);
        }
        if(isolated) {
          await code(page,'answer=input("P13_NAME: ")\nprint("P13_INPUT",answer)');
          await control(page,'.qpyodide-button-run').first().click();
          await control(page,'.qpyodide-terminal-input').fill('æ'.repeat(3000));
          await control(page,'.qpyodide-terminal-input').press('Enter');
          assert.ok(await control(page,'.qpyodide-terminal-input').evaluate(input=>input.validationMessage));
          await control(page,'.qpyodide-terminal-input').fill('Norsk æøå');
          await control(page,'.qpyodide-terminal-input').press('Enter');
          await page.waitForFunction(()=>document.querySelector('.qpyodide-output-code-area')?.textContent.includes('P13_INPUT Norsk æøå'),null,{timeout});
          await finished(page);
          await code(page,'input("P13_WAIT:")');await control(page,'.qpyodide-button-run').first().click();
          await control(page,'.qpyodide-terminal-input').waitFor();
          await control(page,'.qpyodide-button-run').first().click();await ready(page);await finished(page);
          assert.equal(await control(page,'.qpyodide-terminal-input').count(),0);
          await run(page,'print("P13_INPUT_STOP_OK")','P13_INPUT_STOP_OK');
          evidence.input='Unicode round trip, overlong UTF-8 rejected, waiting prompt Stop/recovery';
        } else {
          await code(page,'input("Unavailable")');
          assert.equal(await control(page,'.qpyodide-button-run').first().isDisabled(),true);
          assert.equal(await page.evaluate(()=>qpyodideInputState),'unavailable');
          evidence.input='explained unavailable gate on plain LAN HTTP';
        }
        await run(page,'"<script>while(true){}</script>"','<script>while(true){}</script>');
        assert.equal(await control(page,'.qpyodide-output-code-area script').count(),0);
        await run(page,'import matplotlib.pyplot as plt\nplt.plot([0,1],[0,1])\nplt.show()\nprint("P13_PNG")','P13_PNG');
        assert.ok(await control(page,'.qpyodide-output-graph-area img').count()>0,'PNG output is rendered');
        const saved='print("P13_SAVED_ANSWER",42)';await code(page,saved);
        // Shared answer saving is enabled by the exam profile. Wait for the
        // real debounce and reload without executing restored learner code.
        await page.waitForTimeout(1200);await page.reload({waitUntil:"commit"});await ready(page);
        assert.equal(await page.evaluate(()=>qpyodideCellContainer.cells[0].primaryUnit.editor.getValue()),saved);
        assert.ok(!await control(page,'.qpyodide-output-code-area').first().textContent().then(t=>t.includes('P13_SAVED_ANSWER 42')),'reload never autoruns saved code');
        evidence.restore='editor restored without autorun';
        await control(page,'.qpyodide-button-copy').first().click();
        await page.waitForFunction(()=>document.querySelector('.ctm-copy-status')?.textContent,null,{timeout});
        const selection=control(page,'.ctm-copy-dialog textarea');
        if(await selection.count()) {
          assert.equal(await selection.inputValue(),saved);
          await control(page,'.ctm-copy-dialog button').click();
        }
        await page.evaluate(()=>{
          Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('clipboard denied by test policy');}}});
          document.execCommand=()=>false;
        });
        await control(page,'.qpyodide-button-copy').first().click();
        assert.equal(await control(page,'.ctm-copy-dialog textarea').inputValue(),saved);
        await control(page,'.ctm-copy-dialog button').click();
        evidence.copy='copy control and denied-clipboard selectable fallback pass; cross-window SEB paste remains manual';
        const exported=await page.evaluate(()=>CTMExport.open().markdown);
        assert.ok(exported.includes(saved),'export retains the current answer');
        const denied=page.waitForEvent('download');
        await control(page,'#ctm-export-view button').filter({hasText:'Download .md'}).click();
        assert.ok(await (await denied).failure(),'download denied by browser context policy');
        assert.ok((await control(page,'#ctm-export-view textarea').inputValue()).includes(saved));
        evidence.export='current code remains selectable when downloads are denied';
        for(const key of ['external','errors','failed','responses'])assert.deepEqual(evidence[key],[],key);
        evidence.ok=true;
      } catch(error) {evidence.error=String(error.stack||error);evidence.pending=[...pending].slice(-20);
        evidence.startup=await page.evaluate(()=>({state:document.readyState,status:document.querySelector('#qpyodide-status-message-text')?.textContent,maxMainThreadGapMs:globalThis.__p13MaxTickGap,ticks:globalThis.__p13Ticks,cellsReady:globalThis.qpyodideCellsReady,hasEditor:!!globalThis.qpyodideCellContainer?.cells[0]?.primaryUnit?.editor})).catch(()=>null);
        console.error(JSON.stringify(evidence));throw error;}
      finally {report.results.push(evidence);await context.close();}
    }
  }
  // Secure loopback without server headers: observe COI activation (or its
  // bounded capability fallback), with network refusal covering SW subrequests.
  {
    const context=await browser.newContext({serviceWorkers:'allow'}),errors=[],external=[];
    context.on('request',r=>{if(new URL(r.url()).origin!==`http://127.0.0.1:${ports.plain}`)external.push(r.url());});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
    try {
      await page.goto(`http://127.0.0.1:${ports.plain}${prefix}index.html`,{waitUntil:"commit"});await ready(page);
      await run(page,'print("P13_COI_OK")','P13_COI_OK');
      assert.ok(navigations<=3,'COI must not reload indefinitely');
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      report.results.push({case:'COI service worker',prefix,navigations,...await page.evaluate(()=>({isolated:crossOriginIsolated,inputState:qpyodideInputState})),ok:true});
    } finally {await context.close();}
  }
  {
    const context=await browser.newContext({serviceWorkers:'block'}),errors=[];
    await context.addInitScript(()=>{
      const NativeWorker=globalThis.Worker;
      globalThis.Worker=class extends NativeWorker {
        constructor(url,options){if(String(url).includes('pyodide-worker-core.js')&&!globalThis.__p13AllowWorker)throw new Error('P13 intentionally blocked worker');super(url,options);}
      };
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    try {
      await page.goto(`http://127.0.0.1:${ports.headers}${prefix}index.html`,{waitUntil:"commit"});
      await page.waitForFunction(()=>globalThis.qpyodideCellContainer?.cells[0]?.primaryUnit?.editor,null,{timeout});
      await page.waitForFunction(()=>document.querySelector('#qpyodide-status-message-text')?.textContent.includes('P13 intentionally blocked worker'),null,{timeout});
      await code(page,'# editable when worker is blocked');
      assert.ok((await page.evaluate(()=>CTMExport.open().markdown)).includes('# editable when worker is blocked'));
      assert.equal(await control(page,'.qpyodide-button-run').first().isDisabled(),true);
      assert.deepEqual(errors,[]);
      await page.evaluate(()=>{globalThis.__p13AllowWorker=true;});
      await control(page,'.ctm-python-status button','Retry').click();
      await ready(page);await run(page,'print("P13_RETRY_OK")','P13_RETRY_OK');
      assert.equal(await control(page,'.ctm-python-status').count(),1,'Retry retains one shared status owner');
      assert.deepEqual(errors,[]);
      report.results.push({case:'worker blocked and explicit Retry',prefix,editing:true,export:true,recovered:true,ok:true});
    } finally {await context.close();}
  }
} finally {
  fs.writeFileSync(process.env.P13_REPORT || '/tmp/p13-seb-profile.json',JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
