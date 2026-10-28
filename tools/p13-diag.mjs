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

// macOS: WebKit process CPU/RSS, per-thread CPU of WebContent processes from
// cumulative thread times (ps -M thread lines lack USER/TT, so columns are
// located from the STAT field), system load, memory and the top processes.
const run=(cmd,args)=>new Promise(resolve=>execFile(cmd,args,{timeout:8000,maxBuffer:8<<20},(error,stdout)=>resolve(error?'':stdout)));
const secs=t=>{const m=String(t).match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);return m?(+(m[1]||0))*3600+(+m[2])*60+(+m[3]):NaN;};
const lastThreads=new Map();
async function threads(pid){
  const t=Date.now(),rows=(await run('ps',['-M','-p',String(pid)])).split('\n').slice(1).map(l=>l.trim().split(/\s+/)).filter(f=>f.length>=5);
  const list=rows.map((f,i)=>{const k=f.findIndex(x=>/^[RSITUZ][A-Za-z+<>]*$/.test(x));return k<1?null:{i,cpu:parseFloat(f[k-1]),stat:f[k],cum:secs(f[k+2])+secs(f[k+3])};}).filter(Boolean);
  const prev=lastThreads.get(pid);lastThreads.set(pid,{t,list});
  const dt=prev?(t-prev.t)/1000:0;
  // Busy: a thread that used >= 80% of one core since the previous sample.
  const deltas=prev&&dt>0.5?list.map((x,j)=>prev.list[j]?Math.round(100*(x.cum-prev.list[j].cum)/dt):null).filter(x=>x!==null&&x>=0):[];
  return {pid,threads:list.length,running:list.filter(x=>x.stat.startsWith('R')).length,busy:deltas.filter(x=>x>=80).length,top:deltas.sort((a,b)=>b-a).slice(0,5),window:Math.round(dt)};
}
let lastVm=null;
async function vm(){
  const text=await run('vm_stat',[]),get=k=>+(text.match(new RegExp(k+':\\s+(\\d+)'))||[])[1]||0;
  const now={t:Date.now(),pageins:get('Pageins'),pageouts:get('Pageouts'),swapins:get('Swapins'),swapouts:get('Swapouts'),compressor:get('Pages occupied by compressor')};
  const d=lastVm?{pageins:now.pageins-lastVm.pageins,pageouts:now.pageouts-lastVm.pageouts,swapins:now.swapins-lastVm.swapins,swapouts:now.swapouts-lastVm.swapouts}:{};
  lastVm=now;return {...d,compressorMB:Math.round(now.compressor*16/1024)};
}
export async function sample(tag=''){
  if(!enabled||os.platform()!=='darwin')return null;
  const t=Date.now();
  const all=(await run('ps',['-axo','pid=,ppid=,pcpu=,rss=,command='])).split('\n').map(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);return m&&{pid:+m[1],cpu:+m[3],rssMB:Math.round(+m[4]/1024),name:m[5].split(' ')[0].split('/').pop().slice(0,40),full:m[5]};}).filter(Boolean);
  const procs=all.filter(p=>/WebKit|Playwright|Safari/i.test(p.full)&&!/ps -axo/.test(p.full)).map(({full,...p})=>p);
  const topProcs=all.slice().sort((a,b)=>b.cpu-a.cpu).slice(0,6).map(p=>`${p.name}#${p.pid}:${p.cpu}%`);
  const hot=[];
  for(const p of procs.filter(p=>/WebContent/.test(p.name)))hot.push(await threads(p.pid));
  const load=os.loadavg().map(x=>+x.toFixed(2)),freeMB=Math.round(os.freemem()/1048576);
  const entry={t,tag,load,freeMB,vm:await vm(),lagMs:takeLag(),procs:procs.filter(p=>p.cpu>=1||/WebContent/.test(p.name)),hot,topProcs};
  diag.ps.push(entry);cap(diag.ps,1500);
  return entry;
}
// Node event-loop lag: the largest timer delay since the last sample.
let lagMax=0,lagLast=Date.now();
if(enabled){setInterval(()=>{const now=Date.now();lagMax=Math.max(lagMax,now-lagLast-100);lagLast=now;},100).unref();}
function takeLag(){const v=lagMax;lagMax=0;return v;}
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
  return `load=${entry.load.join('/')} free=${entry.freeMB}MB lag=${entry.lagMs}ms vm=${JSON.stringify(entry.vm)} `+entry.hot.map(h=>`wc${h.pid}:busy=${h.busy}/${h.threads}(R${h.running}) top=${h.top.join(',')}/${h.window}s`).join(' ')+' '+entry.procs.map(p=>`${p.name.replace('com.apple.WebKit.','')}#${p.pid}:${p.cpu}%/${p.rssMB}MB`).join(' ')+' top: '+entry.topProcs.join(' ');
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
