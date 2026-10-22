import test from 'node:test';
import assert from 'node:assert/strict';
import {traceResizeObservers} from './resize-diagnostic.mjs';

function nativeFixture() {
  const calls=[];
  class ResizeObserver {
    constructor(callback,...rest) {
      if(typeof callback!=='function')throw new TypeError('native invalid callback');
      this.callback=callback;this.rest=rest;
    }
    observe(...args){calls.push({receiver:this,args});return 'native observed';}
  }
  const world={ResizeObserver};
  const original=globalThis.window;
  globalThis.window=world;
  try {traceResizeObservers();} finally {globalThis.window=original;}
  return {world,Native:ResizeObserver,calls};
}
function entry(id) {
  return {target:{id,tagName:'DIV',className:'fixture'},contentRect:{x:1,y:2,width:3,height:4}};
}

test('native construction, subclass, static API and validation remain native',()=>{
  const {world,Native,calls}=nativeFixture();
  Native.marker={stable:true};
  assert.equal(world.ResizeObserver.marker,Native.marker);
  assert.equal(world.ResizeObserver.prototype,Native.prototype);
  const callback=()=>{};
  const extra={extra:true};
  class Child extends world.ResizeObserver {}
  const observer=new Child(callback,extra);
  assert.ok(observer instanceof Child);
  assert.ok(observer instanceof Native);
  assert.deepEqual(observer.rest,[extra]);
  assert.equal(observer.observe('target','options'),'native observed');
  assert.equal(calls[0].receiver,observer);
  assert.deepEqual(calls[0].args,['target','options']);
  assert.throws(()=>new world.ResizeObserver(null),/native invalid callback/);
  assert.throws(()=>world.ResizeObserver(callback),TypeError);
});

test('actual callback receiver, every argument, return and thrown object survive',()=>{
  const {world}=nativeFixture();
  const receiver={}, entries=[entry('answer')], observerArgument={}, extra={extra:true};
  const returned={answer:42};
  const observer=new world.ResizeObserver(function(...args){
    assert.equal(this,receiver);
    assert.equal(args[0],entries);
    assert.equal(args[1],observerArgument);
    assert.equal(args[2],extra);
    return returned;
  });
  assert.equal(Reflect.apply(observer.callback,receiver,[entries,observerArgument,extra]),returned);
  assert.deepEqual(world.__ctmResizeTrace.deliveries[0].targets,[{
    id:'answer',tag:'DIV',classes:'fixture',rect:{x:1,y:2,width:3,height:4}
  }]);
  const thrown={original:true};
  const failing=new world.ResizeObserver(()=>{throw thrown;});
  assert.throws(()=>failing.callback(entries,observerArgument),error=>error===thrown);
});

test('measurement cannot read layout or mask the native callback',()=>{
  const {world}=nativeFixture();
  let calls=0, layoutReads=0;
  const item=entry('safe');
  item.target.getBoundingClientRect=()=>{layoutReads++;throw Error('layout forbidden');};
  const observer=new world.ResizeObserver(()=>++calls);
  assert.equal(observer.callback([item],observer),1);
  assert.equal(layoutReads,0);
  Object.defineProperty(item.target,'id',{get(){throw Error('measurement failed');}});
  assert.equal(observer.callback([item],observer),2);
  assert.equal(calls,2);
  assert.match(world.__ctmResizeTrace.measurementErrors[0],/measurement failed/);
});

test('retention is bounded and delivery keeps its owning constructor stack',()=>{
  const {world}=nativeFixture();
  let first;
  for(let n=0;n<50;n++) {
    const observer=new world.ResizeObserver(()=>{});
    if(!first)first=observer;
    observer.callback(Array.from({length:40},(_,i)=>entry(String(i))),observer);
  }
  first.callback([entry('old observer')],first);
  const trace=world.__ctmResizeTrace;
  assert.equal(trace.constructors.length,16);
  assert.equal(trace.deliveries.length,32);
  assert.equal(trace.deliveries[0].targets.length,16);
  assert.equal(trace.deliveries[0].entryCount,40);
  assert.equal(trace.deliveries.at(-1).id,1);
  assert.match(trace.deliveries.at(-1).stack,/ResizeObserver constructed/);
  assert.ok(trace.deliveries.every(row=>row.stack.length<=4096));
});
