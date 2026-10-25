// Step 6 §13: the installed package checks math, published Python and private STACK together.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const site = process.env.CTM_INTEGRATION_SITE;
assert.ok(site, 'Build the integration package first');
const workspace = path.dirname(path.dirname(site));
const record = JSON.parse(fs.readFileSync(path.join(workspace,'resolved-repos.json')));
const dir = fs.mkdtempSync(path.join(workspace,'stack-mixed-'));
fs.cpSync(path.join(path.dirname(site),'_extensions'),path.join(dir,'_extensions'),{recursive:true});
const source = path.join(workspace,'src','ctm-checkers-'+record.repositories['ctm-checkers'].commit.slice(0,12),'examples/stack/polynomial-expansion.xml');
fs.copyFileSync(source,path.join(dir,'question.xml'));
fs.writeFileSync(path.join(dir,'_quarto.yml'),'project:\n  type: website\nfilters: [ctm-assessment]\nai-feedback:\n  enabled: false\nstack:\n  feedback: false\n');
fs.writeFileSync(path.join(dir,'index.qmd'),'---\ntitle: Mixed runtime test\n---\n\n'
  +'```{math-exercise}\n#| label: mixed-math\nCompute two plus two: _[4]\n```\n\n'
  +'```{pyodide-python}\nprint("mixed Python ready")\n```\n\n'
  +'```{#mixed-stack .stack-question}\n#| label: mixed-stack\n#| file: question.xml\n#| question: Expand a product (form-sensitive)\n#| review: true\n```\n');
const render = spawnSync(process.env.QUARTO_BIN || 'quarto',['render'],{cwd:dir,encoding:'utf8',timeout:300000,
  env:{...process.env,CTM_VARIANTS:'review'}});
assert.equal(render.status,0,render.stderr);
const output = path.join(dir,'_site');
const html = fs.readFileSync(path.join(output,'index.html'),'utf8');
for(const file of ['pyodide-runtime.js','pyodide-worker.js','ctm-matrix-input.js']) {
  assert.equal((html.match(new RegExp('src="[^"\\n]*/'+file.replaceAll('.','\\.')+'"','g'))||[]).length,1,file+' loads once');
}
assert.equal((html.match(/src="[^"\n]*\/ctm-stack-\d[^/]*\/ctm-stack.js"/g)||[]).length,1,'STACK controller loads once');
assert.doesNotMatch(html,/stack-feedback-button|data-stack-feedback=/);
const server = http.createServer((req,res)=>{
  const file = path.resolve(output,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(output+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','credentialless');
  res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
    await page.waitForFunction(()=>globalThis.qpyodideCellsReady===true&&globalThis.mainPyodide,null,{timeout:240000});
    await page.evaluate(()=>{window.__mixedPublished=mainPyodide;window.__mixedRestarts=0;window.addEventListener('qpyodide-runtime-restart',()=>window.__mixedRestarts++);});
    await page.locator('.qpyodide-button-run').first().click();
    await page.waitForFunction(()=>document.querySelector('.qpyodide-output-code-area').innerText.includes('mixed Python ready'),null,{timeout:180000});
    const math = page.locator('.math-exercise-cell');
    await math.locator('input').first().fill('4');await math.locator('.math-check-btn').click();
    await math.locator('.math-fb-ok').first().waitFor({timeout:180000});
    const stack = page.locator('.ctm-stack');
    await stack.locator('.stack-tests').click();
    await stack.locator('.stack-result[data-state=correct]').waitFor({timeout:180000});
    await stack.locator('.stack-answer').fill('!!!');await stack.locator('.stack-validate').click();
    await stack.locator('.stack-result[data-state=invalid]').waitFor({timeout:180000});
    assert.equal(await page.evaluate(()=>mainPyodide===__mixedPublished&&__mixedRestarts===0),true,'STACK preserves the published runtime');
    await page.locator('.qpyodide-button-run').first().click();
    await page.waitForFunction(()=>document.querySelector('.qpyodide-output-code-area').innerText.includes('mixed Python ready'),null,{timeout:180000});
    console.log('Mixed page: math checks, Python runs before/after STACK, STACK qtests and validation pass; published runtime preserved.');
  } finally {await browser.close();server.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
