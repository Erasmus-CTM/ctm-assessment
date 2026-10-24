// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic fixtures establish checker coverage; mechanism fixtures use real JSXGraph.
// Selector contracts checked against Quarto v1.8.27 customnodes/panel-tabset.lua
// and modules/callouts.lua, ctm-libs 1f7a3a5 ui/ctm-nav.js, math e092b8d
// (unchanged at 1bf1acf), and JSXGraph fork 17de83e lua/jsxgraph.lua.
// Quarto emits .tab-pane + data-bs-target, .callout-N-contents.collapse,
// math emits .math-exercise-cell + its caption/body, fork names iframeJXG*.
import fs from 'node:fs';
import path from 'node:path';

const quote = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const svg = (w, h, drawn = true) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
  (drawn ? '<path d="M10 10 L80 50" stroke="black"/>' : '') + '</svg>';
const box = (id, w = 240, h = 140, shape = svg(w, h)) => '<div class="jxgbox" id="' + id +
  '" style="width:' + w + 'px;height:' + h + 'px">' + shape + '</div>';
const firstScript = '<script>window.__ctmFirstScriptAudit={fetch:typeof fetch,drain:typeof __ctmOfflineDrainAttempts,binding:typeof __ctmOfflineRecordAttempt,baseURI:document.baseURI,installed:window.__ctmOfflineAudit?.installed===true,serialized:window.__ctmOfflineEarlyAudit?.executed===true,wrapped:fetch.__ctmOfflineAuditWrapped===true,transport:typeof __ctmOfflineRecordAttempt==="function"?"binding":window.parent!==window?"parent-bridge":"none"};</script>';
const frame = (id, content) => '<iframe data-ctm-board name="iframeJXG-' + id +
  '" sandbox="allow-scripts" style="width:300px;height:180px;border:0" srcdoc="' +
  quote('<!doctype html><html><body style="margin:0">' + firstScript + content + '</body></html>') + '"></iframe>';
const html = body => '<!doctype html><html><head><link rel="icon" href="data:,"><meta charset="utf-8">' +
  '<style>.tab-pane:not(.active),.collapse:not(.show){display:none}.fade:not(.show){opacity:0}.math-exercise-cell:not(.math-exercise-open) > .math-exercise-body{height:0;overflow:hidden;visibility:hidden;pointer-events:none}' +
  '</style></head><body>' + body + '<script src="toggles.js"></script></body></html>';

export function writeFixtures(root, jsxgraphDir) {
  fs.mkdirSync(root, {recursive: true});
  fs.mkdirSync(path.join(root, '_ctm-assets'), {recursive: true});
  fs.writeFileSync(path.join(root, 'toggles.js'), String.raw`
// The caption markup, state attributes and toggle below match math-exercise
// e092b8dece85f420f25ce774e5e85779cc078309 (also unchanged at 1bf1acf).
document.querySelectorAll('.math-exercise-cell').forEach(function (cell) {
  var toggleEl = cell.querySelector('.math-exercise-toggle');
  var bodyEl = cell.querySelector('.math-exercise-body');
  if (toggleEl && bodyEl) {
    function toggleOpen() {
      var open = cell.classList.toggle('math-exercise-open');
      toggleEl.setAttribute('aria-expanded', String(open));
      bodyEl.setAttribute('aria-hidden', String(!open));
    }
    toggleEl.addEventListener('click', toggleOpen);
    toggleEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(); }
    });
  }
});
document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-bs-target]');
  if (!toggle) return;
  for (const n of document.querySelectorAll(toggle.dataset.bsTarget))
    n.classList.add(n.matches('.tab-pane') ? 'active' : 'show');
});
`);
  const boards = [
    frame('visible', box('visible')),
    '<button data-bs-target="#outer">Outer tab</button><section id="outer" class="tab-pane">' +
      '<button data-bs-target="#inner">Inner tab</button><section id="inner" class="tab-pane">' +
      '<details><summary>Details</summary><button data-bs-target=".callout-4-contents">Callout</button>' +
      '<div class="callout-4-contents callout-collapse collapse"><div class="math-exercise-cell">' +
      '<div class="math-exercise-caption math-exercise-toggle" data-math-exercise-source="Math caption" role="button" tabindex="0" aria-expanded="false"><span class="math-chevron" aria-hidden="true"></span>Math caption</div>' +
      '<div class="math-exercise-body" aria-hidden="true">' + frame('nested', box('nested')) + '</div></div></div></details></section></section>',
    box('inline', 260, 150),
    frame('smaller-than-frame', box('smaller-than-frame', 170, 110))
  ];
  fs.writeFileSync(path.join(root, 'positive.html'), html(boards.join('\n')));
  fs.writeFileSync(path.join(root, 'math-collapsed.html'), html(
    '<div class="math-exercise-cell" id="math-caption-regression">' +
    '<div class="math-exercise-caption math-exercise-toggle" data-math-exercise-source="Math caption" role="button" tabindex="0" aria-expanded="false">' +
    '<span class="math-chevron" aria-hidden="true"></span>Math caption</div>' +
    '<div class="math-exercise-body" aria-hidden="true">' + frame('math-only', box('math-only')) + '</div></div>'));
  fs.writeFileSync(path.join(root, 'board-opacity.html'), html(
    '<div style="opacity:0">' + box('transparent-board') + '</div>'));
  fs.writeFileSync(path.join(root, 'frame-opacity.html'), html(
    '<div class="tab-pane fade active">' + frame('transparent-frame', box('transparent-frame')) + '</div>'));
  for (const [name, content] of Object.entries({
    blank: box('always-blank', 240, 140, svg(0, 0)),
    mismatch: box('wrong-size', 240, 140, svg(230, 140)),
    empty: box('no-ink', 240, 140, svg(240, 140, false)),
    missing: '<p>Missing board</p>'
  })) fs.writeFileSync(path.join(root, name + '.html'), html(frame(name, content)));
  fs.writeFileSync(path.join(root, 'external.js'), 'fetch("https://offline.invalid/worker-fetch");');
  fs.writeFileSync(path.join(root, 'external.html'), html('<script>fetch("https://offline.invalid/page-fetch");' +
    'new Worker("external.js");</script>' + frame('external', box('external') +
      '<script>fetch("https://offline.invalid/frame-fetch").catch(function () {});</script>')));
  fs.writeFileSync(path.join(root, 'caught-frame.html'), html(frame('caught-frame', box('caught-frame') +
    '<script>Promise.all([' +
    'fetch("https://offline.invalid/caught-string").catch(function(){}),' +
    'fetch(new URL("https://offline.invalid/caught-url")).catch(function(){}),' +
    'fetch(new Request("https://offline.invalid/caught-request")).catch(function(){}),' +
    'new Promise(function(resolve){var xhr=new XMLHttpRequest();xhr.open("GET","https://offline.invalid/caught-xhr");xhr.onload=xhr.onerror=resolve;xhr.send();})' +
    ']).then(function(){document.body.dataset.caught="true";});</script>')));
  const dataDocument = '<!doctype html><html><body>' + firstScript + box('caught-data') +
    '<script>fetch("https://offline.invalid/caught-data").catch(function(){document.body.dataset.caught="true";});</script></body></html>';
  fs.writeFileSync(path.join(root, 'caught-data.html'), html(
    '<iframe data-ctm-board name="iframeJXG-data" sandbox="allow-scripts" style="width:300px;height:180px;border:0" src="data:text/html;base64,' +
    Buffer.from(dataDocument).toString('base64') + '"></iframe>'));
  fs.writeFileSync(path.join(root, 'caught-image.html'), html(frame('caught-image', box('caught-image') +
    '<img src="https://offline.invalid/caught-image" onerror="document.body.dataset.imageCaught=&quot;true&quot;">')));
  for (const mode of ['append', 'remove', 'reassign']) {
    const child = '<!doctype html><html><body>' + firstScript + box('dynamic-' + mode) +
      '<script>fetch("https://offline.invalid/dynamic-' + mode + '").catch(function(){parent.postMessage({dynamicDone:true,first:window.__ctmFirstScriptAudit},"*");});</script></body></html>';
    const encoded = JSON.stringify(child).replaceAll('</script', '<\\/script');
    const setup = mode === 'reassign' ? 'var iframe=document.querySelector("iframe");document.body.dataset.dynamicInitialLoaded="true";' :
      'var iframe=document.createElement("iframe");iframe.setAttribute("sandbox","allow-scripts");iframe.setAttribute("data-ctm-board","");document.body.append(iframe);';
    const listener = '<script>window.addEventListener("message",function(e){if(e.data?.dynamicDone){document.body.dataset.dynamicFirst=JSON.stringify(e.data.first);' +
      (mode === 'remove' ? 'document.querySelector("iframe")?.remove();' : '') +
      'document.body.dataset.dynamicDone="true";}});window.startDynamic=function(){' + setup + 'iframe.srcdoc=' + encoded + ';};</script>';
    // Reassignment must follow the initial document's actual load. A timer can
    // race its first navigation, so it does not establish a replacement at all.
    const body = mode === 'reassign' ? listener + frame('reassigned', box('initial')).replace('<iframe ',
      '<iframe onload="if(!this.dataset.reassigned){this.dataset.reassigned=1;window.startDynamic();}" ') :
      listener + '<script>setTimeout(window.startDynamic,10);</script>';
    fs.writeFileSync(path.join(root, 'dynamic-' + mode + '.html'), html(body));
  }
  fs.writeFileSync(path.join(root, 'same-origin.html'), html('<script>fetch("_ctm-assets/local.txt").then(function(r){return r.text();}).then(function(t){document.body.dataset.parentLocal=t;});</script>' + frame('same-origin', box('same-origin') +
    '<script>Promise.all([fetch(new URL("__BASE___ctm-assets/local.txt")).then(function(r){return r.text();}),' +
    'fetch(new Request("__BASE___ctm-assets/local.txt")).then(function(r){return r.text();}),' +
    'fetch("data:text/plain,inline").then(function(r){return r.text();}),' +
    'new Promise(function(resolve,reject){var xhr=new XMLHttpRequest();xhr.open("GET","__BASE___ctm-assets/local.txt");xhr.onload=function(){resolve(xhr.responseText);};xhr.onerror=reject;xhr.send();})' +
    ']).then(function(values){document.body.dataset.local=values.join("|");});</script>')));
  fs.writeFileSync(path.join(root, '_ctm-assets', 'local.txt'), 'local request works');
  fs.writeFileSync(path.join(root, 'service-worker.js'), 'self.addEventListener("fetch", function(){});');
  fs.writeFileSync(path.join(root, 'opaque-exception.html'), html(frame('opaque-exception', box('opaque-exception') +
    '<script>throw new Error("genuine opaque fixture exception");</script>')));
  fs.writeFileSync(path.join(root, 'http-error.html'), html('<script src="absent.js"></script>'));
  fs.writeFileSync(path.join(root, 'exception.html'), html('<script>throw new Error("fixture intentional error");</script>'));
  if (!jsxgraphDir) return;
  fs.mkdirSync(path.join(root, '_ctm-assets'), {recursive: true});
  fs.copyFileSync(path.join(jsxgraphDir, 'jsxgraphcore.js'), path.join(root, '_ctm-assets', 'jsxgraphcore.js'));
  // The pinned fork (17de83e lua/jsxgraph.lua) disables native resize and owns
  // refresh itself. Match that contract in both plain and refresh-model modes;
  // otherwise core auto-resize can heal the negative before our check.
  // Only the deterministic control deliberately forces the real board to 0x0.
  for (const mode of ['always-blank-real', 'plain-hidden', 'refresh-model']) {
    const script = String.raw`
var box = document.querySelector('.jxgbox');
var b = JXG.JSXGraph.initBoard(box.id, {boundingbox:[-5,5,5,-5], axis:true,
  showCopyright:false, showNavigation:false, resize:{enabled:false}});
b.create('point', [1,2]);
if (MODE === 'always-blank-real') b.resizeContainer(0,0,true);
window.__ctmModelRefresh = {invocations: 0, samples: [], completed: false};
function refreshModel() {
  var width = box.clientWidth, height = box.clientHeight;
  window.__ctmModelRefresh.invocations++;
  window.__ctmModelRefresh.samples.push({width: width, height: height});
  if (!(width > 0 && height > 0)) return;
  b.resizeContainer(width, height, true);
  b.fullUpdate();
  window.__ctmModelRefresh.completed = true;
}
window.addEventListener('message', function(e) {
  if (e.data !== 'visible' || MODE !== 'refresh-model') return;
  refreshModel();
  requestAnimationFrame(function () { refreshModel(); requestAnimationFrame(refreshModel); });
});
`;
    // The script URL is supplied as an absolute loopback URL at test time.
    const content = '<!doctype html><body style="margin:0">' + firstScript + '<div class="jxgbox" id="real-board" style="width:calc(100vw - 2px);height:calc(100vh - 2px)"></div>' +
      '<script src="__BASE___ctm-assets/jsxgraphcore.js"></script><script>const MODE=' + JSON.stringify(mode) + ';' + script + '</script>';
    fs.writeFileSync(path.join(root, mode + '.template'), html(
      '<div id="hidden" style="display:none"><iframe data-ctm-board sandbox="allow-scripts" ' +
      'style="width:500px;height:350px;border:0" srcdoc="' + quote(content) + '"></iframe></div>'));
  }
}

export function finishMechanismFixtures(root, baseURL) {
  const local = path.join(root, 'same-origin.html');
  fs.writeFileSync(local, fs.readFileSync(local, 'utf8').replaceAll('__BASE__', baseURL));
  for (const mode of ['always-blank-real', 'plain-hidden', 'refresh-model']) {
    const source = fs.readFileSync(path.join(root, mode + '.template'), 'utf8').replaceAll('__BASE__', baseURL);
    fs.writeFileSync(path.join(root, mode + '.html'), source);
  }
}
