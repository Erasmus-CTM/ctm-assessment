// Actual Quarto package pages in Chromium, Firefox and WebKit. No component
// scripts, editor adapters, store implementation or Python runtime are replaced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as playwright from 'playwright';
import {serve} from '../../tools/compare-browser.mjs';
import {instrument} from './instrument.mjs';

const root=path.resolve(process.env.CTM_STORE_ROOT || '.store-integration');
const engine=process.env.CTM_BROWSER || 'chromium';
assert.ok(['chromium','firefox','webkit'].includes(engine));
const roots={course:path.join(root,'before','_site')};
const server=await serve(roots,true);
const base='http://127.0.0.1:'+server.address().port+'/course/';
let browser;
const checks=[], errors=[];
let active;
function cell(page,id){return page.locator('[data-ctm-component="math-exercise"][data-ctm-id="'+id+'"]');}
const quiz=page=>page.locator('[data-ctm-quiz="mixed"] .ctm-progress');
const pagePanel=page=>page.locator('.ctm-progress-page .ctm-progress');
async function context(extra) {
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  await ctx.addInitScript(instrument);
  if(extra) await ctx.addInitScript(extra);
  ctx.on('page',page=>{
    page.setDefaultTimeout(90000);
    page.on('dialog',dialog=>dialog.accept());
    page.on('pageerror',error=>errors.push({page:page.url(),message:error.message}));
  });
  return ctx;
}
async function open(ctx,name='index.html'){
  const page=await ctx.newPage();active=page;
  await goto(page,name);return page;
}
async function goto(page,name='index.html'){
  await page.goto(base+name,{waitUntil:'domcontentloaded'});
  await ready(page,name);
}
async function ready(page,name='index.html'){
  await page.locator('.ctm-save-bar').waitFor({state:'visible'});
  await page.waitForFunction(()=>window.CTMStore && window.__storeEntries.some(e=>e.options.component==='math-exercise'));
  if(name==='index.html') await page.waitForFunction(()=>
    window.__storeEntries.some(e=>e.options.component==='py-exercise') &&
    window.qpyodideCellContainer?.cells.find(c=>c.options.label==='store-cell')?.primaryUnit?.editor);
  await noRestorePython(page);
}
async function noRestorePython(page) {
  const audit=await page.evaluate(()=>({during:__storeAudit.duringRestore,checks:__storeAudit.checkerCalls,wrapped:__storeAudit.wrapped,studentRuns:__storeAudit.studentRuns,restores:__storeAudit.restores.length}));
  assert.ok(audit.wrapped.includes('runtime.callCheckers'),'spy wraps the actual runtime boundary');
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
    assert.match(await cell(page,'store-scalar').locator('.math-saved-answer pre').innerText(),/2/);
    assert.equal(await cell(page,'store-pool').locator('input.math-input').inputValue(),'');
    assert.match(await cell(page,'store-pool').locator('.math-saved-answer pre').innerText(),/0/);
    assert.match(await page.locator('.py-exercise-saved-outdated pre').innerText(),/stored learner code/);
    assert.equal(await page.evaluate(()=>monaco.editor.getModels().find(m=>m.getValue().includes('def stored_add')).getValue()),await page.evaluate(()=>__pyExercises.find(e=>e.label==='store-python').starter));
    assert.equal(await quiz(page).locator('.ctm-progress-outdated').count(),3);
    await noRestorePython(page);
    checks.push('changed ordinary/variant/Python source offers read-only old answers and outdated tiles without rechecking');
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
    await ctx.close();
  }
  {
    const ctx=await context(()=>{
      Storage.prototype.setItem=function(){throw new DOMException('No device storage','QuotaExceededError');};
    }), page=await open(ctx);
    await reveal(page,'store-scalar');
    await cell(page,'store-scalar').locator('input.math-input').fill('memory only');
    await seed(page,'store-scalar','correct',1);
    assert.ok((await page.locator('.ctm-save-status').innerText()).length);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ctm|1|')).length),0);
    await goto(page);
    assert.equal(await cell(page,'store-scalar').locator('input.math-input').inputValue(),'');
    checks.push('unavailable device storage falls back without persisting or executing restored code');
    await noRestorePython(page);
    await ctx.close();
  }
  {
    const ctx=await context(), a=await open(ctx), b=await open(ctx);
    await reveal(a,'store-scalar');await reveal(b,'store-scalar');
    await cell(a,'store-scalar').locator('input.math-input').fill('before clear');
    await seed(a,'store-scalar','correct',1);
    await cell(b,'store-scalar').locator('input.math-input').fill('pending remote save');
    await a.locator('[data-ctm-clear-page]').click();
    await b.waitForFunction(()=>document.querySelector('[data-ctm-id="store-scalar"] input').value==='');
    await b.waitForTimeout(750);
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
    await a.locator('[data-ctm-clear-course]').click();
    await b.waitForFunction(()=>document.querySelector('[data-ctm-id="store-second"] input').value==='');
    await b.waitForTimeout(750);await goto(b,'second.html');
    await assertRecordMissing(b,'store-second');await assertRecordMissing(a,'store-scalar');
    checks.push('page/course clear across two actual tabs cancels pending writes and preserves the other page until course clear');
    await noRestorePython(a);await noRestorePython(b);
    await ctx.close();
  }
  assert.deepEqual(errors,[],'actual rendered pages have no uncaught errors');
  console.log(JSON.stringify({browser:engine,checks,errors},null,2));
} catch(error) {
  console.error(JSON.stringify({browser:engine,checks,errors,url:active?.url()},null,2));
  if(active && !active.isClosed()) console.error(await active.locator('body').innerText().catch(()=>'(page closed)'));
  throw error;
} finally {
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
