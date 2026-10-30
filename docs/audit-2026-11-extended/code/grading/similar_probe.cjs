/* Actual MathSimilar + renderer with synthetic provider, real CPython dispatch.
 * node similar_probe.cjs WORKSPACE PYTHON
 * node --expose-gc similar_probe.cjs WORKSPACE PYTHON --memory
 * --memory tests JS record/DOM retention with deterministic grading stubs.
 * No source transformation, network, render or provider credential is needed.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{execFile}=require('node:child_process');
const [workspace='/workspace',python='python']=process.argv.slice(2);
const localRequire=createRequire(path.join(workspace,'math-exercise/package.json'));
const {JSDOM}=localRequire('jsdom');
const libs=path.join(workspace,'ctm-libs/_extensions/ctm-libs');
const math=path.join(workspace,'math-exercise/_extensions/math-exercise');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(mode='equivalent',givens='',{stubGrader=false}={}) {
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://fixture.invalid/site/page.html',runScripts:'outside-only'});
 const w=dom.window;w.TextEncoder=TextEncoder;w.__mathExerciseTestMode=true;
 w.MathExerciseRuntime={trackInitialUI:()=>{}};
 for(const file of ['ctm-locale.js','common.js','math-exercise.js','ui.js'])w.eval(fs.readFileSync(path.join(libs,'locales',file),'utf8'));
 w.eval(fs.readFileSync(path.join(math,'math-exercise.js'),'utf8'));
 await turn();
 const cell=w.document.createElement('div');cell.id='audit';
 Object.assign(cell.dataset,{similar:'true',vars:mode==='custom'?'x':'',fields:'["1"]',label:'audit',ctmSource:'snapshot'});
 if(givens)cell.dataset.similarData='h,x0';
 cell.innerHTML='<div class="math-exercise-question"><input class="math-input"></div><div class="math-exercise-controls"><button class="math-feedback-btn"></button></div>';
 w.document.body.append(cell);
 let providerCalls=0,changes=0,provider=()=>{throw Error('No synthetic provider response configured')};
 const F=w.AIFeedback={loadConfig:()=>({mode:'api',model:'mock-only'}),resolveGenerationPolicy:()=>({basePrompts:[],language:'en'}),
   getGenerationClient:()=>({complete:async()=>{providerCalls++;return {text:await provider()};}}),
   getClient:()=>({complete:async()=>{providerCalls++;return {text:'{"answers":["3"]}'};}})};
 w.eval(fs.readFileSync(path.join(math,'math-similar.js'),'utf8'));
 const calls=[];let graderCalls=0;
 const call=async(name,request)=>{
   graderCalls++;
   if(stubGrader){
     if(name==='compute_key')return {key:'3',computed:true};
     if(name==='check')return {status:'correct',score:1};
     throw Error('Unexpected synthetic grading call '+name);
   }
   calls.push({name,request});
   return new Promise((resolve,reject)=>{const child=execFile(python,['-c',
     'import json,sys; from ctm_checkers.browser import call; value=json.load(sys.stdin); print(call("math_exercise."+value["name"], {"_ctm_request":json.dumps(value["request"])}))'],
     {encoding:'utf8',env:{...process.env,PYTHONPATH:path.join(workspace,'ctm-checkers/src')}},
     (error,stdout)=>error?reject(error):resolve(JSON.parse(stdout)));
     child.stdin.end(JSON.stringify({name,request}));});
 };
 const handle=w.MathSimilar.attach({cell,mode,language:'en',options:()=>({checker:mode==='custom'?'def check(response, symbols):\n return True':'',givens}),
   task:()=>'',contexts:()=>'',render:w.__mathExerciseTestApi.renderTaskText,typeset:async()=>{},setup:()=>{},call,changed:()=>changes++});
 return {dom,w,cell,handle,calls,call,setProvider:f=>provider=f,count:()=>providerCalls,changes:()=>changes,graderCount:()=>graderCalls};
}
async function waitComplete(f){for(let i=0;i<200;i++){await new Promise(resolve=>setTimeout(resolve,20));if(!f.cell.querySelector('.math-similar-controls button').disabled)return;}throw Error('timed out');}
async function main(){
 if(process.argv.includes('--memory'))return memoryProbe();
 const f=await fixture();
 f.setProvider(()=>JSON.stringify({question:'What is 2+2? _[1]',mode:'numeric',vars:[],fields:[{answer:'a = 3',recipe:{op:'value',expr:'3'}}]}));
 f.cell.querySelector('.math-similar-controls button').click();await waitComplete(f);
 const saved=JSON.parse(JSON.stringify(f.handle.read()));
 assert.equal(saved.length,1);assert.equal(saved[0].spec.mode,'equivalent');
 assert.equal(saved[0].spec.fields[0].key,'3');assert.equal(f.count(),1);
 const wrongQuestion={admitted:saved[0].spec.question,normalizedMode:saved[0].spec.mode,normalizedAnswer:saved[0].spec.fields[0].answer,providerCalls:f.count(),computed:saved[0].spec.fields[0].computed};
 // Restore trusts a non-custom stored key/computed flag, without recomputing it.
 saved[0].spec.fields[0].key='9';f.handle.restore(saved);
 assert.equal(f.handle.read()[0].spec.fields[0].key,'9');
 const restoredTamper={key:f.handle.read()[0].spec.fields[0].key,computed:f.handle.read()[0].spec.fields[0].computed};
 f.dom.window.close();
 const c=await fixture();let release;c.setProvider(()=>new Promise(resolve=>release=resolve));
 c.cell.querySelector('.math-similar-controls button').click();await turn();
 c.cell.dispatchEvent(new c.w.CustomEvent('math-exercise:variant-change'));
 release(JSON.stringify({question:'What is 1+2? _[1]',vars:'',fields:[{answer:'3',recipe:{op:'value',expr:'3'}}]}));
 await turn();await turn();assert.equal(c.handle.read().length,0);
 c.dom.window.close();
 const g=await fixture('custom','h=x^2\nx0=1');
 const bound=await g.call('bind_data',{givens:'h=x^2\nx0=1',fields:['1'],vars:'x',names:['h','x0'],data:{h:'x^3',x0:'2'}});
 const customSaved=[{n:1,direction:'same',spec:{question:'Differentiate {{h}} at {{x0}}: _[1]',
   mode:'custom',vars:'x',checker:'original',data:{h:'x^3',x0:'2'},display:bound.latex,
   context:{malicious:'this context is ignored'},source:'snapshot',fields:[{key:'12',computed:false}]},inputs:{fields:{}}}];
 g.handle.restore(customSaved);
 let child=g.cell.querySelector('.math-generated-problem');child.querySelector('.math-check-btn').click();
 for(let i=0;i<200&&!child._similarContext;i++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.deepEqual(JSON.parse(JSON.stringify(child._similarContext)),bound.context);
 customSaved[0].spec.display.h='wrong visible given';g.handle.restore(customSaved);
 child=g.cell.querySelector('.math-generated-problem');child.querySelector('.math-check-btn').click();
 for(let i=0;i<200&&!child.querySelector('.math-check-btn').disabled;i++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(child.querySelector('.math-check-btn').disabled,true);
 g.dom.window.close();
 console.log(JSON.stringify({recipeQuestionMismatch:wrongQuestion,restoredNoncustomTamper:restoredTamper,
   variantCancellation:'passed',customStoredContextIgnored:'passed',customDisplayTamperingDisablesCheck:'passed'}));
}
async function memoryProbe(){
 const {performance}=require('node:perf_hooks');const observations=[];
 async function sample(f){
   await turn();if(global.gc){global.gc();await turn();global.gc();}
   return {heapUsedBytes:process.memoryUsage().heapUsed,records:f.handle.read().length,
     problemCards:f.cell.querySelectorAll('.math-generated-problem').length,
     domNodes:f.cell.querySelectorAll('*').length,providerCalls:f.count(),graderCalls:f.graderCount()};
 }
 for(let repetition=1;repetition<=3;repetition++){
   const f=await fixture('equivalent','',{stubGrader:true});let serial=0;
   f.setProvider(()=>JSON.stringify({question:'Practice '+(++serial)+': What is 1+2? _[1]',vars:'',
     fields:[{answer:'3',recipe:{op:'value',expr:'3'}}]}));
   const baseline=await sample(f);const start=performance.now();let after10;
   for(let generated=1;generated<=100;generated++){
     f.cell.querySelector('.math-similar-controls button').click();await waitComplete(f);
     assert.equal(f.handle.read().length,Math.min(generated,10));
     assert.equal(f.cell.querySelectorAll('.math-generated-problem').length,Math.min(generated,10));
     if(generated===10)after10=await sample(f);
   }
   const elapsedGenerationMs=performance.now()-start,after100=await sample(f);
   const clearStart=performance.now();f.handle.clear();const clearMs=performance.now()-clearStart;
   const afterClear=await sample(f);assert.equal(afterClear.records,0);assert.equal(afterClear.problemCards,0);
   observations.push({repetition,generated:100,elapsedGenerationMs,clearMs,baseline,after10,after100,afterClear,
     warmTo100HeapDelta:after100.heapUsedBytes-after10.heapUsedBytes,
     retainedAfterClearHeapDelta:afterClear.heapUsedBytes-baseline.heapUsedBytes});
   f.dom.window.close();await turn();if(global.gc)global.gc();
 }
 console.log(JSON.stringify({node:process.version,forcedGC:typeof global.gc==='function',repetitions:3,
   scope:'Node jsdom JS heap; actual MathSimilar and renderer, deterministic provider and compute_key/check substitutes; no Pyodide/browser/native process memory',
   timingNote:'generation elapsed includes one20ms completion poll per problem; not provider or grading latency',observations}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
