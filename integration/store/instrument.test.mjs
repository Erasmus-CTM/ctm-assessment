import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./instrument.mjs',import.meta.url),'utf8');
function fixture() {
  const world={navigator:{}};world.window=world;
  vm.runInNewContext(source.replace('export function instrument','function instrument')+'\ninstrument();',world);
  world.MathExerciseRuntime={ensurePyodide(){},ensureCheckers(){},callCheckers(){}};
  world.mainPyodide={runPythonAsync(){}};
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
test('deferred saved-code execution is caught outside the synchronous restore window',()=>{
  const world=fixture();
  world.CTMStore.register({component:'pyodide-interaktiv',id:'fixture'}).restore();
  world.mainPyodide.runPythonAsync('print("stored learner cell")');
  assert.equal(world.__storeAudit.duringRestore.length,0);
  assert.equal(world.__storeAudit.studentRuns.length,1);
});
