// Measurement-only preload prototypes. Production defaults are unchanged.
const fs=require('node:fs'),path=require('node:path');
module.exports=async function measureP13(browser,base,site,firstGradeable,record){
  const receipt=path.join(path.dirname(site),'.private-extensions/resolved-repos.json');
  const installed=JSON.parse(fs.readFileSync(receipt,'utf8'));
  const source_refs=Object.fromEntries(['ctm-libs','pyodide-interaktiv','math-exercise','py-exercise'].map(name=>[name,installed.repositories[name].commit]));
  for(const [file,kind] of [['timing-math.html','math'],['timing-python.html','python']]) {
    if(!fs.existsSync(path.join(site,file)))throw new Error('P13 needs rendered '+file);
    for(const mode of ['existing','check','idle','interaction']) {
      const context=await browser.newContext({serviceWorkers:'block'});
      try {
        for(const cache of ['cold','warm']) {
          const page=await context.newPage(),external=[],errors=[];
          page.on('pageerror',error=>errors.push(error.message));
          // DNS refusal is configured by loading-timing.cjs. Playwright
          // routing disables the HTTP cache and would invalidate warm runs.
          page.on('request',request=>{
            if(new URL(request.url()).origin!==new URL(base).origin)external.push(request.url());
          });
          await page.addInitScript(mode=>{
            const state=globalThis.__p13Loading={mode,longTasksSupported:PerformanceObserver.supportedEntryTypes?.includes('longtask')===true,longTasks:[],pythonReadyMs:null,preloadRequestedMs:null};
            // Current standalone components already request the interpreter
            // during UI startup. Hold that request only in experiment modes,
            // otherwise a supposed on-Check measurement would still preload.
            let runtime, release;
            const gate=new Promise(resolve=>{release=resolve;});
            globalThis.__p13Release=()=>{state.preloadRequestedMs??=performance.now();release();};
            Object.defineProperty(globalThis,'MathExerciseRuntime',{configurable:true,get:()=>runtime,set:value=>{
              runtime=value;const original=value.ensurePyodide;
              value.ensurePyodide=async function(...args){
                if(mode!=='existing')await gate;
                const py=await original.apply(this,args);
                state.pythonReadyMs??=performance.now();return py;
              };
            }});
            if(state.longTasksSupported)new PerformanceObserver(list=>{for(const e of list.getEntries())state.longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
            const preload=async()=>{
              globalThis.__p13Release();
              try {await MathExerciseRuntime.ensurePyodide();state.pythonReadyMs=performance.now();}
              catch(error){state.error=String(error);}
            };
            const ready=setInterval(()=>{
              if(globalThis.mainPyodide?.isWorkerProxy){state.pythonReadyMs??=performance.now();clearInterval(ready);}
            },10);
            addEventListener('DOMContentLoaded',()=>{
              if(mode==='idle')(globalThis.requestIdleCallback||((f)=>setTimeout(f,0)))(preload);
              if(mode==='interaction')addEventListener('pointerdown',preload,{once:true});
            },{once:true});
          },mode);
          const start=Date.now();await page.goto(base+'/'+file,{waitUntil:'load'});
          if(mode==='interaction')await page.mouse.click(5,5);
          // A fixed think time makes the three startup strategies comparable.
          await page.waitForTimeout(1500);
          const checkStart=Date.now();
          if(mode==='check')await page.evaluate(()=>__p13Release());
          const grade=await firstGradeable(page,kind);
          const metrics=await page.evaluate(()=>({...__p13Loading,domReadyMs:performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd,ready:mainPyodide?.isWorkerProxy===true}));
          const item={name:'P16 '+kind,mode,cache,profile:'local assets',browser:browser.version(),source_refs,...metrics,
            checkLatencyMs:grade.graded-checkStart,totalMs:Date.now()-start,status:grade.status,external,errors};
          record(item);await page.close();
          if(external.length||errors.length||metrics.error||!metrics.ready||grade.status!=='graded')throw new Error('P13 timing scenario failed: '+JSON.stringify(item));
        }
      } finally {await context.close();}
    }
  }
};
