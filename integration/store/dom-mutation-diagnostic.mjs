// Read-only DOM mutation attribution. No geometry/style-computation reads.
// Mutation absence cannot exclude CSSOM, fonts, viewport or native layout.
export function installMutationDiagnostic() {
  const host=window, now=host.performance.now.bind(host.performance);
  const state=host.__ctmDOMTrace={
    available:typeof host.MutationObserver==='function',
    clockAlreadyInstalled:Boolean(host.__pwClock),totalRecords:0,totalBatches:0,
    droppedBatches:0,truncatedRecords:0,batches:[],measurementErrors:[],
    nativeErrors:[],totalNativeErrors:0,droppedNativeErrors:0,
    callbackSpans:[],totalCallbacks:0,droppedCallbacks:0,
    limits:'DOM records do not cover CSSOM/font/viewport/native layout changes; retained records may be truncated.'
  };
  function bound(list,value,limit) {list.push(value);if(list.length>limit)list.shift();}
  function short(value) {
    if(value==null)return null;
    const text=String(value);return {value:text.slice(0,160),truncated:text.length>160};
  }
  function depth(node) {
    let count=0,current=node;
    while(current?.parentNode && count<64){current=current.parentNode;count++;}
    return {value:count,truncated:Boolean(current?.parentNode)};
  }
  function identity(node) {
    const element=node?.nodeType===1?node:node?.parentElement;
    return {name:node?.nodeName || '',tag:element?.tagName || '',id:element?.id || '',
      classes:typeof element?.className==='string'?element.className:'',parentDepth:depth(node)};
  }
  const getAttribute=host.Element?.prototype?.getAttribute;
  function describe(record) {
    const value=record.type==='attributes'
      ? (getAttribute?Reflect.apply(getAttribute,record.target,[record.attributeName]):record.target.getAttribute(record.attributeName)) : null;
    return {type:record.type,target:identity(record.target),attribute:record.attributeName || null,
      old:short(record.oldValue),current:short(value),
      addedCount:record.addedNodes?.length || 0,removedCount:record.removedNodes?.length || 0,
      added:Array.from(record.addedNodes || []).slice(0,4).map(identity),
      removed:Array.from(record.removedNodes || []).slice(0,4).map(identity)};
  }
  function capture(records,phase,owner) {
    if(!records.length)return;
    state.totalBatches++;state.totalRecords+=records.length;
    state.truncatedRecords+=Math.max(0,records.length-16);
    const batch={at:now(),phase,owner,total:records.length,truncated:records.length>16,records:records.slice(0,16).map(describe)};
    if(state.batches.length===64)state.droppedBatches++;
    bound(state.batches,batch,64);
  }
  let observer;
  function safelyCapture(records,phase,owner) {
    try {capture(records,phase,owner);} catch(error) {bound(state.measurementErrors,String(error),16);}
  }
  function take(phase,owner) {
    if(!observer)return;
    try {safelyCapture(observer.takeRecords(),phase,owner);}
    catch(error){bound(state.measurementErrors,String(error),16);}
  }
  if(state.available) {
    try {
      observer=new host.MutationObserver(records=>safelyCapture(records,'outside-callback',null));
      observer.observe(host.document,{subtree:true,childList:true,attributes:true,attributeOldValue:true,characterData:true,characterDataOldValue:true});
    } catch(error) {state.available=false;bound(state.measurementErrors,String(error),16);}
  }
  host.addEventListener('error',event=>{
    try {
      state.totalNativeErrors++;
      if(state.nativeErrors.length===32)state.droppedNativeErrors++;
      bound(state.nativeErrors,{at:now(),message:String(event.message || ''),file:String(event.filename || ''),line:event.lineno || 0,column:event.colno || 0},32);
    } catch(error){bound(state.measurementErrors,String(error),16);}
  },true);
  host.__ctmDOMDiagnostic={
    now,depth,
    before(owner){take('before-callback',owner);return {at:now(),records:state.totalRecords};},
    after(owner,start){
      take('inside-callback',owner);
      try {
        state.totalCallbacks++;
        if(state.callbackSpans.length===64)state.droppedCallbacks++;
        bound(state.callbackSpans,{owner,at:start.at,ended:now(),records:state.totalRecords-start.records},64);
      } catch(error){bound(state.measurementErrors,String(error),16);}
    },
    snapshot(){take('snapshot',null);return state;}
  };
}
