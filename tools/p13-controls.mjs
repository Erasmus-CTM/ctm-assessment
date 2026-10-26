// Main-world DOM reads plus native input. WebKit's isolated selector world can
// stall after terminating a busy Wasm worker while the page remains responsive.
export function control(page,selector,text=null) {
  const key={selector,text};
  const find=({selector,text})=>Array.from(document.querySelectorAll(selector)).find(e=>text===null||e.textContent.includes(text));
  const read=fn=>page.evaluate('('+fn.toString()+')('+JSON.stringify(key)+')');
  const attached=()=>page.waitForFunction(({selector,text})=>Array.from(document.querySelectorAll(selector)).some(e=>text===null||e.textContent.includes(text)),key,{timeout:30000});
  const ready=async(enabled=false)=>page.waitForFunction(({selector,text,enabled})=>{
    const e=Array.from(document.querySelectorAll(selector)).find(e=>text===null||e.textContent.includes(text));
    return !!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&(!enabled||!e.matches(':disabled'));
  },{...key,enabled},{timeout:30000});
  const api={
    first(){return api;},filter({hasText}){return control(page,selector,hasText);},
    waitFor(){return ready();},
    count(){return page.evaluate(selector=>document.querySelectorAll(selector).length,selector);},
    async isDisabled(){await attached();return read(k=>Array.from(document.querySelectorAll(k.selector)).find(e=>k.text===null||e.textContent.includes(k.text)).matches(':disabled'));},
    async textContent(){await attached();return read(k=>Array.from(document.querySelectorAll(k.selector)).find(e=>k.text===null||e.textContent.includes(k.text)).textContent);},
    async inputValue(){await attached();return read(k=>Array.from(document.querySelectorAll(k.selector)).find(e=>k.text===null||e.textContent.includes(k.text)).value);},
    async click(){
      await ready(true);
      const point=await page.evaluate(({selector,text})=>{
        const e=Array.from(document.querySelectorAll(selector)).find(e=>text===null||e.textContent.includes(text));
        e.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
        const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
        if(!r.width||!r.height||!e.contains(document.elementFromPoint(x,y)))throw new Error('Control is covered: '+selector);
        return {x,y};
      },key);
      await page.mouse.click(point.x,point.y);
    },
    async fill(value){await ready(true);await page.evaluate(({selector,value})=>{
      const e=document.querySelector(selector);e.focus();e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));
    },{selector,value});},
    async press(value){await ready(true);await page.evaluate(selector=>document.querySelector(selector).focus(),selector);await page.keyboard.press(value);},
    async evaluate(fn){await attached();return page.evaluate('('+fn.toString()+')(('+find.toString()+')('+JSON.stringify(key)+'))');}
  };
  return api;
}
