const test=require('node:test'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
test('native controls reject readonly, duplicate and aria-disabled inputs without weakening DOM reads',async()=>{
 const {control}=await import('../tools/p13-controls.mjs');
 const engine=process.env.P13_BROWSER||'chromium';
 const browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.P13_BROWSER_EXECUTABLE||process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']}: {})});
 try {
  const page=await browser.newPage();
  await page.setContent('<button class="duplicate">One</button><button class="duplicate">Two</button><input class="prompt"><input class="prompt"><input id="readonly" readonly value="kept"><div role="group" aria-disabled="true"><button id="blocked">Blocked</button></div><input id="editable"><div id="hidden" style="display:none">Hidden output</div><button class="filtered"> Save </button><button class="filtered">Discard</button>');
  await page.evaluate(()=>{globalThis.events=[];document.addEventListener('click',e=>events.push(['click',e.target.textContent.trim(),e.isTrusted]));document.addEventListener('input',e=>events.push(['input',e.target.value,e.isTrusted]));});
  await assert.rejects(control(page,'.duplicate').click(),/Strict control lookup/);
  await assert.rejects(control(page,'.prompt').fill('wrong'),/Strict control lookup/);
  await assert.rejects(control(page,'.prompt').evaluate(e=>e.value),/Strict control lookup/);
  await assert.rejects(control(page,'#readonly').fill('wrong'),/not editable/);
  assert.equal(await control(page,'#readonly').inputValue(),'kept');
  assert.equal(await control(page,'#blocked').isDisabled(),true);
  await assert.rejects(control(page,'#blocked').click({timeout:100}),/Timeout/);
  assert.deepEqual(await page.evaluate(()=>events),[]);
  await control(page,'.duplicate').first().click();
  assert.equal(await control(page,'.duplicate').first().count(),1);
  assert.equal(await control(page,'.filtered').filter({hasText:'save'}).count(),1);
  await control(page,'.filtered').filter({hasText:'save'}).click();
  await control(page,'#editable').fill('Norsk æøå');
  assert.equal(await control(page,'#editable').inputValue(),'Norsk æøå');
  assert.equal(await control(page,'#hidden').textContent(),'Hidden output');
  const events=await page.evaluate(()=>events);
  assert.deepEqual(events.filter(e=>e[0]==='click'),[['click','One',true],['click','Save',true]]);
  const inputs=events.filter(e=>e[0]==='input');assert.ok(inputs.length>0);
  assert.equal(inputs.at(-1)[1],'Norsk æøå');assert.ok(inputs.every(e=>e[2]===true));
 }finally{await browser.close();}
});
