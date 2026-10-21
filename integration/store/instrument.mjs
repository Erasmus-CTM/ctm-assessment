export function instrument() {
  const audit = window.__storeAudit = {depth:0, duringRestore:[], checkerCalls:0, restores:[], wrapped:[], copies:[], studentRuns:[]};
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
        if (/runPython/.test(name) && args.some(arg=>typeof arg==='string' && /stored_add|store cell starter|stored learner cell/.test(arg))) audit.studentRuns.push(prefix+name);
        if (audit.depth) audit.duringRestore.push(prefix+name);
        return Reflect.apply(original,this,args);
      };
      api[name]=wrapped;
      if(api[name]===wrapped) audit.wrapped.push(prefix+name);
    }
  }
  intercept('MathExerciseRuntime',api=>wrapRuntime(api,['ensurePyodide','ensureCheckers','callCheckers'],'runtime.'));
  intercept('mainPyodide',api=>wrapRuntime(api,['runPython','runPythonAsync'],'python.'));
  intercept('CTMStore',store=>{
    const register=store.register;
    store.register=function(options) {
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
