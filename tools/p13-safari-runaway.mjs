// DIAGNOSTIC ONLY: the P13 runaway/Stop sequence in real Safari through
// safaridriver (W3C WebDriver, no Web Inspector protocol), to compare with the
// Playwright WebKit profile. Prints one line per runaway and fails on a stall.
import os from 'node:os';
import * as p13diag from './p13-diag.mjs';

const driver=process.env.P13_SAFARIDRIVER||'http://127.0.0.1:4444';
const lan=Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address;
const rounds=Number(process.env.P13_SAFARI_ROUNDS||3);
const programs=['while True: pass','while True: print("flood")','while True: print("")','while True:\n    try:\n        while True: pass\n    except KeyboardInterrupt: pass'];
const ELEMENT='element-6066-11e4-a52f-4a5b4b2e2b67';
const slowCommands=[];let session;
async function wd(method,path,body,limit=120000){
  const t=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),limit);
  try {
    const response=await fetch(driver+path,{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body),signal:controller.signal});
    const json=await response.json();
    const ms=Date.now()-t;if(ms>2000){slowCommands.push({path:path.replace(/session\/[^/]+/,'s'),ms,at:t});console.log('[safari] slow command',path.split('/').slice(3).join('/'),ms,'ms');}
    if(json.value&&json.value.error)throw new Error(json.value.error+': '+json.value.message);
    return json.value;
  } catch(error){if(error.name==='AbortError')throw new Error(`WebDriver ${path} unanswered for ${limit} ms`);throw error;}
  finally{clearTimeout(timer);}
}
const exec=(fn,...args)=>wd('POST',`/session/${session}/execute/sync`,{script:`return (${fn}).apply(null, arguments)`,args});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,limit=180000,what='condition'){
  const deadline=Date.now()+limit;
  for(;;){if(await exec(fn))return;if(Date.now()>deadline)throw new Error('Timeout waiting for '+what);await sleep(100);}
}
const readyFn=()=>!!(globalThis.qpyodideCellsReady&&globalThis.qpyodideCellContainer?.cells[0]?.primaryUnit?.editor&&globalThis.QP_L&&qpyodideCellContainer.cells[0].primaryUnit.runButton.title===QP_L.runTitle&&!qpyodideCellContainer.cells[0].primaryUnit.runButton.disabled);
async function click(selector){
  const element=await wd('POST',`/session/${session}/element`,{using:'css selector',value:selector});
  await wd('POST',`/session/${session}/element/${element[ELEMENT]}/click`,{});
}
const setCode=text=>exec(text=>qpyodideCellContainer.cells[0].primaryUnit.editor.setValue(text),text);
async function runCheck(text,expected){
  await setCode(text);await click('.qpyodide-button-run');
  await until(expected=>document.querySelector('.qpyodide-output-code-area')?.textContent.includes(expected)&&!!globalThis.qpyodideCellsReady,180000,expected);
}
const results=[];let failed=null;
p13diag.startSampler();
try {
  session=(await wd('POST','/session',{capabilities:{alwaysMatch:{browserName:'safari'}}})).sessionId;
  const version=await exec(()=>navigator.userAgent);console.log('[safari] user agent',version);
  for(const [port,prefix] of [[8767,'/dept/python/'],[8765,'/']]) for(const name of ['index.html','nested/index.html']) {
    const url=`http://${lan}:${port}${prefix}${name}`;p13diag.setLabel('safari '+prefix+name);
    await wd('POST',`/session/${session}/url`,{url});
    await until(readyFn,180000,'ready '+url);
    await exec(()=>{globalThis.__hbMax=0;let last=performance.now();clearInterval(globalThis.__hbTimer);globalThis.__hbTimer=setInterval(()=>{const now=performance.now();__hbMax=Math.max(__hbMax,now-last);last=now;},20);});
    await runCheck('print("P13_RUN",6*7)','P13_RUN 42');
    for(let round=1;round<=rounds;round++) for(const program of programs) {
      const before=p13diag.brief(await p13diag.sample('before-run'));
      await setCode('P13_SESSION_MARKER=42\n'+program);await click('.qpyodide-button-run');
      await sleep(300);
      const running=p13diag.brief(await p13diag.sample('running'));
      await exec(()=>{globalThis.__hbMax=0;});
      const slowBefore=slowCommands.length,stop=Date.now();
      await click('.qpyodide-button-run');
      await until(readyFn,180000,'recovery');
      const recoveryMs=Date.now()-stop,maxGapMs=Math.round(await exec(()=>__hbMax));
      const after=p13diag.brief(await p13diag.sample('recovered'));
      const entry={page:prefix+name,round,program:program.split('\n')[0]+(program.includes('try')?' (catches KI)':''),recoveryMs,maxGapMs,slowCommands:slowCommands.slice(slowBefore).map(c=>c.ms)};
      results.push(entry);console.log('[safari] runaway',JSON.stringify(entry));
      console.log('[safari]   ps before',before);console.log('[safari]   ps running',running);console.log('[safari]   ps after',after);
      await runCheck('print("P13_AFTER_STOP",42)','P13_AFTER_STOP 42');
    }
  }
} catch(error){failed=error;console.log('[safari] FAILED',String(error.stack||error));const s=await p13diag.sample('failure');console.log('[safari]   ps',p13diag.brief(s));}
finally {
  p13diag.stopSampler();
  if(session)await wd('DELETE',`/session/${session}`).catch(()=>{});
  const worst=results.reduce((m,r)=>Math.max(m,r.recoveryMs),0);
  console.log('[safari] summary',JSON.stringify({runaways:results.length,worstRecoveryMs:worst,worstGapMs:results.reduce((m,r)=>Math.max(m,r.maxGapMs),0),slowCommands,failed:failed&&String(failed)}));
}
if(failed)process.exit(1);
