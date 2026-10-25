const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {compare,readExpected,applyExpected}=require('../integration/pyodide-parity/run.cjs');
const h1=require('../integration/pyodide-parity/stack-h1.cjs');
const id='stack:ctm-stack/examples.html#0|seed=1|teacher';
function fixture(){
 const c={id,page:'ctm-stack/examples.html',position:0,label:'stack-0',kind:'stack',probe:'teacher',variantKey:'seed=1',request:{question:{name:'A multiple',python_checkers:{source:'original'}},variant:{seed:1}}};
 const d=structuredClone(c);delete d.request.question.python_checkers;d.request.question.checker='def check(response,symbols): return True';
 const a={id,results:[{status:'graded',score:1,detail:{prts:{prt1:{score:1}}}}],feedback:[]};
 const b=structuredClone(a);b.results[0].detail.prts.checker={score:1};
 return {c,d,a,b};
}
function differences({c,d,a,b}){
 return compare([{name:'base'},{name:'head'}],[{cases:[c]},{cases:[d]}],{base:new Map([[id,a]]),head:new Map([[id,b]])},[{ids:new Set([id])},{ids:new Set([id])}],true).differences;
}
function expected(f,withWitness=true){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctm-h1-expect-'));
 try {
  const file=path.join(dir,'expected.json');fs.writeFileSync(file,JSON.stringify({differences:[{path:f.c.page,case:id,reason:'H1 adds the implicit checker tree; verdict and score stay the same',...(withWitness?{witness:h1.evidence(f.c,f.d,f.a,f.b)}:{})}]}));
  return readExpected(file);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('H1 result changes need exact request/result witnesses and unchanged verdicts',()=>{
 const f=fixture(),diff=differences(f);assert.equal(diff.length,1);
 const accepted=applyExpected(expected(f),diff);assert.equal(accepted.accepted.length,1);assert.equal(accepted.unexpected.length,0);
 assert.equal(applyExpected(expected(f,false),diff).unexpected.length,1,'a case-only exception cannot accept a STACK result change');
 for(const mutation of ['source','variant','feedback','responses','score']){
  const changed=structuredClone(f);
  if(mutation==='source')changed.d.request.question.checker+='\n# unexpected change';
  if(mutation==='variant')changed.d.request.variant.seed=2;
  if(mutation==='feedback')changed.b.feedback=['unexpected'];
  if(mutation==='responses')changed.b.responses=['unexpected'];
  if(mutation==='score')changed.b.results[0].score=0;
  const result=applyExpected(expected(f),differences(changed));
  assert.equal(result.unexpected.length,1,mutation);assert.equal(result.stale.length,1,mutation);
 }
 const changed=structuredClone(f);changed.b.results[0].score=0;
 assert.throws(()=>expected(changed),/cannot accept changed verdicts/);
});
test('H1 witnesses cannot retire arbitrary cards outside the rewritten guides',()=>{
 const f=fixture();const entry={path:f.c.page,case:id,witness:h1.evidence(f.c,null,f.a,null)};
 assert.throws(()=>h1.validate(entry),/restricted to the rewritten checker guides/);
 entry.path='ctm-stack/docs/python-checker-api.html';assert.doesNotThrow(()=>h1.validate(entry));
 entry.case='/stack:.*/';assert.throws(()=>h1.validate(entry),/exact STACK page\/case/);
});
