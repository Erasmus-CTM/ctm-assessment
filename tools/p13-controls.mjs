// Main-world DOM reads plus native input. WebKit's isolated selector world can
// stall after terminating a busy Wasm worker while the page remains responsive.
function dom({selector,text,first,operation,enabled=false}) {
  const normalize=s=>s.replace(/\s+/g,' ').trim().toLowerCase();
  const matches=Array.from(document.querySelectorAll(selector)).filter(e=>text===null||normalize(e.textContent).includes(normalize(text)));
  if(operation==='count')return first?Math.min(matches.length,1):matches.length;
  if(!first&&matches.length>1)throw new Error('Strict control lookup matched multiple elements: '+selector);
  const e=matches[0];
  if(!e)return false;
  const disabled=()=>{
    if(e.matches(':disabled'))return true;
    for(let n=e;n;n=n.parentElement){
      const aria=n.getAttribute('aria-disabled');
      if(aria==='true')return true;
      if(aria==='false')return false;
    }
    return false;
  };
  if(operation==='attached')return true;
  if(operation==='ready')return e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&(!enabled||!disabled());
  if(operation==='disabled')return disabled();
  if(operation==='text')return e.textContent;
  if(operation==='value'){
    if(!(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement))throw new Error('Control has no input value: '+selector);
    return e.value;
  }
  if(operation==='element')return e;
  if(operation==='pointer'){
    if(disabled())throw new Error('Control is disabled: '+selector);
    e.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
    const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    if(!r.width||!r.height||!e.contains(document.elementFromPoint(x,y)))throw new Error('Control is covered: '+selector);
    return {x,y};
  }
  if(operation==='edit'){
    if(!(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement)||e.readOnly||e.getAttribute('aria-readonly')==='true')throw new Error('Control is not editable: '+selector);
    if(disabled())throw new Error('Control is disabled: '+selector);
    e.focus();if(document.activeElement!==e)throw new Error('Control could not receive focus: '+selector);
    e.select();return true;
  }
  if(operation==='focus'){e.focus();return true;}
  throw new Error('Unknown control operation');
}
export function control(page,selector,text=null,first=false) {
  const key={selector,text,first};
  const read=operation=>page.evaluate(dom,{...key,operation});
  const wait=async(operation='ready',enabled=false,timeout=30000)=>{
    const deadline=Date.now()+timeout;
    for(;;){
      const remaining=deadline-Date.now();
      if(remaining<=0)throw new Error('Timeout '+timeout+'ms waiting for control: '+selector);
      let timer;
      try {
        const found=await Promise.race([page.evaluate(dom,{...key,operation,enabled}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timeout '+timeout+'ms reading control: '+selector)),remaining);})]);
        if(found)return;
      }finally{clearTimeout(timer);}
      await new Promise(resolve=>setTimeout(resolve,Math.min(50,Math.max(0,deadline-Date.now()))));
    }
  };
  return {
    first(){return control(page,selector,text,true);},
    filter({hasText}){if(first)throw new Error('Filter before selecting the first control');return control(page,selector,hasText,false);},
    waitFor({timeout=30000}={}){return wait('ready',false,timeout);},
    count(){return read('count');},
    async isDisabled(){await wait('attached');return read('disabled');},
    async textContent(){await wait('attached');return read('text');},
    async inputValue(){await wait('attached');return read('value');},
    async click({timeout=30000}={}){await wait('ready',true,timeout);const point=await read('pointer');await page.mouse.click(point.x,point.y);},
    async fill(value,{timeout=30000}={}){await wait('ready',true,timeout);await read('edit');if(value==='')await page.keyboard.press('Backspace');else await page.keyboard.insertText(value);},
    async press(value,{timeout=30000}={}){await wait('ready',true,timeout);await read('focus');await page.keyboard.press(value);},
    async evaluate(fn){await wait('attached');const handle=await page.evaluateHandle(dom,{...key,operation:'element'});try{return await handle.evaluate(fn);}finally{await handle.dispose();}}
  };
}
