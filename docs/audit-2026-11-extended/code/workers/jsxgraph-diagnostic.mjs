// Normal rendered-board diagnostic: records frame state without changing sources.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const repo=process.argv[2] || '/workspace/audit-tests/jsxgraph-git';
const output=process.argv[3] || '/tmp/ctm-jsxgraph-diagnostic.json';
const {findQuarto,renderProject}=await import(pathToFileURL(repo+'/tests/support/render.mjs'));
const {loadPlaywright}=await import(pathToFileURL(repo+'/tests/support/browser.mjs'));
const rendered=renderProject({quarto:findQuarto(),doc:'a.qmd',files:{'a.qmd':`---
filters: [jsxgraph]
jsxgraph:
  src_jxg: bundled
  src_css: bundled
  src_mjx: data:text/javascript,
---

~~~{.jsxgraph unit="%" width="100" height="33.3333333333333"}
window.board = JXG.JSXGraph.initBoard(BOARDID, { boundingbox:[0,6,14,0], keepaspectratio:true, axis:true, showCopyright:false });
board.create('point',[7,3]);
~~~
`}});
const report={render:{status:rendered.status,dir:rendered.dir,stderr:rendered.stderr,htmlBytes:rendered.html?.length,frames:rendered.frames.map(f=>({elementBytes:f.element.length,htmlBytes:f.html.length,hasMathJax:f.html.includes('MathJax-script')}))},events:[],frames:[]};
await fs.writeFile('/tmp/ctm-jsxgraph-diagnostic-rendered-frame.html',rendered.frames[0].html);
const pw=await loadPlaywright();
const browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium'});
try {
 const page=await browser.newPage();
 page.on('pageerror',e=>report.events.push({type:'pageerror',message:e.message}));
 page.on('console',m=>report.events.push({type:'console',kind:m.type(),text:m.text().slice(0,1500)}));
 page.on('requestfailed',r=>report.events.push({type:'requestfailed',url:r.url().slice(0,150),failure:r.failure()}));
 page.on('framenavigated',f=>report.events.push({type:'framenavigated',url:f.url().slice(0,150)}));
 await page.setContent('<div id="holder" style="width:600px">'+rendered.frames[0].element+'</div>');
 await page.locator('iframe').evaluate(f=>{f.style.height='200px';});
 await page.waitForTimeout(1500);
 for(const frame of page.frames()) {
  report.frames.push({url:frame.url().slice(0,150),isMain:frame===page.mainFrame(),state:await frame.evaluate(()=>({url:location.href.slice(0,150),ready:document.readyState,htmlBytes:document.documentElement.outerHTML.length,head:document.head.innerHTML.slice(0,1200),body:document.body.innerHTML.slice(0,1200),scripts:[...document.scripts].map(s=>({id:s.id,src:s.src.slice(0,100)})),hasBoard:!!window.board,hasJXG:!!window.JXG,width:window.board?.canvasWidth,origin:origin,isolation:crossOriginIsolated})).catch(e=>({error:String(e)}))});
 }
 await page.screenshot({path:'/tmp/ctm-jsxgraph-diagnostic.png'});
}finally{await browser.close();await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
