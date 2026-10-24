'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const {validate} = require('./check-d2-background-validity.cjs');
function fixture() {
  const url='https://cdn.jsdelivr.net/pyodide/v0.28.3/full/matplotlib-3.8.4-py3-none-any.whl';
  const r={runs:2,slow_runs:1,d2:{limit_s:2,comparisons:[]},scenarios:[]};
  for(const profile of ['fast','slow']) {
    for(const cache of ['cold','warm']) r.d2.comparisons.push({profile,cache,errors:[],graded_with_s:4.1,graded_without_s:4,delay_s:0.1});
    for(const on of [true,false]) {
      const events=[{type:'console',message:'qpyodide: Pyodide worker ready after 8s'},{type:'console',message:'qpyodide: Pyodide worker ready after 7s'}];
      if(on) events.push({type:'request',method:'GET',url},{type:'response',url,status:200},{type:'requestfinished',method:'GET',url});
      const run={cold:{status:'graded',graded_s:4.1,cells_s:8},warm:{status:'graded',graded_s:4.1,cells_s:7},diagnostic:{complete:true,dropped:0,truncatedFields:0,truncations:[],events}};
      r.scenarios.push({profile,name:'Combined example page (all components), mathematics'+(on?', with stage 2':', stage 2 switched off'),runs:Array.from({length:profile==='fast'?2:1},()=>structuredClone(run))});
    }
  }
  return r;
}
const original=process.env.CTM_D2_REAL_REPORT?JSON.parse(fs.readFileSync(process.env.CTM_D2_REAL_REPORT,'utf8')):fixture();
const html=process.env.CTM_D2_REAL_HTML?fs.readFileSync(process.env.CTM_D2_REAL_HTML,'utf8'):'<script>globalThis.qpyodidePreloadPackages = true;</script>';
const copy=()=>structuredClone(original), on=r=>r.scenarios.find(s=>s.name.endsWith(', with stage 2')).runs[0], off=r=>r.scenarios.find(s=>s.name.endsWith(', stage 2 switched off')).runs[0];
test('enabled real on/off evidence satisfies the unchanged grade and timing gates',()=>{
 const result=validate(copy(),html);assert.equal(result.valid,true);assert.equal(result.directPackageRegistrySnapshot,false);
});
test('disabled or competing rendered configuration cannot look like a successful on run',()=>{
 assert.throws(()=>validate(copy(),html.replace('globalThis.qpyodidePreloadPackages = true;','globalThis.qpyodidePreloadPackages = false;')),/configuration/);
 assert.throws(()=>validate(copy(),html+'<script>globalThis.qpyodidePreloadPackages = true;</script>'),/configuration/);
 assert.throws(()=>validate(copy(),html+'<script>globalThis.__ctmWorkerNoBackground = true;</script>'),/off hook/);
});
test('empty on work and a stale ineffective off hook are rejected',()=>{
 let r=copy();on(r).diagnostic.events=on(r).diagnostic.events.filter(e=>!String(e.url).includes('/matplotlib-'));assert.throws(()=>validate(r,html),/no real background/);
 r=copy();off(r).diagnostic.events.push(...on(r).diagnostic.events.filter(e=>e.type==='request'));assert.throws(()=>validate(r,html),/off hook/);
});
test('recoverable setup failure is rejected even though cells became ready and Check graded',()=>{
 const r=copy();on(r).diagnostic.events.push({type:'console',level:'warning',message:'qpyodide: the extra packages could not be loaded Error: matplotlib missing'});
 assert.throws(()=>validate(r,html),/background setup failed/);
});
test('a claimed complete capture cannot conceal drops or truncation',()=>{
 for(const field of ['dropped','truncatedFields']){const r=copy();on(r).diagnostic[field]=1;assert.throws(()=>validate(r,html),/incomplete diagnostic/);}
 const r=copy();on(r).diagnostic.truncations.push({field:'message'});assert.throws(()=>validate(r,html),/incomplete diagnostic/);
});
test('a requested background GET without terminal completion is not success',()=>{
 const r=copy();on(r).diagnostic.events=on(r).diagnostic.events.filter(e=>!(e.type==='requestfinished'&&e.method==='GET'&&String(e.url).includes('/matplotlib-')));
 assert.throws(()=>validate(r,html),/did not finish/);
});
test('missing cells and terminal Check errors cannot be counted as graded readiness',()=>{
 let r=copy();on(r).cold.cells_s=null;assert.throws(()=>validate(r,html),/never settled/);
 r=copy();on(r).cold.status='not graded: terminal error';assert.throws(()=>validate(r,html),/not successful grading/);
});
test('original timing/error limits and all observed contexts remain mandatory',()=>{
 let r=copy();r.d2.limit_s=3;assert.throws(()=>validate(r,html),/two-second/);
 r=copy();r.d2.comparisons[0].delay_s=2.1;assert.throws(()=>validate(r,html),/timing gate/);
 r=copy();r.d2.comparisons[0].errors.push('cold failure');assert.throws(()=>validate(r,html),/error gate/);
 r=copy();r.runs=1;for(const s of r.scenarios.filter(s=>s.profile==='fast'))s.runs=s.runs.slice(0,1);assert.throws(()=>validate(r,html),/two fast contexts/);
 r=copy();r.slow_runs=2;assert.throws(()=>validate(r,html),/one slow context/);
 r=copy();r.scenarios[0].runs.pop();assert.throws(()=>validate(r,html),/contexts/);
});
