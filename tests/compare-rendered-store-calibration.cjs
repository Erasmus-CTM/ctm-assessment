// Real Quarto output calibration and an independent metadata-only mutation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{JSDOM}=require('jsdom');
const [before,after,...assetArgs]=process.argv.slice(2);
assert.ok(before && after,'usage: calibration BEFORE_SITE AFTER_SITE');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'store-calibration-'));
function run(candidate,name) {
  const report=path.join(tmp,name+'.json');
  const args=['tools/compare-rendered.mjs','--before',before,'--after',candidate,'--report',report,...assetArgs];
  const expectations=['step4.yml','step2.yml','step3.yml',...(process.env.EXPECT || '').trim().split(/\s+/).filter(Boolean)];
  if(fs.existsSync(path.join(root,'tools/compare-rendered/expect/examples.yml')))expectations.push('examples.yml');
  for(const file of new Set(expectations))args.push('--expect','tools/compare-rendered/expect/'+file);
  const p=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
  assert.ok(p.status===0||p.status===1,p.stderr);
  const r=JSON.parse(fs.readFileSync(report,'utf8'));
  console.log(name+': '+JSON.stringify(r.summary));
  return {status:p.status,report:r};
}
try {
  const positive=run(after,'real-quarto');
  assert.equal(positive.status,0,JSON.stringify(positive.report.items.filter(i=>!i.category)));
  const candidate=path.join(tmp,'swapped');fs.cpSync(after,candidate,{recursive:true});
  function htmls(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?htmls(path.join(dir,e.name)):e.name.endsWith('.html')?[path.join(dir,e.name)]:[]);}
  const assetPage=htmls(candidate).find(file=>fs.readFileSync(file,'utf8').includes('globalThis.CTM_ASSETS='));
  if(assetPage){
    const original=fs.readFileSync(assetPage,'utf8'),doc=new JSDOM(original).window.document;
    const config=[...doc.scripts].find(s=>s.textContent.startsWith('globalThis.CTM_ASSETS='));
    const value=JSON.parse(config.textContent.trim().slice('globalThis.CTM_ASSETS='.length,-1));
    assert.ok(value.bases['monaco-editor']);
    fs.writeFileSync(assetPage,original.replaceAll(value.bases['monaco-editor'],'https://untrusted.invalid/monaco/'));
    assert.equal(run(candidate,'real-self-consistent-asset-tamper').status,1);
    fs.writeFileSync(assetPage,original);
    const mathPage=htmls(candidate).find(file=>new JSDOM(fs.readFileSync(file,'utf8')).window.document.querySelector('script#MathJax-script'));
    assert.ok(mathPage,'actual examples exercise MathJax preservation');
    const mathOriginal=fs.readFileSync(mathPage,'utf8'),mathDOM=new JSDOM(mathOriginal);
    mathDOM.window.document.querySelector('script#MathJax-script').remove();
    fs.writeFileSync(mathPage,mathDOM.serialize());
    assert.equal(run(candidate,'real-missing-MathJax').status,1);
    fs.writeFileSync(mathPage,mathOriginal);
    const helper=[...doc.scripts].find(s=>(s.getAttribute('src')||'').includes('/ctm-assets-'));
    assert.ok(helper,'actual Quarto asset helper exists');
    const helperPath=path.resolve(path.dirname(assetPage),helper.getAttribute('src')),bytes=fs.readFileSync(helperPath);
    fs.appendFileSync(helperPath,'\n// mutation');
    assert.equal(run(candidate,'real-altered-helper').status,1);
    fs.writeFileSync(helperPath,bytes);
  }
  let changed=false, storeCellCapability=false;
  for(const file of htmls(candidate)){
    const html=fs.readFileSync(file,'utf8'),dom=new JSDOM(html);
    const island=dom.window.document.querySelector('script#ctm-store-manifest[type="application/json"]');
    if(island) {
      const manifest=JSON.parse(island.textContent);
      if(manifest.v===1 && Array.isArray(manifest.exercises) &&
         manifest.exercises.some(e=>e.component==='pyodide-interaktiv')) storeCellCapability=true;
    }
    const script=[...dom.window.document.scripts].find(s=>/^globalThis\.qpyodideCellDetails = (\[.*\]);$/m.test(s.textContent));
    if(!script)continue;
    const re=/^globalThis\.qpyodideCellDetails = (\[.*\]);$/m,match=re.exec(script.textContent),cells=JSON.parse(match[1]);
    const entries=cells.filter(c=>!String(c.options?.label||'').trim()&&c.options?.context!=='output'&&c.options?.context!=='setup'&&c.options?.['ctm-extra-source']);
    const a=entries[0],b=entries.find(c=>c.options['ctm-store-source']!==a?.options['ctm-store-source']);
    if(!a||!b)continue;
    for(const key of ['ctm-store-id','ctm-store-source','ctm-store-save','ctm-extra-source','ctm-extra-save'])
      [a.options[key],b.options[key]]=[b.options[key],a.options[key]];
    script.textContent=script.textContent.replace(re,'globalThis.qpyodideCellDetails = '+JSON.stringify(cells)+';');
    fs.writeFileSync(file,dom.serialize());changed=true;break;
  }
  if(!storeCellCapability) {
    console.log('No shared-store cell capability in this historical after build; positive replay passed, cell swap is inapplicable.');
    return;
  }
  assert.ok(changed,'shared-store example pages must contain two distinct unlabelled interactive cells');
  const negative=run(candidate,'real-metadata-swap');
  assert.equal(negative.status,1,'swapping only storage metadata must fail');
  assert.ok(negative.report.items.some(i=>!i.category&&i.area==='config'&&i.object==='qpyodideCellDetails'));
  console.log('Production Quarto hash calibration and metadata-only swap rejection passed.');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
