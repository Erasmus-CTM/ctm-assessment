// DIAGNOSTIC ONLY: restart probes for the WebKit Stop stall investigation.
//   micro         a worker allocates a 16/256 MB WebAssembly.Memory, spins (or
//                 idles) in wasm, is terminated; 8 rounds (no Pyodide at all)
//   runaway       8x Run `while True: pass` + Stop on plain LAN /index.html
//   idle          8x mainPyodide.restart() with no program running
// Backends: P13_PROBE_BROWSER=webkit|chromium (Playwright) or safari
// (safaridriver, W3C WebDriver; no Web Inspector protocol involved).
import os from 'node:os';
import * as p13diag from './p13-diag.mjs';

const backend=process.env.P13_PROBE_BROWSER||'webkit';
const lan=Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address;
const base=`http://${lan}:${process.env.P13_PROBE_PORT||8765}/`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const consoleLines=[];

async function playwrightDriver(name){
  const pw=await import('playwright');
  const browser=await pw[name].launch({headless:true,...(name==='webkit'?{proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,'+lan}}:{executablePath:process.env.P13_BROWSER_EXECUTABLE||undefined,args:['--no-proxy-server','--no-sandbox']})});
  let context,page;
  return {
    version:browser.version(),
    async open(url){
      if(context)await context.close();
      context=await browser.newContext({serviceWorkers:'block'});page=await context.newPage();
      page.on('console',m=>{if(/ready after/.test(m.text()))consoleLines.push([Date.now(),m.text()]);});
      await page.goto(url,{waitUntil:'load'});
    },
    exec:(fn,arg)=>page.evaluate(fn,arg),
    async click(selector){
      const point=await page.evaluate(selector=>{const e=document.querySelector(selector);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},selector);
      await page.mouse.click(point.x,point.y);
    },
    close:()=>browser.close()
  };
}
async function safariDriver(){
  const driver='http://127.0.0.1:4444',ELEMENT='element-6066-11e4-a52f-4a5b4b2e2b67';let session;
  async function wd(method,path,body){
    const t=Date.now(),response=await fetch(driver+path,{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body),signal:AbortSignal.timeout(180000)});
    const json=await response.json(),ms=Date.now()-t;
    if(ms>3000)console.log('[probe] slow WebDriver command',path.split('/').slice(3).join('/'),ms,'ms');
    if(json.value&&json.value.error)throw new Error(json.value.error+': '+json.value.message);
    return json.value;
  }
  session=(await wd('POST','/session',{capabilities:{alwaysMatch:{browserName:'safari'}}})).sessionId;
  const exec=(fn,arg)=>wd('POST',`/session/${session}/execute/sync`,{script:`return (${fn}).apply(null, arguments)`,args:[arg]});
  return {
    version:await exec(()=>navigator.userAgent),
    async open(url){await wd('POST',`/session/${session}/url`,{url});},
    exec,
    async click(selector){
      const element=await wd('POST',`/session/${session}/execute/sync`,{script:'return qpyodideCellContainer.cells[0].primaryUnit.runButton',args:[]});
      try {await wd('POST',`/session/${session}/element/${element[ELEMENT]}/click`,{});}
      catch(error){console.log('[probe] WebDriver click failed, using element.click():',String(error).slice(0,120));await exec(()=>qpyodideCellContainer.cells[0].primaryUnit.runButton.click());}
    },
    close:()=>wd('DELETE',`/session/${session}`).catch(()=>{})
  };
}

const readyFn=before=>!!(globalThis.qpyodideCellsReady&&globalThis.mainPyodide&&globalThis.mainPyodide!==globalThis[before]&&globalThis.QP_L&&qpyodideCellContainer.cells[0].primaryUnit.runButton.title===QP_L.runTitle&&!qpyodideCellContainer.cells[0].primaryUnit.runButton.disabled);
async function until(b,fn,arg,limit,what){
  const deadline=Date.now()+limit;
  for(;;){if(await b.exec(fn,arg))return;if(Date.now()>deadline)throw new Error('Timeout waiting for '+what);await sleep(100);}
}
// Phases (P13_PROBE_PHASES): patched = 8x runaway Stop against a copy of the
// site whose worker sets a non-shared interrupt buffer (port 8769); runaway /
// idle = the shipped worker (port 8765); micro = wasm workers on 127.0.0.1
// (a separate site, so real Safari gives it its own WebContent process).
const phases=(process.env.P13_PROBE_PHASES||'patched,runaway,idle,micro').split(',');
const results={backend,micro:[],runaway:[],idle:[],patched:[]};
const b=backend==='safari'?await safariDriver():await playwrightDriver(backend);
console.log('[probe] browser',backend,b.version);
p13diag.startSampler(2000);
try {
  for(const phase of phases) {
    if(phase==='micro') {
      for(const variant of [{label:'loop-256MB',kind:'loop',pages:4096},{label:'idle-256MB',spin:false,pages:4096},{label:'jscall-dense-256MB',kind:'dense',pages:4096},{label:'jscall-sparse-256MB',kind:'sparse',pages:4096}]) {
        p13diag.setLabel('micro '+variant.label);
        await b.open(`http://127.0.0.1:${process.env.P13_PROBE_PORT||8765}/__p13diag/micro.html`);
        await b.exec(v=>{runMicro(v);},variant);
        let out;
        for(;;){await sleep(500);out=await b.exec(()=>__micro.at(-1));if(out.done)break;}
        const s=await p13diag.sample('micro-end');
        results.micro.push(out);
        console.log('[probe] micro',variant.label,'readyMs',out.rounds.map(r=>r.readyMs+(r.error?'!'+r.error:'')).join(' '),'| workerMs',out.rounds.map(r=>r.workerMs).join(' '));
        console.log('[probe]   ps',p13diag.brief(s));
        await sleep(5000);
        console.log('[probe]   ps +5s',p13diag.brief(await p13diag.sample('micro-after')));
      }
      continue;
    }
    const mode=phase==='idle'?'idle':'runaway';
    p13diag.setLabel('pyodide '+phase);
    await b.open(`http://${lan}:${phase==='patched'?8769:8765}/index.html`);
    await b.exec(()=>{globalThis.__probeBefore=null;});
    await until(b,readyFn,'__probeBefore',180000,'first ready');
    console.log('[probe]',phase,'start ps',p13diag.brief(await p13diag.sample(phase+'-start')));
    for(let i=1;i<=8;i++){
      await b.exec(()=>{globalThis.__probeBefore=globalThis.mainPyodide;});
      const t0=Date.now();
      if(mode==='runaway'){
        await b.exec(text=>qpyodideCellContainer.cells[0].primaryUnit.editor.setValue(text),'while True: pass');
        await b.click('.qpyodide-button-run');await sleep(300);
      }
      const stop=Date.now();
      if(mode==='runaway')await b.click('.qpyodide-button-run');
      else await b.exec(()=>{mainPyodide.restart('P13 probe');});
      const clicked=Date.now();
      await until(b,readyFn,'__probeBefore',300000,`recovery ${phase} ${i}`);
      const entry={i,recoveryMs:Date.now()-stop,stopCommandMs:clicked-stop,runMs:stop-t0};
      results[phase].push(entry);
      console.log('[probe]',phase,JSON.stringify(entry),consoleLines.length?consoleLines.at(-1)[1]:'');
      console.log('[probe]   ps',p13diag.brief(await p13diag.sample(phase+'-'+i)));
      await sleep(1000);
    }
    await sleep(5000);
    console.log('[probe]',phase,'end +5s ps',p13diag.brief(await p13diag.sample(phase+'-end')));
  }
} catch(error){console.log('[probe] FAILED',String(error.stack||error));console.log('[probe]   ps',p13diag.brief(await p13diag.sample('failure')));process.exitCode=1;}
finally {
  p13diag.stopSampler();await b.close();
  console.log('[probe] summary',JSON.stringify({backend,micro:results.micro.map(m=>({label:m.label,readyMs:m.rounds.map(r=>r.readyMs)})),patched:results.patched.map(r=>r.recoveryMs),runaway:results.runaway.map(r=>r.recoveryMs),idle:results.idle.map(r=>r.recoveryMs)}));
}
