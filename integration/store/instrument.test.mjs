import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./instrument.mjs',import.meta.url),'utf8');
function fixture() {
  const world={navigator:{}};world.window=world;
  vm.runInNewContext(source.replace('export function instrument','function instrument')+'\ninstrument();',world);
  world.MathExerciseRuntime={ensurePyodide(){},ensureCheckers(){},callCheckers(){}};
  world.mainPyodide={globals:{set(name,value){return value;}},runPythonAsync(code){return code;},runCell(code,wantPickle){return {code,wantPickle};}};
  world.CTMStore={register:options=>({restore:()=>{options.effect?.();return {state:'restored'};}})};
  return world;
}
test('the browser spy observes the real restore window without manufacturing work',()=>{
  const world=fixture();
  const handle=world.CTMStore.register({component:'math-exercise',id:'fixture'});
  handle.restore();
  assert.equal(world.__storeAudit.restores.length,1);
  assert.equal(world.__storeAudit.duringRestore.length,0);
  assert.equal(world.__storeAudit.checkerCalls,0);
  assert.ok(world.__storeAudit.wrapped.includes('runtime.callCheckers'));
});
test('a restore that starts Python/checking cannot pass the browser assertions',()=>{
  const world=fixture();
  world.CTMStore.register({component:'py-exercise',id:'fixture',effect(){
    world.MathExerciseRuntime.ensurePyodide();
    world.MathExerciseRuntime.callCheckers();
    world.mainPyodide.runPythonAsync('print("stored learner cell")');
  }}).restore();
  assert.equal(world.__storeAudit.duringRestore.length,3);
  assert.equal(world.__storeAudit.checkerCalls,1);
  assert.equal(world.__storeAudit.studentRuns.length,1);
});
test('deferred literal-code execution is caught outside the synchronous restore window',()=>{
  const world=fixture();
  world.CTMStore.register({component:'pyodide-interaktiv',id:'fixture'}).restore();
  world.mainPyodide.runPythonAsync('print("stored learner cell")');
  assert.equal(world.__storeAudit.duringRestore.length,0);
  assert.equal(world.__storeAudit.studentRuns.length,1);
});

test('deferred actual Python request and constant CALL_PY dispatch are audited',async()=>{
  const world=fixture();
  world.CTMStore.register({component:'py-exercise',id:'fixture'}).restore();
  const request={function:'run',args:['def stored_add(a,b): return a+b','assert stored_add(1,2)==3',{}]};
  const CALL_PY='__import__("_ctm_py_exercise").call(globals())';
  await Promise.resolve().then(async()=>{
    assert.equal(await world.mainPyodide.globals.set('_ctm_py_request',JSON.stringify(request)),JSON.stringify(request));
    assert.equal(await world.mainPyodide.runPythonAsync(CALL_PY),CALL_PY);
  });
  assert.equal(world.__storeAudit.duringRestore.length,0);
  assert.equal(world.__storeAudit.studentRuns.length,2);
  assert.equal(world.__storeAudit.pythonRequests.length,1);
  assert.equal(world.__storeAudit.pythonRequests[0].function,'run');
  assert.equal(world.__storeAudit.pythonRequests[0].args[0],request.args[0]);
  assert.ok(world.__storeAudit.wrapped.includes('python.globals.set'));
});
test('deferred actual worker-plugin runCell is audited without changing its result',async()=>{
  const world=fixture();
  world.CTMStore.register({component:'pyodide-interaktiv',id:'fixture'}).restore();
  const result=await Promise.resolve().then(()=>world.mainPyodide.runCell('print("arbitrary learner code")',false));
  assert.equal(result.code,'print("arbitrary learner code")');
  assert.equal(result.wantPickle,false);
  assert.equal(world.__storeAudit.duringRestore.length,0);
  assert.equal(world.__storeAudit.studentRuns.length,1);
  assert.equal(world.__storeAudit.cellRuns.length,1);
  assert.ok(world.__storeAudit.wrapped.includes('python.runCell'));
});

test('pending-flush spy observes an actual adapter read without replacing it',()=>{
  const world=fixture(), inputs={fields:{answer:'pending'}};
  const options={component:'math-exercise',id:'fixture',read(){assert.equal(this,options);return inputs;}};
  world.CTMStore.register(options);
  assert.equal(world.__storeAudit.readCalls.length,0);
  assert.equal(options.read(),inputs);
  assert.equal(world.__storeAudit.readCalls.length,1);
});
