// Actual Quarto package pages in Chromium, Firefox and WebKit. No component
// scripts, editor adapters, store implementation or Python runtime are replaced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as playwright from 'playwright';
import {serve} from '../../tools/compare-browser.mjs';
import {instrument,denyStoreWrites} from './instrument.mjs';
import {traceResizeObservers} from './resize-diagnostic.mjs';

const root=path.resolve(process.env.CTM_STORE_ROOT || '.store-integration');
const engine=process.env.CTM_BROWSER || 'chromium';
assert.ok(['chromium','firefox','webkit'].includes(engine));
const roots={course:path.join(root,'before','_site')};
const server=await serve(roots,true);
const base='http://127.0.0.1:'+server.address().port+'/course/';
let browser;
const checks=[], errors=[];
const traceResize=process.env.CTM_TRACE_RESIZE==='1';
const resizeReads=[], resizeFailures=[], resizeFinals=[];
async function captureResizeFinal(ctx) {
  if(!traceResize)return;
  for(const page of ctx.pages()) {
    try {
      const trace=await page.evaluate(async()=>{
        if(!window.__ctmResizeTrace)return null;
        await window.__ctmResizeTrace.flush();
        const trace=window.__ctmResizeTrace;
        return {available:trace.available,callbacks:trace.callbacks,measurementErrors:trace.measurementErrors};
      });
      resizeFinals.push({page:page.url(),phase:checks.length,trace});
    } catch(error) { resizeFinals.push({page:page.url(),phase:checks.length,traceReadError:String(error)}); }
  }
}
let active;
function cell(page,id){return page.locator('[data-ctm-component="math-exercise"][data-ctm-id="'+id+'"]');}
const quiz=page=>page.locator('[data-ctm-quiz="mixed"] .ctm-progress');
const pagePanel=page=>page.locator('.ctm-progress-page .ctm-progress');
async function context(extra) {
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  if(traceResize)await ctx.addInitScript(traceResizeObservers,{defer:process.env.CTM_RESIZE_DEFER || 'none'});
  await ctx.addInitScript(instrument);
  if(extra) await ctx.addInitScript(extra);
  ctx.on('page',page=>{
    page.setDefaultTimeout(90000);
    page.on('dialog',dialog=>dialog.accept());
    page.on('pageerror',error=>{
      errors.push({page:page.url(),phase:checks.length,message:error.message,stack:error.stack});
      if(traceResize) {
        const at={page:page.url(),phase:checks.length,message:error.message};
        resizeReads.push(page.evaluate(()=>window.__ctmResizeTrace).then(trace=>resizeFailures.push({...at,trace})).catch(error=>resizeFailures.push({...at,traceReadError:String(error)})));
      }
    });
  });
  return ctx;
}
async function open(ctx,name='index.html'){
  const page=await ctx.newPage();active=page;
  await goto(page,name);return page;
}
async function goto(page,name='index.html'){
  await captureResizeFinal(page.context());
  await page.goto(base+name,{waitUntil:'domcontentloaded'});
  await ready(page,name);
}
async function ready(page,name='index.html'){
  await page.locator('.ctm-save-bar').waitFor({state:'visible'});
  await page.waitForFunction(()=>window.CTMStore && window.__storeEntries.some(e=>e.options.component==='math-exercise'));
  if(name==='index.html') await page.waitForFunction(()=>
    window.__storeEntries.some(e=>e.options.component==='py-exercise') &&
    window.qpyodideCellContainer?.cells.find(c=>c.options.label==='store-cell')?.primaryUnit?.editor && window.qpyodideCellsReady && window.qpyodideStartupPhaseDone && window.__storeAudit.wrapped.includes('python.runCell'));
  await noRestorePython(page,name==='index.html');
}
async function noRestorePython(page,mixed=false) {
  const audit=await page.evaluate(()=>({requests:__storeAudit.pythonRequests,cells:__storeAudit.cellRuns,during:__storeAudit.duringRestore,checks:__storeAudit.checkerCalls,wrapped:__storeAudit.wrapped,studentRuns:__storeAudit.studentRuns,restores:__storeAudit.restores.length}));
  assert.ok(audit.wrapped.includes('runtime.callCheckers'),'spy wraps the actual runtime boundary');
  if(mixed) {
    assert.ok(audit.wrapped.includes('python.globals.set'),'spy observes actual structured Python requests');
    assert.ok(audit.wrapped.includes('python.runCell'),'spy observes actual worker plugin execution');
  }
  assert.deepEqual(audit.requests,[],'restoration must not dispatch private Python requests');
  assert.deepEqual(audit.cells,[],'restoration must not dispatch worker cell runs');
  assert.deepEqual(audit.during,[],'restore may not start Python or checker installation/calls');
  assert.ok(audit.restores>0,'the actual component restore path was observed');
  assert.deepEqual(audit.studentRuns,[],'neither saved code nor starter code is executed on restoration');
  assert.equal(audit.checks,0,'the test never asks a checker to regrade restored work');
}
async function reveal(page,id){
  await page.evaluate(id=>CTMNav.reveal([...document.querySelectorAll('[data-ctm-component="math-exercise"]')].find(e=>e.dataset.ctmId===id)),id);
}
async function seed(page,id,status,score,index=0){
  await page.evaluate(({id,status,score,index})=>{
    const entry=__storeEntries.filter(e=>e.options.element?.getAttribute('data-ctm-id')===id)[index];
    if(!entry)throw Error('Missing real component registration '+id);
    entry.handle.result({status,score});
  },{id,status,score,index});
}
async function saved(page,id,predicate) {
  await page.waitForFunction(({id,source})=>{
    const record=JSON.parse(localStorage.getItem(CTMStore.key(id)) || 'null');
    return record && (new Function('record','return ('+source+')(record)'))(record);
  },{id,source:predicate.toString()});
}
async function pyCode(page,code){
  await page.evaluate(code=>{
    const model=monaco.editor.getModels().find(model=>model.getValue().includes('def stored_add'));
    if(!model)throw Error('Actual Python Monaco model not found');
    model.setValue(code);
  },code);
}
async function pyRead(page){
  return page.evaluate(()=>__storeEntries.find(e=>e.options.component==='py-exercise').options.read()?.code || '');
}
async function codeCell(page,code){
  return page.evaluate(code=>{
    const unit=qpyodideCellContainer.cells.find(c=>c.options.label==='store-cell').primaryUnit;
    if(code!==null)unit.editor.setValue(code);
    return unit.editor.getValue();
  },code);
}
async function observeRemote(page) {
  await page.evaluate(()=>{
    window.__remoteStoreEvents=[];
    if(window.__remoteStoreObserved)return;
    window.__remoteStoreObserved=true;
    document.addEventListener('ctm:store-clear',event=>__remoteStoreEvents.push({type:event.type,detail:event.detail}));
    window.addEventListener('storage',event=>{
      if(event.key?.startsWith('ctm|1|'))__remoteStoreEvents.push({type:'storage',key:event.key,removed:event.newValue===null});
    });
  });
}
async function remoteReset(page,id) {
  // The page clock is paused, so poll from Node rather than relying on its rAF.
  for(let attempt=0;attempt<100;attempt++){
    const delivered=await page.evaluate(()=>__remoteStoreEvents.some(event=>event.type==='ctm:store-clear'));
    if(delivered && await cell(page,id).locator('input.math-input').inputValue()==='')return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  const state=await page.evaluate(id=>({
    events:window.__remoteStoreEvents,
    record:localStorage.getItem(CTMStore.key(id)),
    reads:__storeAudit.readCalls
  }),id);
  state.input=await cell(page,id).locator('input.math-input').inputValue();
  throw Error('Remote clear did not reset '+id+': '+JSON.stringify(state));
}
async function showSaved(offer) {
  // Follow the reader's actual path: open its tab, then its native disclosure.
  // innerText on a collapsed details descendant differs across browser engines.
  assert.equal(await offer.evaluate(element=>element.open),false,'saved answer starts collapsed');
  await offer.evaluate(element=>CTMNav.reveal(element.parentElement));
  assert.equal(await offer.evaluate(element=>element.open),false,'navigation does not reveal the old answer automatically');
  await offer.locator(':scope > summary').click();
  assert.equal(await offer.evaluate(element=>element.open),true,'the real saved-answer summary opens its disclosure');
  await offer.locator('pre').waitFor({state:'visible'});
  assert.equal(await offer.locator('input,textarea,[contenteditable="true"]').count(),0,'old answers stay read-only');
  return offer.locator('pre').innerText();
}
async function assertRecordMissing(page,id){
  assert.equal(await page.evaluate(id=>localStorage.getItem(CTMStore.key(id)),id),null);
}
try {
  browser=await playwright[engine].launch({headless:true});
  // Persist real inputs, a matrix shape, a non-default pool choice and both
  // actual code editors. Historical verdicts are seeded via the real store
  // adapter boundary; grading parity is covered by the existing parity lane.
  {
    const ctx=await context(), page=await open(ctx);
    assert.equal(await quiz(page).locator('button').count(),4);
    assert.equal(await pagePanel(page).locator('button').count(),4);
    await reveal(page,'store-scalar');
    await cell(page,'store-scalar').locator('input.math-input').fill('2');
    await seed(page,'store-scalar','correct',1);
    await quiz(page).locator('button').nth(1).click();
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-ctm-id')==='store-matrix');
    assert.equal(await cell(page,'store-matrix').evaluate(e=>e.closest('details').open),true);
    const matrix=cell(page,'store-matrix');
    await matrix.locator('[data-dynamic-action="add-row"]').click();
    await matrix.locator('[data-dynamic-action="add-col"]').click();
    for(const [i,value] of ['1','2','3','4'].entries())await matrix.locator('input.math-input').nth(i).fill(value);
    await seed(page,'store-matrix','partial',0.5);
    await reveal(page,'store-pool');
    await cell(page,'store-pool').locator('.math-pool-reload').click();
    assert.match(await cell(page,'store-pool').innerText(),/Second pool task/);
    await cell(page,'store-pool').locator('input.math-input').fill('0');
    await seed(page,'store-pool','wrong',0);
    const python='def stored_add(a, b):\n    return a + b # stored learner code';
    await pyCode(page,python);
    await page.evaluate(()=>__storeEntries.find(e=>e.options.component==='py-exercise').handle.result({status:'correct',score:1}));
    await codeCell(page,'print("stored learner cell")');
    await saved(page,'store-cell',record=>record.inputs.code==='print("stored learner cell")');
    await reveal(page,'store-outside');
    await cell(page,'store-outside').locator('input.math-input').fill('5');
    await seed(page,'store-outside','correct',1);
    for(const [i,value] of ['6','7'].entries()){
      const root=cell(page,'store-duplicate').nth(i);
      await root.locator('input.math-input').fill(value);
      await seed(page,'store-duplicate',i?'wrong':'partial',i?0:0.5,i);
    }
    const unlabeled=page.locator('.math-exercise-cell[data-ctm-id=""]');
    await unlabeled.locator('input.math-input').fill('8');
    await page.evaluate(()=>__storeEntries.find(e=>e.options.element?.matches('.math-exercise-cell[data-ctm-id=""]')).handle.result({status:'correct',score:1}));
    assert.equal(await quiz(page).locator('.ctm-progress-total').innerText(),'2.5 of 4');
    assert.equal(await pagePanel(page).locator('.ctm-progress-total').innerText(),'2.5 of 4');
    await assertRecordMissing(page,'store-duplicate');
    assert.equal(await page.evaluate(()=>JSON.parse(document.getElementById('ctm-store-manifest').textContent).exercises.filter(e=>e.component!=='pyodide-interaktiv' && !e.save).length),3);
    await saved(page,'store-matrix',record=>record.inputs.matrices.A.rows===2 && record.inputs.matrices.A.cols===2);
    await saved(page,'store-pool',record=>record.variant.n===2);
    await captureResizeFinal(ctx);
    await page.reload({waitUntil:'domcontentloaded'});await ready(page);
    assert.equal(await cell(page,'store-scalar').locator('input.math-input').inputValue(),'2');
    assert.deepEqual(await cell(page,'store-matrix').locator('input.math-input').evaluateAll(fields=>fields.map(f=>f.value)),['1','2','3','4']);
    assert.equal(await cell(page,'store-matrix').locator('.math-dynamic-matrix-wrap').evaluate(e=>e.matrixInput.read().rows),2);
    assert.match(await cell(page,'store-pool').innerText(),/Second pool task/);
    assert.equal(await cell(page,'store-pool').locator('input.math-input').inputValue(),'0');
    assert.equal(await pyRead(page),python);
    assert.equal(await codeCell(page,null),'print("stored learner cell")');
    assert.equal(await quiz(page).locator('.ctm-progress-total').innerText(),'2.5 of 4');
    assert.deepEqual(await cell(page,'store-duplicate').locator('input.math-input').evaluateAll(fields=>fields.map(f=>f.value)),['','']);
    assert.equal(await unlabeled.locator('input.math-input').inputValue(),'');
    checks.push('real fields, dynamic matrix shape, second pool variant, Python and Pyodide code restore without Python; unsaved labels remain progress tiles');

    // Use the actual independent reset controls; leave another answer dirty
    // while resetting so an adapter cannot accidentally reset the whole page.
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.locator('.py-exercise-reset').click();
    await assertRecordMissing(page,'store-python');
    assert.equal(await codeCell(page,null),'print("stored learner cell")');
    assert.equal(await page.evaluate(()=>monaco.editor.getModels().find(m=>m.getValue().includes('def stored_add')).getValue()),await page.evaluate(()=>__pyExercises.find(e=>e.label==='store-python').starter));
    await pyCode(page,python);
    await page.evaluate(()=>__storeEntries.find(e=>e.options.component==='py-exercise').handle.result({status:'correct',score:1}));
    const resetId=await page.evaluate(()=>qpyodideCellContainer.cells.find(c=>c.options.label==='store-cell').primaryUnit.resetButton.id);
    await page.locator('[id="'+resetId+'"]').click();
    await assertRecordMissing(page,'store-cell');
    assert.equal(await codeCell(page,null),'print("store cell starter")');
    assert.equal(await pyRead(page),python);
    checks.push('Python and Pyodide independent Reset controls preserve the other current editor');

    roots.course=path.join(root,'after','_site');
    await goto(page);
    assert.equal(await cell(page,'store-scalar').locator('input.math-input').inputValue(),'');
    assert.match(await showSaved(cell(page,'store-scalar').locator('.math-saved-answer details')),/2/);
    assert.equal(await cell(page,'store-scalar').locator('input.math-input').inputValue(),'');
    assert.equal(await cell(page,'store-pool').locator('input.math-input').inputValue(),'');
    assert.match(await showSaved(cell(page,'store-pool').locator('.math-saved-answer details')),/0/);
    assert.equal(await cell(page,'store-pool').locator('input.math-input').inputValue(),'');
    assert.match(await showSaved(page.locator('.py-exercise-saved-outdated')),/stored learner code/);
    assert.equal(await page.evaluate(()=>monaco.editor.getModels().find(m=>m.getValue().includes('def stored_add')).getValue()),await page.evaluate(()=>__pyExercises.find(e=>e.label==='store-python').starter));
    assert.equal(await quiz(page).locator('.ctm-progress-outdated').count(),3);
    await noRestorePython(page);
    checks.push('changed ordinary/variant/Python source offers read-only old answers and outdated tiles without rechecking');
    if(traceResize)await Promise.allSettled(resizeReads);
    await captureResizeFinal(ctx);
    await ctx.close();roots.course=path.join(root,'before','_site');
  }
  {
    const ctx=await context(), page=await open(ctx);
    await reveal(page,'store-scalar');
    await cell(page,'store-scalar').locator('input.math-input').fill('copy while saving off');
    await seed(page,'store-scalar','partial',0.5);
    await page.locator('[data-ctm-save-toggle]').click();
    assert.equal(await page.evaluate(()=>CTMStore.enabled()),false);
    await cell(page,'store-scalar').locator('.math-copy-answer').click();
    await page.waitForFunction(()=>__storeAudit.copies.some(text=>text.includes('copy while saving off')));
    await page.locator('[data-ctm-export]').click();
    assert.match(await page.locator('#ctm-export-view textarea').inputValue(),/copy while saving off/);
    await assertRecordMissing(page,'store-scalar');
    await goto(page);
    assert.equal(await cell(page,'store-scalar').locator('input.math-input').inputValue(),'');
    assert.equal(await page.evaluate(()=>CTMStore.enabled()),false);
    checks.push('device saving off deletes answers, keeps live copy/export and remains off after navigation');
    await noRestorePython(page);
    if(traceResize)await Promise.allSettled(resizeReads);
    await captureResizeFinal(ctx);
    await ctx.close();
  }
  {
    const ctx=await context(denyStoreWrites), page=await open(ctx);
    await reveal(page,'store-scalar');
    await cell(page,'store-scalar').locator('input.math-input').fill('memory only');
    await seed(page,'store-scalar','correct',1);
    assert.ok((await page.locator('.ctm-save-status').innerText()).length);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ctm|1|')).length),0);
    await goto(page);
    assert.equal(await cell(page,'store-scalar').locator('input.math-input').inputValue(),'');
    checks.push('unavailable device storage falls back without persisting or executing restored code');
    await noRestorePython(page);
    if(traceResize)await Promise.allSettled(resizeReads);
    await captureResizeFinal(ctx);
    await ctx.close();
  }
  {
    const ctx=await context(), a=await open(ctx), b=await open(ctx);
    await reveal(a,'store-scalar');await reveal(b,'store-scalar');
    await cell(a,'store-scalar').locator('input.math-input').fill('before clear');
    await seed(a,'store-scalar','correct',1);
    await saved(a,'store-scalar',record=>Object.values(record.inputs.fields).includes('before clear'));
    await observeRemote(b);
    // Hold the real debounce before typing; a slow runner cannot flush it first.
    await b.clock.install({time:new Date('2026-10-21T00:00:00Z')});
    // Playwright clocks span the whole context. Navigation replays its log in
    // each page, so a target read from only b can be in a's past. Fixed daily
    // checkpoints exceed this workflow's 15-minute bound for both pages.
    await b.clock.pauseAt(new Date('2026-10-22T00:00:00Z'));
    await cell(b,'store-scalar').locator('input.math-input').fill('pending remote save');
    assert.equal(await b.evaluate(()=>Object.values(JSON.parse(localStorage.getItem(CTMStore.key('store-scalar'))).inputs.fields).includes('pending remote save')),false);
    await a.locator('[data-ctm-clear-page]').click();
    await remoteReset(b,'store-scalar');
    await assertRecordMissing(b,'store-scalar');
    const pageReads=await b.evaluate(()=>__storeAudit.readCalls.length);
    await b.clock.runFor(1000);
    assert.equal(await b.evaluate(()=>__storeAudit.readCalls.length),pageReads,'remote page clear cancels the pending adapter read/flush');
    await assertRecordMissing(b,'store-scalar');
    await b.clock.resume();
    await goto(a);await goto(b);
    await assertRecordMissing(a,'store-scalar');
    assert.equal(await cell(b,'store-scalar').locator('input.math-input').inputValue(),'');
    await goto(b,'second.html');
    await cell(b,'store-second').locator('input.math-input').fill('second page');
    await seed(b,'store-second','correct',1);
    await reveal(a,'store-scalar');
    await cell(a,'store-scalar').locator('input.math-input').fill('first page');
    await seed(a,'store-scalar','correct',1);
    await a.locator('[data-ctm-clear-page]').click();
    assert.equal(await cell(b,'store-second').locator('input.math-input').inputValue(),'second page');
    await saved(b,'store-second',record=>Object.values(record.inputs.fields).includes('second page'));
    await observeRemote(b);
    await b.clock.pauseAt(new Date('2026-10-23T00:00:00Z'));
    await cell(b,'store-second').locator('input.math-input').fill('pending course save');
    assert.equal(await b.evaluate(()=>Object.values(JSON.parse(localStorage.getItem(CTMStore.key('store-second'))).inputs.fields).includes('pending course save')),false);
    await a.locator('[data-ctm-clear-course]').click();
    await remoteReset(b,'store-second');
    await assertRecordMissing(b,'store-second');
    const courseReads=await b.evaluate(()=>__storeAudit.readCalls.length);
    await b.clock.runFor(1000);
    assert.equal(await b.evaluate(()=>__storeAudit.readCalls.length),courseReads,'remote course clear cancels the pending adapter read/flush');
    await assertRecordMissing(b,'store-second');
    await b.clock.resume();await goto(b,'second.html');
    await assertRecordMissing(b,'store-second');await assertRecordMissing(a,'store-scalar');
    checks.push('page/course clear across two actual tabs cancels pending writes and preserves the other page until course clear');
    await noRestorePython(a);await noRestorePython(b);
    if(traceResize)await Promise.allSettled(resizeReads);
    await captureResizeFinal(ctx);
    await ctx.close();
  }
  const snapshots=[...resizeFailures,...resizeFinals];
  assert.ok(snapshots.every(row=>!row.traceReadError && (row.trace || row.page==='about:blank') &&
    (!row.trace || (Array.isArray(row.trace.measurementErrors) && row.trace.measurementErrors.length===0))),
    'a controlled policy is inconclusive if a required observer snapshot or measurement fails');
  const deferred=resizeFinals.flatMap(row=>row.trace?.callbacks || []).filter(row=>row.deferred && row.deliveries);
  assert.ok(deferred.every(row=>row.pending===0 && row.executed===row.deliveries),'a controlled policy is inconclusive unless every queued observer callback executes');
  assert.deepEqual(errors,[],'actual rendered pages have no uncaught errors');
  console.log(JSON.stringify({browser:engine,checks,errors,...(traceResize?{resizePolicy:process.env.CTM_RESIZE_DEFER || 'none',resizeFinals}:{})},null,2));
} catch(error) {
  await Promise.allSettled(resizeReads);
  console.error(JSON.stringify({browser:engine,checks,errors,url:active?.url(),...(traceResize?{resizePolicy:process.env.CTM_RESIZE_DEFER || 'none',resizeFailures,resizeFinals}:{})},null,2));
  if(active && !active.isClosed()) console.error(await active.locator('body').innerText().catch(()=>'(page closed)'));
  throw error;
} finally {
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
