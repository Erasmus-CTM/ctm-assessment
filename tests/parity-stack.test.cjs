const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const stack = require('../integration/pyodide-parity/stack.cjs');
test('STACK replay preserves frozen plans and covers every variant in both payload generations',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stack-parity-'));
  try {
    const question={inputs:[{name:'a'}]}, variants=[{seed:3,env:{a:'1'}},{seed:7,env:{a:'2'}}];
    const payloads=[{version:1,question,variants},{version:2,backend:{id:'sympy',question},variants:variants.map(plan=>({plan}))}];
    const found=payloads.map((payload,i)=>{
      const file=path.join(dir,i+'.html');
      fs.writeFileSync(file,'<script class="'+(i?'ctm-stack-data':'stack-sympy-data')+'">'+JSON.stringify(payload)+'</script>');
      return stack.casesOf(file,'same.html');
    });
    assert.deepEqual(found[0],found[1]);
    assert.equal(found[0].length,14);
    assert.equal(new Set(found[0].map(c=>c.id)).size,14);
    assert.deepEqual(found[0][0].request,{question,variant:variants[0]});
    const file=path.join(dir,'bad.html');
    fs.writeFileSync(file,'<script class="ctm-stack-data">'+JSON.stringify({version:2,backend:{id:'unknown'},variants:[{}]})+'</script>');
    assert.throws(()=>stack.casesOf(file,'bad.html'),/backend replay implementation/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('seed-selection migrations replay both complete plan sets under each engine',()=>{
  const {shareCasebook}=require('../integration/pyodide-parity/stack.cjs');
  const make=(seed)=>({id:'stack:page#0|seed='+seed+'|teacher',page:'page',position:0,kind:'stack',request:{question:{name:'same'},variant:{seed,env:{a:String(seed)}}}});
  const jobs=[{cases:[make(17)]},{cases:[make(1)]}];shareCasebook(jobs);
  assert.deepEqual(jobs[0].cases,jobs[1].cases);
  assert.equal(jobs[0].cases.length,2);
  const conflict=[{cases:[make(17)]},{cases:[make(17)]}];conflict[1].cases[0].request.variant.env.a='forged';
  assert.throws(()=>shareCasebook(conflict),/Conflicting frozen STACK plan/);
  const changed=[{cases:[make(17)]},{cases:[make(1)]}];changed[1].cases[0].request.question.name='changed';
  shareCasebook(changed);assert.equal(changed[0].cases.length,1);assert.equal(changed[1].cases.length,1);
});
