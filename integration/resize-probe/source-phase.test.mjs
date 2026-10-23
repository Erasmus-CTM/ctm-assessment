import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {monacoCanonicalPhase,monacoPhase,quartoBefore,quartoAfter} from './source-phase.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const canonical=fs.readFileSync(path.join(directory,'upstream/elementSizeObserver.ts'),'utf8');
assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(canonical)+'\0'+canonical).digest('hex'),
  '33eefc3aba8612430c2ffb46212aa173629ce454','Monaco 0.46.0 package vscodeRef exact canonical blob');
const changed=monacoCanonicalPhase(canonical);

function harness(source,amd=false) {
  const frames=[],calls=[],observers=[];
  const Native=class {
    constructor(callback){this.callback=callback;observers.push(this);}
    observe(element){this.element=element;}
    disconnect(){this.disconnected=true;}
  };
  const body=amd?source.match(/startObserving\(\)\{([\s\S]*?)\}stopObserving\(\)/)[1]:
    source.match(/public startObserving\(\): void \{([\s\S]*?)\n\t\}\n\n\tpublic stopObserving/)[1].replace(': IDimension | null','');
  const getWindow=()=>globalThis,scheduleAtNextAnimationFrame=(_window,run)=>frames.push(run);
  const start=Function('ResizeObserver','getWindow','scheduleAtNextAnimationFrame','y','return function(){'+body+'}')(Native,getWindow,scheduleAtNextAnimationFrame,{getWindow,scheduleAtNextAnimationFrame});
  const receiver={_referenceDomElement:{},_resizeObserver:null,observe:dimensions=>calls.push(dimensions)};
  const deliver=(width,height)=>observers.at(-1).callback([{contentRect:{width,height}}]);
  const frame=()=>{const pending=frames.splice(0);for(const run of pending)run();};
  start.call(receiver);
  return {frames,calls,observers,receiver,deliver,frame,restart:()=>start.call(receiver)};
}

test('upstream positive control executes its first layout during delivery',()=>{
  const h=harness(canonical);h.deliver(320,120);
  assert.deepEqual(h.calls,[{width:320,height:120}]);
});
test('candidate defers first layout, coalesces to newest box, and stays idle afterwards',()=>{
  const h=harness(changed);h.deliver(320,120);h.deliver(480,160);
  assert.deepEqual(h.calls,[]);assert.equal(h.frames.length,1);
  h.frame();assert.deepEqual(h.calls,[{width:480,height:160}]);assert.equal(h.frames.length,0);
  h.deliver(390,180);assert.equal(h.calls.length,1);h.frame();
  assert.deepEqual(h.calls.at(-1),{width:390,height:180});assert.equal(h.frames.length,0);
});
test('stop/restart prevents a queued old observation from laying out a replaced editor',()=>{
  const h=harness(changed);h.deliver(320,120);
  h.receiver._resizeObserver.disconnect();h.receiver._resizeObserver=null;h.restart();
  h.frame();assert.deepEqual(h.calls,[]);
  h.deliver(390,180);h.frame();assert.deepEqual(h.calls,[{width:390,height:180}]);
});
test('exceptions propagate and the scheduler can accept a later observation',()=>{
  const h=harness(changed);h.deliver(320,120);
  h.receiver.observe=()=>{throw Error('layout failed');};
  assert.throws(h.frame,/layout failed/);
  h.receiver.observe=dimensions=>h.calls.push(dimensions);h.deliver(390,180);h.frame();
  assert.deepEqual(h.calls,[{width:390,height:180}]);
});
const amdPath=process.env.CTM_RESIZE_MONACO_FILE || (process.env.CTM_RESIZE_MONACO&&path.join(process.env.CTM_RESIZE_MONACO,'min/vs/editor/editor.main.js'));
test('published AMD adapter has the same first/latest/stop behavior as the canonical source patch',{skip:!amdPath},()=>{
  const amd=fs.readFileSync(amdPath,'utf8');
  const original=harness(amd,true);original.deliver(320,120);assert.equal(original.calls.length,1);
  const h=harness(monacoPhase(amd),true);h.deliver(320,120);h.deliver(480,160);
  assert.deepEqual(h.calls,[]);assert.equal(h.frames.length,1);h.frame();assert.deepEqual(h.calls,[{width:480,height:160}]);
  h.deliver(390,180);h.receiver._resizeObserver.disconnect();h.receiver._resizeObserver=null;h.restart();h.frame();assert.equal(h.calls.length,1);
  h.deliver(400,200);h.frame();assert.deepEqual(h.calls.at(-1),{width:400,height:200});assert.equal(h.frames.length,0);
});
test('Quarto preserves throttle and width-first short circuit while moving work out of delivery',()=>{
  const frames=[],calls=[];
  let width=1280,reader=true;
  const callback=Function('throttle','layoutMarginEls','window','isReaderMode','quartoToggleReader','return '+quartoAfter.trim())(
    (callback,wait)=>{assert.equal(wait,50);return callback;},()=>calls.push('margins'),
    {requestAnimationFrame:run=>frames.push(run),document:{body:{getBoundingClientRect:()=>{calls.push('width');return {width};}}}},
    ()=>{calls.push('storage');return reader;},()=>calls.push('toggle'));
  callback();assert.deepEqual(calls,[]);frames.shift()();assert.deepEqual(calls,['margins','width']);
  calls.length=0;width=390;callback();frames.shift()();assert.deepEqual(calls,['margins','width','storage','toggle']);
  assert.ok(quartoBefore.includes('width < 990 &&\n          isReaderMode()'));
});
