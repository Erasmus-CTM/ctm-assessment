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
const frame = (id, content) => '<iframe data-ctm-board name="iframeJXG-' + id +
  '" sandbox="allow-scripts" style="width:300px;height:180px;border:0" srcdoc="' +
  quote('<!doctype html><html><body style="margin:0">' + content + '</body></html>') + '"></iframe>';
const html = body => '<!doctype html><html><head><link rel="icon" href="data:,"><meta charset="utf-8">' +
  '<style>.tab-pane:not(.active),.collapse:not(.show){display:none}.fade:not(.show){opacity:0}.math-exercise-cell:not(.math-exercise-open) > .math-exercise-body{height:0;overflow:hidden;visibility:hidden;pointer-events:none}' +
  '</style></head><body>' + body + '<script src="toggles.js"></script></body></html>';

export function writeFixtures(root, jsxgraphDir) {
  fs.mkdirSync(root, {recursive: true});
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
      '<script>fetch("https://offline.invalid/frame-fetch");</script>')));
  fs.writeFileSync(path.join(root, 'http-error.html'), html('<script src="absent.js"></script>'));
  fs.writeFileSync(path.join(root, 'exception.html'), html('<script>throw new Error("fixture intentional error");</script>'));
  if (!jsxgraphDir) return;
  fs.mkdirSync(path.join(root, '_ctm-assets'), {recursive: true});
  fs.copyFileSync(path.join(jsxgraphDir, 'jsxgraphcore.js'), path.join(root, '_ctm-assets', 'jsxgraphcore.js'));
  // A deterministic zero-SVG control uses a real board, deliberately initialised at 0x0.
  for (const mode of ['always-blank-real', 'plain-hidden', 'refresh-model']) {
    const script = String.raw`
var box = document.querySelector('.jxgbox');
var b = JXG.JSXGraph.initBoard(box.id, {boundingbox:[-5,5,5,-5], axis:true,
  showCopyright:false, showNavigation:false, resize:{enabled:MODE !== 'always-blank-real'}});
b.create('point', [1,2]);
if (MODE === 'always-blank-real') b.resizeContainer(0,0,true);
window.addEventListener('message', function(e) {
  if (e.data !== 'visible' || MODE !== 'refresh-model') return;
  b.resizeContainer(box.clientWidth, box.clientHeight, true);
  b.fullUpdate();
});
`;
    // The script URL is supplied as an absolute loopback URL at test time.
    const content = '<!doctype html><body style="margin:0"><div class="jxgbox" id="real-board" style="width:calc(100vw - 2px);height:calc(100vh - 2px)"></div>' +
      '<script src="__BASE___ctm-assets/jsxgraphcore.js"></script><script>const MODE=' + JSON.stringify(mode) + ';' + script + '</script>';
    fs.writeFileSync(path.join(root, mode + '.template'), html(
      '<div id="hidden" style="display:none"><iframe data-ctm-board sandbox="allow-scripts" ' +
      'style="width:500px;height:350px;border:0" srcdoc="' + quote(content) + '"></iframe></div>'));
  }
}

export function finishMechanismFixtures(root, baseURL) {
  for (const mode of ['always-blank-real', 'plain-hidden', 'refresh-model']) {
    const source = fs.readFileSync(path.join(root, mode + '.template'), 'utf8').replaceAll('__BASE__', baseURL);
    fs.writeFileSync(path.join(root, mode + '.html'), source);
  }
}
