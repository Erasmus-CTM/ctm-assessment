import test from 'node:test';
import assert from 'node:assert/strict';
import {installMutationDiagnostic} from './dom-mutation-diagnostic.mjs';
import {traceResizeObservers} from './resize-diagnostic.mjs';

function world() {
  const queue=[],listeners={},observed=[];
  class Element {
    constructor(name='DIV',parent=null){this.nodeType=1;this.nodeName=name;this.tagName=name;this.parentNode=parent;this.parentElement=parent?.nodeType===1?parent:null;this.id='target';this.className='fixture';this.attrs={style:'height:80px'};}
    getAttribute(name){return this.attrs[name] ?? null;}
    getBoundingClientRect(){throw Error('layout reads forbidden');}
  }
  class MutationObserver {
    constructor(callback){this.callback=callback;observed.push(this);}
    observe(target,options){this.target=target;this.options=options;}
    takeRecords(){return queue.splice(0);}
  }
  class ResizeObserver {constructor(callback){this.callback=callback;}}
  let ticks=100;
  const document={nodeType:9,nodeName:'#document',parentNode:null};
  const body=new Element('BODY',document),target=new Element('DIV',body);
  const host={document,Element,MutationObserver,ResizeObserver,performance:{now(){return ticks++;}},
    requestAnimationFrame(){throw Error('transparent capture must not schedule');},
    addEventListener(type,callback){listeners[type]=callback;}};
  const previous=globalThis.window;globalThis.window=host;
  try {installMutationDiagnostic();traceResizeObservers();}
  finally {globalThis.window=previous;}
  return {host,queue,listeners,observed,target,body,document};
}
const attribute=target=>({type:'attributes',target,attributeName:'style',oldValue:'height:40px',addedNodes:[],removedNodes:[]});
const entry=target=>({target,contentRect:{x:0,y:0,width:100,height:80}});

test('native time and before/inside records identify writes without layout or callback changes',()=>{
  const {host,queue,listeners,target}=world();
  host.performance.now=()=>{throw Error('mocked page clock used');};
  queue.push(attribute(target));
  const receiver={},returned={actual:true};
  const observer=new host.ResizeObserver(function(entries,actualObserver){
    assert.equal(this,receiver);assert.equal(actualObserver,observer);assert.equal(entries[0].target,target);
    queue.push({type:'childList',target,addedNodes:[target],removedNodes:[]});
    return returned;
  });
  assert.equal(Reflect.apply(observer.callback,receiver,[[entry(target)],observer]),returned);
  const state=host.__ctmDOMDiagnostic.snapshot();
  assert.equal(state.totalRecords,2);
  assert.equal(state.totalCallbacks,1);
  assert.equal(state.callbackSpans[0].records,1);
  assert.ok(state.callbackSpans[0].ended>=state.callbackSpans[0].at);
  assert.deepEqual(state.batches.map(row=>[row.phase,row.owner,row.total]),[['before-callback',1,1],['inside-callback',1,1]]);
  assert.equal(state.batches[0].records[0].target.parentDepth.value,2);
  assert.equal(state.batches[1].records[0].addedCount,1);
  const delivery=host.__ctmResizeTrace.deliveries[0];
  assert.equal(delivery.targets[0].parentDepth.value,2);
  assert.ok(delivery.at>=100);
  listeners.error({message:'actual native error',filename:'fixture.js',lineno:7,colno:9,
    preventDefault(){throw Error('error suppression forbidden');}});
  assert.equal(state.nativeErrors[0].message,'actual native error');
  assert.equal(state.measurementErrors.length,0);
});

test('retention exposes total counts, record truncation and dropped batches',()=>{
  const {host,queue,target}=world();
  queue.push(...Array.from({length:40},()=>attribute(target)));
  host.__ctmDOMDiagnostic.before(2);
  for(let n=0;n<70;n++){queue.push(attribute(target));host.__ctmDOMDiagnostic.after(2,{at:0,records:0});}
  const state=host.__ctmDOMDiagnostic.snapshot();
  assert.equal(state.totalRecords,110);assert.equal(state.totalBatches,71);
  assert.equal(state.truncatedRecords,24);assert.equal(state.batches.length,64);
  assert.equal(state.droppedBatches,7);
  assert.equal(state.totalCallbacks,70);assert.equal(state.callbackSpans.length,64);assert.equal(state.droppedCallbacks,6);
  const cycle={parentNode:null};cycle.parentNode=cycle;
  assert.deepEqual(host.__ctmDOMDiagnostic.depth(cycle),{value:64,truncated:true});
});

test('instrumentation failures stay explicit and never replace original callback exceptions',()=>{
  const {host,queue,target}=world();
  target.getAttribute=()=>{throw Error('instance override must not intercept native read');};
  queue.push(attribute(target));host.__ctmDOMDiagnostic.before(8);
  assert.equal(host.__ctmDOMTrace.measurementErrors.length,0);
  const broken={...attribute(target),target:{nodeType:1,attrs:{style:'x'},get parentNode(){throw Error('broken record');}}};
  queue.push(broken);
  const original={originalCallbackFailure:true};
  const observer=new host.ResizeObserver(()=>{throw original;});
  assert.throws(()=>observer.callback([entry(target)],observer),error=>error===original);
  assert.match(host.__ctmDOMTrace.measurementErrors[0],/broken record/);
});
