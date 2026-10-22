import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {installHeightDiagnostic,patchHeightCallback} from './layout-diagnostic.mjs';

test('native scheduling coalesces only our height callback and forwards its latest receiver/arguments',()=>{
  const frames=[], host={requestAnimationFrame(fn){frames.push(fn);return frames.length;}};
  const old=globalThis.window;globalThis.window=host;
  try {installHeightDiagnostic();} finally {globalThis.window=old;}
  let calls=0, received;
  const deferred=host.__ctmDeferEditorHeight(function(...args){calls++;received={receiver:this,args};},'py');
  const first={},last={};
  deferred.call(first,'first');deferred.call(last,'last',2);
  assert.equal(calls,0);assert.equal(frames.length,1);
  host.requestAnimationFrame=()=>{throw Error('test clock scheduler was used');};
  frames.shift()();
  assert.equal(calls,1);assert.equal(received.receiver,last);assert.deepEqual(received.args,['last',2]);
  assert.deepEqual(host.__ctmHeightTrace.callbacks[0],{component:'py',requests:2,queued:1,executed:1,pending:0});
  deferred.call(first,'another');assert.equal(calls,1);frames.shift()();assert.equal(calls,2);
  const original={callbackError:true};
  const throwing=host.__ctmDeferEditorHeight(()=>{throw original;},'cell');
  throwing();assert.throws(()=>frames.shift()(),error=>error===original);
  assert.equal(host.__ctmHeightTrace.callbacks[1].pending,0);
});

test('digest-checked interventions target only actual immutable component height callbacks',()=>{
  assert.ok(process.env.CTM_STORE_ROOT,'actual immutable rendered fixture is required');
  const roots={
    py:'py-exercise-0.5.0/py-exercise.js',
    cell:'pyodide-interaktiv-1.10.0/qpyodide-cell-classes.js'
  };
  for(const [component,file] of Object.entries(roots)) {
    for(const when of ['before','after']) {
      const original=fs.readFileSync(path.join(process.env.CTM_STORE_ROOT,when,'_site','site_libs','quarto-contrib',file),'utf8');
      assert.equal(patchHeightCallback(original,component,false).source,original);
      const record=patchHeightCallback(original,component,true);
      assert.equal(record.patched,true);
      assert.equal(record.source.split('window.__ctmDeferEditorHeight').length-1,1);
      assert.match(record.source,/automaticLayout:\s*true/);
      new vm.Script(record.source);
      assert.throws(()=>patchHeightCallback(original+'\n// changed',component,true),/differs from immutable fixture/);
      assert.throws(()=>patchHeightCallback(original,component==='py'?'cell':'py',true),/differs from immutable fixture/);
    }
  }
});
