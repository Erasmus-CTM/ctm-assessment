export function instrument() {
  const audit = window.__storeAudit = {depth:0, duringRestore:[], checkerCalls:0, restores:[], wrapped:[], copies:[], studentRuns:[], pythonRequests:[], cellRuns:[], readCalls:[]};
  window.__storeEntries = [];
  Math.random = () => 0.1;
  // The OS clipboard is the only external write boundary replaced by the test.
  Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{
    writeText:async text => {audit.copies.push(String(text));},
    write:async items => {
      // Monaco uses ClipboardItem on WebKit; capture its plaintext too.
      for(const item of items) {
        if(item.types.includes('text/plain'))audit.copies.push(await (await item.getType('text/plain')).text());
      }
    }
  }});
  function intercept(name, decorate) {
    let value;
    Object.defineProperty(window,name,{configurable:true,get:()=>value,set:incoming=>{value=incoming;decorate(incoming);}});
  }
  // Diagnostic only: retain native callbacks, receivers and scheduling.
  if (typeof window.ResizeObserver === 'function' && typeof window.addEventListener === 'function') {
    const trace={events:[],observers:[],count:0,created:0,emitted:0};
    const watched=new WeakSet();
    const stack=()=>String(new Error().stack||'').split('\n').slice(2,8).join('\n').slice(0,1000);
    function target(node) {
      const parents=[];
      for(let p=node;p && parents.length<4;p=p.parentElement) parents.push({
        tag:p.tagName,id:String(p.id||'').slice(0,100),
        classes:String(p.getAttribute?.('class')||'').slice(0,180),
        component:String(p.getAttribute?.('data-ctm-component')||'').slice(0,100),label:String(p.getAttribute?.('data-ctm-id')||'').slice(0,100),
        height:String(p.style?.height||'').slice(0,100)
      });
      return parents;
    }
    function record(kind,data) {
      trace.events.push({sequence:++trace.count,kind,...data});
      if(trace.events.length>48)trace.events.shift();
    }
    function watchEditor(editor,element) {
      if(!editor || watched.has(editor))return;
      watched.add(editor);
      record('editor-found',{target:target(element),stack:stack()});
      const layout=editor.layout;
      editor.layout=function(...args) {
        record('editor-layout',{target:target(element),dimensions:{width:args[0]?.width,height:args[0]?.height},stack:stack()});
        return Reflect.apply(layout,this,args);
      };
      editor.onDidContentSizeChange(event=>record('editor-content-size',{
        target:target(element),contentHeight:event.contentHeight,contentWidth:event.contentWidth,
        contentHeightChanged:event.contentHeightChanged,contentWidthChanged:event.contentWidthChanged,
        stack:stack()
      }));
    }
    function watchEditors() {
      for(const editor of window.monaco?.editor?.getEditors?.()||[]) {
        watchEditor(editor,editor.getContainerDomNode());
      }
    }
    function decorateMonaco(api) {
      if(typeof api?.editor?.create!=='function')return;
      const create=api.editor.create;
      api.editor.create=function(...args) {
        const editor=Reflect.apply(create,this,args);
        watchEditor(editor,args[0]);
        return editor;
      };
    }
    intercept('monaco',decorateMonaco);
    const NativeResizeObserver=window.ResizeObserver;
    window.ResizeObserver=new Proxy(NativeResizeObserver,{construct(constructor,args,newTarget) {
      const id=trace.created++;
      if(trace.observers.length<16)trace.observers.push({id,stack:stack()});
      const callback=args[0];
      if(typeof callback!=='function')return Reflect.construct(constructor,args,newTarget);
      return Reflect.construct(constructor,[function(entries,observer) {
        watchEditors();
        record('resize-callback',{observer:id,entries:[...entries].slice(0,4).map(entry=>({
          target:target(entry.target),
          rect:{x:entry.contentRect.x,y:entry.contentRect.y,width:entry.contentRect.width,height:entry.contentRect.height}
        }))});
        return Reflect.apply(callback,this,arguments);
      },...args.slice(1)],newTarget);
    }});
    window.addEventListener('error',event=>{
      if(String(event.message).includes('ResizeObserver') && trace.emitted++<3) {
        console.log('CTM_RESIZE_TRACE '+JSON.stringify({
          message:event.message,events:trace.events.slice(-24),observers:trace.observers
        }));
      }
    });
  }
  function wrapRuntime(api, methods, prefix) {
    if (!api) return;
    for (const name of methods) {
      if (typeof api[name] !== 'function') continue;
      const original=api[name];
      const wrapped=function(...args) {
        if (name==='callCheckers') audit.checkerCalls++;
        if (name==='runCell') {
          audit.cellRuns.push({code:args[0],wantPickle:args[1]});
          audit.studentRuns.push(prefix+name);
        }
        if (/runPython/.test(name) && args.some(arg=>typeof arg==='string' && /stored_add|store cell starter|stored learner cell|_ctm_py_exercise.*call/.test(arg))) audit.studentRuns.push(prefix+name);
        if (audit.depth) audit.duringRestore.push(prefix+name);
        return Reflect.apply(original,this,args);
      };
      api[name]=wrapped;
      if(api[name]===wrapped) audit.wrapped.push(prefix+name);
    }
  }
  intercept('MathExerciseRuntime',api=>wrapRuntime(api,['ensurePyodide','ensureCheckers','callCheckers'],'runtime.'));
  intercept('mainPyodide',api=>{
    wrapRuntime(api,['runPython','runPythonAsync','runCell'],'python.');
    if (typeof api?.globals?.set==='function') {
      const original=api.globals.set;
      api.globals.set=function(name,value) {
        if (name==='_ctm_py_request') {
          let request;
          try {request=JSON.parse(value);} catch (_) {request={function:'malformed'};}
          audit.pythonRequests.push(request);
          audit.studentRuns.push('python.request.'+request.function);
          if (audit.depth) audit.duringRestore.push('python.globals.set');
        }
        return Reflect.apply(original,this,arguments);
      };
      audit.wrapped.push('python.globals.set');
    }
  });
  intercept('CTMStore',store=>{
    const register=store.register;
    store.register=function(options) {
      if(typeof options.read==='function') {
        const read=options.read;
        options.read=function(...args) {
          audit.readCalls.push({component:options.component,id:options.id});
          return Reflect.apply(read,this,args);
        };
      }
      const handle=Reflect.apply(register,this,[options]);
      const restore=handle.restore;
      handle.restore=function(...args) {
        audit.depth++;
        try {
          const value=Reflect.apply(restore,this,args);
          audit.restores.push({component:options.component,id:options.id,state:value.state});
          return value;
        } finally {audit.depth--;}
      };
      window.__storeEntries.push({options,handle});
      return handle;
    };
  });
}

export function denyStoreWrites() {
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value) {
    if(String(key).startsWith('ctm|1|'))throw new DOMException('No device storage','QuotaExceededError');
    return Reflect.apply(original,this,arguments);
  };
}
