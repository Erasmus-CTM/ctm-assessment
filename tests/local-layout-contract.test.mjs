import test from 'node:test';
import assert from 'node:assert/strict';
import {assertLocalControls} from '../integration/resize-probe/local-contract.mjs';

function samples() {
  return ['native', 'original', 'editors', 'both'].flatMap(mode => Array.from({length:4}, () => ({
    case:'editors', mode, editorStartErrors:0, interactionErrors:['editors','both'].includes(mode)?0:1,
    interactionPageErrors:['editors','both'].includes(mode)?0:1,
    pageerrors:['editors','both'].includes(mode)?[]:[{message:'ResizeObserver loop completed with undelivered notifications.'}],
    final:{errors:['editors','both'].includes(mode)?[]:[{message:'ResizeObserver loop completed with undelivered notifications.'}]}
  })));
}

test('clean natural startup does not invalidate reproduced native interaction controls', () => {
  const rows=samples();
  rows.push({case:'startup',mode:'native',pageerrors:[],final:{errors:[]}});
  assert.doesNotThrow(()=>assertLocalControls('webkit',rows));
});

test('each native control must reproduce after the boundary in both collectors', () => {
  for(const mode of ['native','original'])for(const key of ['interactionErrors','interactionPageErrors']){
    const rows=samples();rows.filter(s=>s.mode===mode).forEach(s=>s[key]=0);
    assert.throws(()=>assertLocalControls('webkit',rows),/both raw collectors/);
  }
  assert.throws(()=>assertLocalControls('webkit',samples().filter((s,i)=>i!==0)),/four samples/);
});

test('integrated pair still refuses either raw error collector and missing evidence', () => {
  for(const key of ['pageerrors','window']){
    const rows=samples(),row=rows.find(s=>s.mode==='both');
    (key==='window'?row.final.errors:row.pageerrors).push({message:'raw failure'});
    assert.throws(()=>assertLocalControls('webkit',rows),/zero raw errors/);
  }
  assert.throws(()=>assertLocalControls('chromium',[]),/must exist/);
  for(const key of ['interactionErrors','interactionPageErrors']){
    const rows=samples();rows.find(s=>s.mode==='editors')[key]=1;
    assert.throws(()=>assertLocalControls('webkit',rows),/zero new raw errors/);
  }
});
