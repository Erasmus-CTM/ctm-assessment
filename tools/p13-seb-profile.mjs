// Browser-engine evidence; real SEB policy/device checks remain manual.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {chromium,webkit} from 'playwright';

const engine=process.env.P13_BROWSER || 'chromium';
const browser=await ({chromium,webkit}[engine]).launch({headless:true,
  ...(engine==='chromium'?{executablePath:process.env.P13_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--no-proxy-server']}: {})});
const version=browser.version(), report={engine,version,realSEB:false,results:[]};
if(process.env.P13_EXPECT_BROWSER_VERSION)assert.equal(version,process.env.P13_EXPECT_BROWSER_VERSION);
const lan=Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address;
assert.ok(lan,'non-loopback LAN address required');
const ports=JSON.parse(process.env.P13_PORTS || '{"plain":8765,"headers":8766}');
const prefix=process.env.P13_PATH_PREFIX || '/';
const timeout=180000;
async function ready(page) {
  await page.waitForFunction(()=>qpyodideCellsReady && qpyodideCellContainer.cells[0]?.primaryUnit?.editor,null,{timeout});
  await page.locator('.qpyodide-button-run').first().waitFor();
}
async function code(page,text) {
  await page.evaluate(text=>qpyodideCellContainer.cells[0].primaryUnit.editor.setValue(text),text);
}
async function finished(page) {
  await page.waitForFunction(()=>qpyodideCellContainer.cells[0].primaryUnit.runButton.title === QP_L.runTitle && !qpyodideCellContainer.cells[0].primaryUnit.runButton.disabled,null,{timeout});
}
async function run(page,text,expected) {
  await code(page,text);await page.locator('.qpyodide-button-run').first().click();
  await page.waitForFunction(expected=>document.querySelector('.qpyodide-output-code-area')?.textContent.includes(expected),expected,{timeout});
  await finished(page);
}
try {
  for(const isolated of [false,true]) {
    const base=isolated?`http://127.0.0.1:${ports.headers}${prefix}`:`http://${lan}:${ports.plain}${prefix}`;
    for(const name of ['index.html','nested/index.html']) {
      const context=await browser.newContext({serviceWorkers:'block'});
      const evidence={base,name,isolated,external:[],errors:[],failed:[],responses:[]};
      context.on('requestfailed',r=>evidence.failed.push({url:r.url(),error:r.failure()?.errorText}));
      context.on('response',r=>{if(r.status()>=400)evidence.responses.push({url:r.url(),status:r.status()});});
      await context.route('**/*',route=>{
        if(new URL(route.request().url()).origin!==new URL(base).origin){evidence.external.push(route.request().url());return route.abort();}
        return route.continue();
      });
      await context.routeWebSocket('**/*',socket=>{evidence.external.push(socket.url());socket.close();});
      const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
      try {
        await page.addInitScript(()=>{globalThis.__p13Ticks=0;setInterval(()=>__p13Ticks++,20);});
        await page.goto(new URL(name,base).href);await ready(page);
        assert.equal(await page.evaluate(()=>qpyodideExamOutput),true);
        assert.equal(await page.evaluate(()=>qpyodidePreloadPackages),false);
        assert.equal(await page.evaluate(()=>crossOriginIsolated),isolated);
        assert.equal(await page.evaluate(()=>mainPyodide.isWorkerProxy),true);
        assert.equal(await page.evaluate(()=>isSecureContext),isolated);
        await run(page,'print("P13_RUN",6*7)','P13_RUN 42');
        await run(page,'import numpy as np\nprint("P13_NUMPY",int(np.array([20,22]).sum()))','P13_NUMPY 42');
        const ticks=await page.evaluate(()=>__p13Ticks);
        await code(page,'while True: pass');await page.locator('.qpyodide-button-run').first().click();
        await page.waitForTimeout(300);
        assert.ok(await page.evaluate(()=>__p13Ticks)>ticks,'main thread stays responsive');
        await page.evaluate(()=>qpyodideCellContainer.cells[0].primaryUnit.editor.setValue('# preserved after Stop'));
        const stop=Date.now();await page.locator('.qpyodide-button-run').first().click();
        await ready(page);await finished(page);
        evidence.stopRecoveryMs=Date.now()-stop;
        assert.equal(await page.evaluate(()=>qpyodideCellContainer.cells[0].primaryUnit.editor.getValue()),'# preserved after Stop');
        await run(page,'print("P13_AFTER_STOP",42)','P13_AFTER_STOP 42');
        if(isolated) {
          await code(page,'answer=input("P13_NAME: ")\nprint("P13_INPUT",answer)');
          await page.locator('.qpyodide-button-run').first().click();
          await page.locator('.qpyodide-terminal-input').fill('Norsk æøå');
          await page.locator('.qpyodide-terminal-input').press('Enter');
          await page.waitForFunction(()=>document.querySelector('.qpyodide-output-code-area')?.textContent.includes('P13_INPUT Norsk æøå'),null,{timeout});
          await finished(page);
          evidence.input='Unicode round trip';
        } else evidence.input='unsupported; no isolation on plain LAN HTTP';
        await run(page,'"<script>while(true){}</script>"','<script>while(true){}</script>');
        assert.equal(await page.locator('.qpyodide-output-code-area script').count(),0);
        await run(page,'import matplotlib.pyplot as plt\nplt.plot([0,1],[0,1])\nplt.show()\nprint("P13_PNG")','P13_PNG');
        assert.ok(await page.locator('.qpyodide-output-graph-area img').count()>0,'PNG output is rendered');
        const saved='print("P13_SAVED_ANSWER",42)';await code(page,saved);
        // Shared answer saving is enabled by the exam profile. Wait for the
        // real debounce and reload without executing restored learner code.
        await page.waitForTimeout(1200);await page.reload();await ready(page);
        assert.equal(await page.evaluate(()=>qpyodideCellContainer.cells[0].primaryUnit.editor.getValue()),saved);
        assert.ok(!await page.locator('.qpyodide-output-code-area').first().textContent().then(t=>t.includes('P13_SAVED_ANSWER 42')),'reload never autoruns saved code');
        evidence.restore='editor restored without autorun';
        await page.locator('.qpyodide-button-copy').first().click();
        await page.waitForFunction(()=>document.querySelector('.ctm-copy-status')?.textContent,null,{timeout});
        const selection=page.locator('.ctm-copy-dialog textarea');
        if(await selection.count()) {
          assert.equal(await selection.inputValue(),saved);
          await page.locator('.ctm-copy-dialog button').click();
        }
        evidence.copy='copy control completed or supplied selectable text; cross-window SEB paste remains manual';
        const exported=await page.evaluate(()=>CTMExport.open().markdown);
        assert.ok(exported.includes(saved),'export retains the current answer');
        evidence.export='current code present in the export view';
        for(const key of ['external','errors','failed','responses'])assert.deepEqual(evidence[key],[],key);
        evidence.ok=true;
      } catch(error) {evidence.error=String(error.stack||error);throw error;}
      finally {report.results.push(evidence);await context.close();}
    }
  }
} finally {
  fs.writeFileSync(process.env.P13_REPORT || '/tmp/p13-seb-profile.json',JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
