// Diagnostic-only boundary. Default capture is transparent; controlled policies
// defer only the selected owner's callback by one animation frame. Never filter errors.
export function traceResizeObservers(options={}) {
  const host=window;
  const defer=options.defer || 'none';
  if(!['none','quarto','monaco','both'].includes(defer))throw Error('Unknown observer diagnostic policy');
  // Capture the browser scheduler before any Playwright clock installation.
  const nativeFrame=host.requestAnimationFrame.bind(host);
  const Native=window.ResizeObserver;
  const trace=window.__ctmResizeTrace={available:typeof Native==='function',constructors:[],deliveries:[],measurementErrors:[],callbacks:[]};
  Object.defineProperty(trace,'flush',{value:()=>new Promise(resolve=>nativeFrame(()=>nativeFrame(resolve)))});
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
      const owner=stack.includes('/quarto-html/quarto.js')?'quarto':
        stack.includes('/monaco-editor@')?'monaco':'other';
      const deferred=owner!=='other' && (defer===owner || defer==='both');
      const activity={id,owner,deferred,deliveries:0,queued:0,executed:0,pending:0};
      push(trace.callbacks,activity,16);
      const forwarded=args.slice();
      forwarded[0]=function(...callbackArgs) {
        activity.deliveries++;
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
        if(deferred) {
          // Controlled intervention only: preserve the actual callback and every
          // delivery, but move its execution outside this observer broadcast.
          const receiver=this;
          activity.queued++;activity.pending++;
          nativeFrame(()=>{
            activity.pending--;activity.executed++;
            return Reflect.apply(callback,receiver,callbackArgs);
          });
          return;
        }
        activity.executed++;
        return Reflect.apply(callback,this,callbackArgs);
      };
      return Reflect.construct(target,forwarded,newTarget);
    }
  });
}
