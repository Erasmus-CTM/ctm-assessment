// DIAGNOSTIC ONLY (WebKit Stop stall investigation). Enabled by P13_DIAG=1.
// Collects step timestamps, page-side heartbeats, Worker create/terminate
// counts, evaluate arrival stamps, console messages and macOS process/thread
// CPU samples, and prints compact summaries to the job log (artifacts can't be
// fetched from the investigation environment).
import {execFile} from 'node:child_process';
import os from 'node:os';

export const enabled=process.env.P13_DIAG==='1';
export const diag={steps:[],slow:[],console:[],workers:[],ps:[],stalls:[]};
const cap=(list,max)=>{if(list.length>max)list.splice(0,list.length-max);};
let label='';
export function setLabel(text){label=text;step('profile',{label});}
export function step(name,extra={}){
  if(!enabled)return;
  const entry={t:Date.now(),name,...extra};diag.steps.push(entry);cap(diag.steps,2000);
  console.log('[p13diag]',new Date(entry.t).toISOString(),label,name,Object.keys(extra).length?JSON.stringify(extra):'');
}
export function slow(entry){if(!enabled)return;diag.slow.push(entry);cap(diag.slow,200);console.log('[p13diag] slow-evaluate',label,JSON.stringify(entry));}

// Page side: heartbeat ring with wall clock (aligned with node Date.now()),
// Worker wrapper counting create/terminate, input-event arrival stamps.
export const initScript=()=>{
  const d=globalThis.__p13Diag={hb:[],evals:[],workers:{created:0,terminated:0,log:[]},input:[]};
  let last=performance.now();
  setInterval(()=>{const now=performance.now();d.hb.push([Date.now(),Math.round(now-last)]);last=now;if(d.hb.length>4000)d.hb.splice(0,1000);},250);
  const Native=globalThis.Worker;
  if(Native)globalThis.Worker=class extends Native {
    constructor(url,options){super(url,options);d.workers.created++;const id=d.workers.created;this.__p13Id=id;d.workers.log.push([Date.now(),'create',id,String(url).slice(-40)]);}
    terminate(){d.workers.terminated++;d.workers.log.push([Date.now(),'terminate',this.__p13Id]);return super.terminate();}
  };
  for(const type of ['mousedown','mousemove','click','keydown'])addEventListener(type,e=>{d.input.push([Date.now(),type,e.isTrusted]);if(d.input.length>500)d.input.splice(0,100);},true);
};

export function attach(page){
  if(!enabled)return;
  page.on('console',m=>{diag.console.push([Date.now(),m.type(),m.text().slice(0,300)]);cap(diag.console,300);});
  page.on('pageerror',e=>{diag.console.push([Date.now(),'pageerror',String(e.message).slice(0,300)]);});
  page.on('crash',()=>step('page-crash'));
  page.on('worker',w=>{const t=Date.now();diag.workers.push([t,'attach',w.url().slice(-40)]);w.on('close',()=>diag.workers.push([Date.now(),'close',w.url().slice(-40)]));});
}

// macOS: WebKit process CPU/RSS and per-thread CPU of WebContent processes.
const run=(cmd,args)=>new Promise(resolve=>execFile(cmd,args,{timeout:8000,maxBuffer:8<<20},(error,stdout)=>resolve(error?'':stdout)));
export async function sample(tag=''){
  if(!enabled||os.platform()!=='darwin')return null;
  const t=Date.now();
  const lines=(await run('ps',['-axo','pid=,ppid=,pcpu=,rss=,command='])).split('\n').filter(l=>/WebKit|Playwright|Safari/i.test(l)&&!/ps -axo/.test(l));
  const procs=lines.map(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);return m&&{pid:+m[1],cpu:+m[3],rssMB:Math.round(+m[4]/1024),name:m[5].split('/').pop().slice(0,40)};}).filter(Boolean);
  const hot=[];
  for(const p of procs.filter(p=>/WebContent/.test(p.name))){
    // ps -M: one line per thread; %CPU is the 4th column.
    const threads=(await run('ps',['-M','-p',String(p.pid)])).split('\n').slice(1).map(l=>l.trim().split(/\s+/)).filter(f=>f.length>4).map(f=>parseFloat(f[3])).filter(Number.isFinite);
    hot.push({pid:p.pid,threads:threads.length,busy:threads.filter(c=>c>=50).length,top:threads.sort((a,b)=>b-a).slice(0,5)});
  }
  const load=os.loadavg().map(x=>+x.toFixed(2)),freeMB=Math.round(os.freemem()/1048576);
  const entry={t,tag,load,freeMB,procs:procs.filter(p=>p.cpu>=1||/WebContent/.test(p.name)),hot};
  diag.ps.push(entry);cap(diag.ps,1500);
  return entry;
}
let samplerTimer=null;
export function startSampler(ms=2000){
  if(!enabled||os.platform()!=='darwin'||samplerTimer)return;
  let busy=false;
  samplerTimer=setInterval(async()=>{if(busy)return;busy=true;try{await sample();}finally{busy=false;}},ms);
  samplerTimer.unref();
}
export function stopSampler(){if(samplerTimer)clearInterval(samplerTimer);samplerTimer=null;}
export function brief(entry){
  if(!entry)return 'n/a';
  return `load=${entry.load.join('/')} free=${entry.freeMB}MB `+entry.hot.map(h=>`wc${h.pid}:busy=${h.busy}/${h.threads} top=${h.top.join(',')}`).join(' ')+' '+entry.procs.map(p=>`${p.name.replace('com.apple.WebKit.','')}#${p.pid}:${p.cpu}%/${p.rssMB}MB`).join(' ');
}
// Print the samples inside [from,to] compactly.
export function printWindow(from,to,why){
  if(!enabled)return;
  console.log(`[p13diag] window ${why} ${new Date(from).toISOString()} .. ${new Date(to).toISOString()}`);
  for(const e of diag.ps.filter(e=>e.t>=from&&e.t<=to))console.log('[p13diag]  ps',new Date(e.t).toISOString(),e.tag,brief(e));
  for(const e of diag.console.filter(e=>e[0]>=from&&e[0]<=to))console.log('[p13diag]  console',new Date(e[0]).toISOString(),e[1],e[2]);
  for(const e of diag.workers.filter(e=>e[0]>=from&&e[0]<=to))console.log('[p13diag]  pw-worker',new Date(e[0]).toISOString(),e[1],e[2]);
}
// After a stall: how long until the page answers, and what it logged meanwhile.
export async function postmortem(page,from){
  if(!enabled)return null;
  const t=Date.now();let answeredMs=null,page_=null;
  try {
    page_=await Promise.race([page.evaluate(()=>{const d=globalThis.__p13Diag;return d&&{now:Date.now(),hb:d.hb.slice(-800),evals:d.evals.slice(-200),workers:d.workers,input:d.input.slice(-100)};}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('postmortem evaluate timed out after 90s')),90000))]);
    answeredMs=Date.now()-t;
  } catch(error){page_={error:String(error)};}
  const s=await sample('postmortem');
  const hb=page_?.hb||[],inWindow=hb.filter(([ts])=>ts>=from);
  const out={from,answeredMs,pageNow:page_?.now,maxHbGapMs:Math.max(0,...inWindow.map(h=>h[1])),hbCount:inWindow.length,
    hbFirst:inWindow[0]?.[0],hbLast:inWindow.at(-1)?.[0],
    evals:(page_?.evals||[]).filter(([ts])=>ts>=from-5000),workers:page_?.workers,input:(page_?.input||[]).filter(([ts])=>ts>=from-5000),error:page_?.error,ps:brief(s)};
  diag.stalls.push(out);
  console.log('[p13diag] postmortem',label,JSON.stringify(out));
  printWindow(from-10000,Date.now(),'stall');
  return out;
}
