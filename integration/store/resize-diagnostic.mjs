// Read-only diagnostic boundary; never schedule, resize, or suppress page errors.
export function traceResizeObservers() {
  const Native=window.ResizeObserver;
  const trace=window.__ctmResizeTrace={available:typeof Native==='function',constructors:[],deliveries:[],measurementErrors:[]};
  if(typeof Native!=='function')return;
  let sequence=0;
  function push(list,value,limit) {
    list.push(value);
    if(list.length>limit)list.shift();
  }
  window.ResizeObserver=new Proxy(Native,{
    construct(target,args,newTarget) {
      // Forward invalid callbacks unchanged so native argument validation wins.
      if(typeof args[0]!=='function')return Reflect.construct(target,args,newTarget);
      const callback=args[0], id=++sequence;
      let stack='';
      try {
        stack=String(new Error('ResizeObserver constructed').stack || '').slice(0,4096);
        push(trace.constructors,{id,stack},16);
      } catch(error) {
        push(trace.measurementErrors,String(error),8);
      }
      const forwarded=args.slice();
      forwarded[0]=function(...callbackArgs) {
        try {
          const entries=callbackArgs[0];
          const targets=[];
          for(let i=0;i<Math.min(entries.length,16);i++) {
            const entry=entries[i], element=entry.target, rect=entry.contentRect;
            targets.push({
              id:element.id,
              tag:element.tagName,
              classes:typeof element.className==='string'?element.className:'',
              rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}
            });
          }
          push(trace.deliveries,{id,stack,entryCount:entries.length,targets},32);
        } catch(error) {
          // Catch measurement failures only. The learner callback is outside
          // this catch, so its original return/exception remains untouched.
          push(trace.measurementErrors,String(error),8);
        }
        return Reflect.apply(callback,this,callbackArgs);
      };
      return Reflect.construct(target,forwarded,newTarget);
    }
  });
}
