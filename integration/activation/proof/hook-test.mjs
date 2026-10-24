// Consumer integration proof: immutable upstream helpers and actual Quarto output.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
const option=(name)=>{const index=args.indexOf('--'+name);assert.ok(index>=0,'Missing --'+name);return args[index+1];};
const upstream=resolve(option('jsxgraph-source'));
const adaptor=resolve(option('adaptor'));
const mathjax=resolve(option('mathjax'));
const output=resolve(option('output'));
const {renderProject,findQuarto,cleanup}=await import(pathToFileURL(join(upstream,'tests/support/render.mjs')));
const {staticFiles,SHARED,installHarness,withinDeadline}=await import(pathToFileURL(join(upstream,'tests/support/browser.mjs')));
const browsers=await import(process.env.CTM_PLAYWRIGHT_MODULE||'playwright');
const bytes=await readFile(adaptor);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(bytes),'81642e45028f35eab27b7be2cbce427efb9395799b9e335e834c667315fd5b61');
assert.equal(/version:\s*["']?([0-9.]+)/.exec(await readFile(join(upstream,'_extensions/jsxgraph/_extension.yml'),'utf8'))?.[1],'1.2.0');
const lua=await readFile(join(upstream,'_extensions/jsxgraph/lua/jsxgraph.lua'));
assert.equal(createHash('sha1').update(Buffer.from('blob '+lua.length+'\0')).update(lua).digest('hex'),'c3980f39368158ceb5d75cf4fdc5c7229b5d4d3b');
assert.equal(JSON.parse(await readFile(join(mathjax,'package.json'),'utf8')).version,'4.1.3');
const report={passed:false,adaptorSha256:sha(bytes),jsxgraphRevision:'e4ad81d82e1b56f86765026a3dd26f6975d29d57',
  upstreamLuaSha256:sha(await readFile(join(upstream,'_extensions/jsxgraph/lua/jsxgraph.lua'))),
  mathjaxVersion:'4.1.3',cases:[]};
let rendered,server,browser;
const renderedCases=[];
const authoredSetup=kind=>`window.__authored={loadCount:0,pageReadyCount:0,readyCount:0};
window.__authoredPageReady=function(){__authored.pageReadyCount++;return MathJax.startup.defaultPageReady();};
window.__authoredReady=function(){__authored.readyCount++;MathJax.startup.defaultReady();};
window.MathJax={${kind==='authored-ready' ? 'options:{enableSpeech:false,enableBraille:false,menuOptions:{settings:{speech:false,braille:false}}},' : ''}startup:{pageReady:window.__authoredPageReady${kind==='authored-ready' ? ',ready:window.__authoredReady' : ''}}};\n`;
try{
  const quarto=findQuarto();assert.ok(quarto,'Quarto is required, no skipped acceptance');report.quarto=quarto.version;
  server=http.createServer((request,response)=>{
    if(staticFiles('/node_modules/mathjax/',mathjax)(request,response))return;
    if(staticFiles('/node_modules/@mathjax/',join(dirname(mathjax),'@mathjax'))(request,response))return;
    if(request.url.startsWith('/case?')){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8','cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp'});
      response.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Actual pinned hook</title>'+renderedCases[Number(new URL(request.url,'http://x').searchParams.get('fixture'))||0].frames[0].element);return;
    }
    response.writeHead(404,SHARED).end();
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin='http://127.0.0.1:'+server.address().port;
  const vendor=origin+'/node_modules/mathjax/tex-mml-svg.js';
  const qmd=['---','title: Actual CTM hook','filters: [jsxgraph]','jsxgraph:',
    '  src_jxg: bundled','  src_css: bundled','  src_mjx: '+vendor,
    '  src_mjx_preload: hook-adaptor.js','---','',
    '```{.jsxgraph}',
    "var board=JXG.JSXGraph.initBoard(BOARDID,{boundingbox:[-5,5,5,-5],axis:true});",
    "var label=board.create('text',[-3,3,'\\\\(x^2+1\\\\)'],{useMathJax:true});",
    "window.addEventListener('load',()=>{__authored.loadCount++;MathJax.startup.promise.then(()=>{label.needsUpdate=true;board.update();});});",
    '```',''].join('\n');
  report.fixtures=[];
  for(const kind of ['accessible','authored-ready']){
  const setup=Buffer.from(authoredSetup(kind)),fixtureBytes=Buffer.concat([setup,bytes]);
  rendered=renderProject({quarto,files:{'proof.qmd':qmd,'hook-adaptor.js':fixtureBytes},doc:'proof.qmd'});
  renderedCases.push(rendered);
  assert.equal(rendered.status,0,rendered.stderr);assert.equal(rendered.frames.length,1);
  report.fixtures.push({kind,frameSha256:sha(Buffer.from(rendered.frames[0].html)),authoredSetupSha256:sha(setup),adaptorSha256:sha(bytes)});
  const preloader=/<script src="data:text\/javascript;base64,([^\"]+)"><\/script>\s*<script id="MathJax-script" async src="([^\"]+)"><\/script>/.exec(rendered.frames[0].html);
  assert.ok(preloader,'actual extension hook directly precedes unchanged native async loader');
  assert.deepEqual(Buffer.from(preloader[1],'base64'),fixtureBytes);assert.deepEqual(fixtureBytes.subarray(setup.length),bytes);assert.equal(preloader[2],vendor);
  }
  for(const engine of ['chromium','firefox','webkit']){
    browser=await browsers[engine].launch({headless:true});
    for(const width of [1280,390])for(const [fixture,kind] of ['accessible','authored-ready'].entries()){
      const result={engine,width,kind,browserVersion:browser.version(),errors:[],consoleErrors:[],failedRequests:[],badResponses:[]};report.cases.push(result);
      const context=await browser.newContext({viewport:{width,height:800}});
      await context.addInitScript(installHarness);
      const page=await context.newPage();
      page.on('pageerror',e=>result.errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text());});
      page.on('requestfailed',r=>result.failedRequests.push({url:r.url(),error:r.failure()}));
      page.on('response',r=>{if(r.status()>=400)result.badResponses.push({url:r.url(),status:r.status()});});
      await page.goto(origin+'/case?fixture='+fixture,{waitUntil:'load'});
      assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
      assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts');
      const frame=page.frames().find(f=>f.parentFrame()===page.mainFrame());assert.ok(frame);
      await frame.waitForFunction(()=>!!window.MathJax?.startup?.promise,null,{timeout:60000});
      await withinDeadline(frame.evaluate(()=>MathJax.startup.promise),60000,'actual hook startup');
      await frame.waitForSelector('.jxgbox mjx-container svg, .jxgbox svg mjx-container, .jxgbox mjx-container',{timeout:15000});
      result.render=await withinDeadline(frame.evaluate(async()=>{
        await MathJax.startup.promise;
        const node=await MathJax.tex2svgPromise('x^2+1');document.body.append(node);
        return {origin:self.origin,glyphs:node.querySelectorAll('svg path,svg use').length,
          speech:node.getAttribute('data-semantic-speech-none'),braille:node.getAttribute('data-semantic-braille'),
          nativeLoader:__nativeLoader,attributes:[...document.getElementById('MathJax-script').attributes].map(a=>a.name).sort(),
          authored:{...__authored,pageReadyIdentity:MathJax.config.startup.pageReady===__authoredPageReady,readyIdentity:MathJax.config.startup.ready===__authoredReady},speechEnabled:MathJax.startup.document.options.enableSpeech,brailleEnabled:MathJax.startup.document.options.enableBraille,
          workers:__workers,boards:Object.keys(JXG.boards).length,boardMath:!!document.querySelector('.jxgbox mjx-container svg, .jxgbox svg mjx-container, .jxgbox mjx-container')};
      }),60000,'actual hook rendering');
      assert.equal(result.render.origin,'null');assert.ok(result.render.glyphs>0&&result.render.boards>0&&result.render.boardMath);
      assert.equal(result.render.authored.loadCount,1);assert.equal(result.render.authored.pageReadyCount,1);assert.equal(result.render.authored.pageReadyIdentity,true);
      if(kind==='accessible'){
        assert.equal(result.render.speech,'x squared plus 1');assert.equal(result.render.braille,'⠭⠘⠆⠐⠬⠂');assert.equal(result.render.authored.readyCount,0);
      }else{
        assert.equal(result.render.authored.readyCount,1);assert.equal(result.render.authored.readyIdentity,true);
        assert.equal(result.render.speechEnabled,false);assert.equal(result.render.brailleEnabled,false);assert.equal(result.render.workers.length,0);
      }
      assert.deepEqual(result.render.attributes,['async','id','src']);
      assert.equal(result.render.nativeLoader.src,vendor);assert.equal(result.render.nativeLoader.version,'4.1.3');assert.equal(result.render.nativeLoader.readyMethod,'function');
      if(kind==='accessible')assert.ok(result.render.workers.length>0&&result.render.workers.every(w=>w.scheme==='data:'));
      for(const key of ['errors','consoleErrors','failedRequests','badResponses'])assert.deepEqual(result[key],[],engine+' width'+width+' '+key);
      await context.close();
    }
    await browser.close();browser=null;
  }
  report.passed=true;
}catch(error){report.error=String(error.stack||error);process.exitCode=1;}
finally{
  if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));for(const fixture of renderedCases)cleanup(fixture.dir);
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,error:report.error}));
}
