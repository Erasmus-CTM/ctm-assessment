export function instrument() {
  const audit = window.__storeAudit = {depth:0, duringRestore:[], checkerCalls:0, restores:[], wrapped:[], copies:[], studentRuns:[], pythonRequests:[], cellRuns:[], readCalls:[]};
  window.__storeEntries = [];
  Math.random = () => 0.1;
  // The OS clipboard is the only external write boundary replaced by the test.
  Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async text => audit.copies.push(String(text))}});
  function intercept(name, decorate) {
    let value;
    Object.defineProperty(window,name,{configurable:true,get:()=>value,set:incoming=>{value=incoming;decorate(incoming);}});
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
