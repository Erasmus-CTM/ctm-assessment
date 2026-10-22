import {createHash} from 'node:crypto';

// Deliberate diagnostic source intervention: only our content-height callback
// registration changes. Vendor Monaco/ResizeObserver and all store code remain.
export const expectedDigests={
  py:'23cf5be7802d3bd17d6b8cb64ff813eefa688d7c36d46a8b6a1cfdd0bd2b3402',
  cell:'7f9308aa0e55cd76eb4d96ebc7dc19bfc0109346cf072be5995e8949c468f055'
};
const needles={
  py:"      var updateHeight = function () {\n        var h = Math.max(80, editor.getContentHeight());\n        editorContainer.style.height = h + 'px';\n        editor.layout();\n      };",
  cell:"      const updateHeight = () => {\n        const contentHeight = thiz.editor.getContentHeight();\n        thiz.editorDiv.style.height = \x60\x24{contentHeight}px\x60;\n        thiz.editor.layout();\n      };"
};
export function patchHeightCallback(source,component,enabled) {
  const digest=createHash('sha256').update(source,'utf8').digest('hex');
  if(!Object.hasOwn(expectedDigests,component) || digest!==expectedDigests[component])
    throw Error('Diagnostic component source differs from immutable fixture: '+component);
  const needle=needles[component];
  if(source.split(needle).length!==2)throw Error('Expected one exact content-height callback');
  if(!enabled)return {source,digest,component,patched:false};
  const prefix=component==='py'?'      var updateHeight = function () {':'      const updateHeight = () => {';
  const replacement=needle.replace(prefix,component==='py'
    ?'      var updateHeight = window.__ctmDeferEditorHeight(function () {'
    :'      const updateHeight = window.__ctmDeferEditorHeight(() => {')
    .replace(/\n      };$/, '\n      }, "'+component+'");');
  return {source:source.replace(needle,replacement),digest,component,patched:true};
}

// addInitScript captures native scheduling before any test clock installation.
export function installHeightDiagnostic() {
  const host=window, nativeFrame=host.requestAnimationFrame.bind(host);
  const trace=host.__ctmHeightTrace={clockAlreadyInstalled:Boolean(host.__pwClock),callbacks:[]};
  Object.defineProperty(trace,'flush',{value:()=>new Promise(resolve=>nativeFrame(()=>nativeFrame(resolve)))});
  host.__ctmDeferEditorHeight=function(callback,component) {
    const activity={component,requests:0,queued:0,executed:0,pending:0};
    trace.callbacks.push(activity);
    let scheduled=false, latestArgs, latestReceiver;
    return function(...args) {
      activity.requests++;
      latestArgs=args;latestReceiver=this;
      if(scheduled)return;
      scheduled=true;activity.queued++;activity.pending++;
      nativeFrame(()=>{
        scheduled=false;activity.pending--;activity.executed++;
        return Reflect.apply(callback,latestReceiver,latestArgs);
      });
    };
  };
}
