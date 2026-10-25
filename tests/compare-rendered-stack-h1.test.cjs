const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {JSDOM}=require('jsdom');

test('H1 render fingerprints ignore JSON key order and retain all values',async()=>{
 const {renderSignature}=await import('../tools/compare-rendered/stack-h1.mjs');
 const side=value=>({doc:new JSDOM('<body><section></section></body>').window.document,configs:{backend:{b:2,a:1}}});
 const a=side(),b=side();
 a.doc.querySelector('section').setAttribute('data-feedback','{"a":1,"b":[2,3]}');
 b.doc.querySelector('section').setAttribute('data-feedback','{"b":[2,3],"a":1}');
 const canonical=node=>[node.outerHTML];
 assert.deepEqual(renderSignature(a,canonical),renderSignature(b,canonical));
 b.doc.querySelector('section').setAttribute('data-feedback','{"b":[3,2],"a":1}');
 assert.notDeepEqual(renderSignature(a,canonical),renderSignature(b,canonical));
 b.doc.querySelector('section').textContent='unexpected task';
 assert.notDeepEqual(renderSignature(a,canonical),renderSignature(b,canonical));
});

const before=process.env.CTM_STACK_H1_BEFORE,after=process.env.CTM_STACK_H1_AFTER;
const h1=after && fs.existsSync(path.join(after,'docs/python-checker-api.qmd')) && fs.readFileSync(path.join(after,'docs/python-checker-api.qmd'),'utf8').includes('#| checker: |');
test('real H1 guide witness rejects HTML, configuration and source mutations',{skip:!before||!after||!h1},()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ctm-h1-render-'));
 try{
  const project=path.join(temporary,'project');
  fs.cpSync(after,project,{recursive:true,filter:file=>!['.git','.quarto'].includes(path.basename(file))});
  const relative='docs/python-answer-tests.html',html=path.join(project,'_site',relative),source=path.join(project,'docs/python-answer-tests.qmd');
  const original=fs.readFileSync(html,'utf8'),sourceText=fs.readFileSync(source,'utf8');
  let sequence=0;
  function compare(){
   const report=path.join(temporary,'report-'+sequence+++'.json');
   const result=spawnSync(process.execPath,[path.join(__dirname,'../tools/compare-rendered.mjs'),
    '--before',path.join(before,'_site'),'--after',path.join(project,'_site'),'--pages',relative,
    '--asset-sources',after,'--asset-pins',path.join(__dirname,'../integration/feedback/repos.json'),
    '--expect',path.join(__dirname,'../tools/compare-rendered/expect/step6-h1.yml'),'--report',report],
    {encoding:'utf8',timeout:90000});
   assert.ok(fs.existsSync(report),result.stderr);
   return {status:result.status,...JSON.parse(fs.readFileSync(report,'utf8'))};
  }
  const baseline=compare();assert.equal(baseline.status,0,JSON.stringify(baseline.summary));assert.equal(baseline.summary.unexpected,0);
  const witness=JSON.parse(fs.readFileSync(path.join(__dirname,'../tools/compare-rendered/stack-h1-witnesses.json'),'utf8')).pages[relative][1];
  function sourceProof(){
   const document=new JSDOM(original).window.document;
   const cards=[...document.querySelectorAll('script.ctm-stack-data')].map(node=>JSON.parse(node.textContent));
   assert.equal(cards.length,document.querySelectorAll('section.ctm-stack').length,'the native proof covers every rendered card (the rewritten guide may have none)');
   const request=path.join(temporary,'source-proof.json');
   fs.writeFileSync(request,JSON.stringify({page:html,cards,mode:'variants'}));
   const result=spawnSync(process.env.QUARTO_PYTHON||'python3',
    [path.join(__dirname,'../tools/compare-rendered/verify-stack-plans.py'),request],
    {encoding:'utf8',timeout:180000});
   assert.equal(result.status,0,result.stderr);
   const receipt=JSON.parse(result.stdout);assert.equal(receipt.verified,true);
   return receipt;
  }
  assert.equal(sourceProof().pageSource,witness.source,'the unmodified source matches the reviewed H1 witness');
  const altered=new JSDOM(original);altered.window.document.querySelector('main h1').textContent='Unexpected changed task';
  fs.writeFileSync(html,altered.serialize());
  const changed=compare();assert.notEqual(changed.status,0);assert.ok(changed.summary.unexpected>0);
  fs.writeFileSync(html,original.replace('</body>','<script type="application/json" class="unexpected-config">{"score":0}</script></body>'));
  assert.ok(compare().summary.unexpected>0);
  fs.writeFileSync(html,original);fs.writeFileSync(source,sourceText+'\nUnexpected source mutation.\n');
  // A post-H1 comparison can have identical HTML on both sides: the rendered
  // comparator then has no transition to admit. Still require the real native
  // proof to expose the changed source and fail the exact reviewed witness.
  assert.notEqual(sourceProof().pageSource,witness.source,'a source-only mutation cannot match the reviewed witness');
  if(baseline.items.some(item=>item.object==='stack-h1')){
   assert.ok(compare().summary.unexpected>0,'the H1 migration also loses its transition exception');
  }
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
