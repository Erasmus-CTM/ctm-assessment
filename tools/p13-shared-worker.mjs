import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(process.env.P13_MIXED_SITE),report=[];
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml'};
async function serve(isolated){
  const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream',...(isolated?{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}:{})});fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));return server;
}
const lan=Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address;
assert.ok(lan);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE '+lan]});
try{
 for(const isolated of [false,true]){
  const server=await serve(isolated),base=`http://${isolated?'127.0.0.1':lan}:${server.address().port}`;
  const context=await browser.newContext({serviceWorkers:'block'}),errors=[],external=[];
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==base){external.push(r.request().url());return r.abort();}return r.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{globalThis.__p13Workers=[];const NativeWorker=Worker;globalThis.Worker=class extends NativeWorker{constructor(url,options){super(url,options);__p13Workers.push(String(url));}};globalThis.__p13Results=[];document.addEventListener('ctm:result',e=>__p13Results.push(e.detail));});
  try{
    await page.goto(base+'/index.html');
    await page.waitForFunction(()=>qpyodideCellsReady&&document.querySelector('.py-exercise-check')&&!document.querySelector('.py-exercise-check').disabled,null,{timeout:180000});
    const math=page.locator('.math-exercise-cell[data-label="math-proof"]'),loop=page.locator('.math-exercise-cell[data-label="loop-proof"]');
    await math.locator('.math-input').fill('4');await math.locator('.math-check-btn').click();
    await math.locator('.math-fb-ok').waitFor({timeout:180000});
    await page.locator('.py-exercise-check').click();
    await page.waitForFunction(()=>__p13Results.filter(x=>x.id==='python-proof').length===1,null,{timeout:180000});
    assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE_AUTHORED_SENTINEL'));
    assert.equal(await page.evaluate(async()=>await MathExerciseRuntime.ensurePyodide()===mainPyodide),true);
    assert.equal(await page.evaluate(()=>__p13Workers.filter(x=>x.includes('pyodide-worker-core.js')).length),1);
    const count=await page.evaluate(()=>__p13Results.length);
    await loop.locator('.math-input').fill('1');await loop.locator('.math-check-btn').click();
    await loop.locator('.math-stop-btn').waitFor({timeout:180000});
    await page.locator('.py-exercise-check').click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>__p13Results.length),count,'queued check publishes no result');
    await loop.locator('.math-stop-btn').click();
    await page.waitForFunction(()=>!document.querySelector('.py-exercise-check').disabled,null,{timeout:180000});
    await loop.locator('.math-fb-err').waitFor();
    assert.equal(await page.evaluate(()=>__p13Results.length),count,'Stop cannot grade active or queued work');
    await page.waitForFunction(()=>qpyodideCellsReady,null,{timeout:180000});
    await page.evaluate(()=>qpyodideCellContainer.cells[0].primaryUnit.editor.setValue('print("IDE_AFTER_SHARED_STOP")'));
    await page.locator('.qpyodide-button-run').first().click();
    await page.waitForFunction(()=>document.querySelector('.qpyodide-output-code-area')?.textContent.includes('IDE_AFTER_SHARED_STOP'),null,{timeout:180000});
    assert.ok(!(await page.evaluate(()=>CTMExport.open().markdown)).includes('PRIVATE_AUTHORED_SENTINEL'));
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    report.push({isolated,workerCount:await page.evaluate(()=>__p13Workers.filter(x=>x.includes('pyodide-worker-core.js')).length),verdictsBeforeStop:count,verdictsAfterStop:await page.evaluate(()=>__p13Results.length),ok:true});
  }finally{await context.close();await new Promise(resolve=>server.close(resolve));}
 }
}finally{fs.writeFileSync(process.env.P13_MIXED_REPORT||'/tmp/p13-shared-worker.json',JSON.stringify({browser:browser.version(),results:report},null,2)+'\n');await browser.close();}
