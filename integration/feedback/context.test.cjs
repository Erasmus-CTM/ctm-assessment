const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{JSDOM}=require('jsdom');
const site=process.env.CTM_INTEGRATION_SITE;
const names=['ai-feedback','math-exercise','py-exercise','pyodide-interaktiv'];
function fixture(filters){
 let q=`---\nformat: html\n${filters.length ? 'filters: ['+filters.join(', ')+']\n' : ''}py-exercise:\n  feedback: true\npyodide:\n  feedback: true\n---\n`;
 for(const mode of ['auto','none','shared']){
 q+=`\n# Topic ${mode}\n\nCOMMON_PROSE with $\\frac{1}{2}$.\n\n## SECRET_HIDDEN_HEADER {hidden=true}\n\n::: {.hidden}\nSECRET_HIDDEN_BODY\n:::\n\n::: {.callout-note .example-author-notes}\n## SECRET_TITLE\nSECRET_BODY\n:::\n\n::: {.cell-output-display}\nSECRET_OUTPUT\n:::\n\n::: {.ai-feedback context="${mode}"}\nExplain a half.\n:::\n\n`;
 q+='```{math-exercise}\n#| label: '+mode+'\n#| context: '+mode+'\nCompute _[SECRET_ANSWER]\n```\n\n';
 q+='```{py-exercise}\n#| label: '+mode+'\n#| context: '+mode+'\n#| task: Print half.\nprint(0)\n## TESTS ##\nassert True\n```\n\n';
 q+='```{pyodide-python}\n#| task: Print half.\n#| context: '+mode+'\nprint(0)\n```\n';
 }
 q+='\n::: {#shared .ai-context}\nSHARED_FACT: one half is $\\frac{1}{2}$.\n\n::: {.ai-feedback-ignore}\nSECRET_NESTED\n:::\n:::\n';
 q+='\n# Marked Python\n\nMARKER_CONTEXT\n\n```python\n# pyodide: task=Print half., feedback-context=shared\nprint(0)\n```\n';
 q+='\n::: {.cell}\n```python\n# pyodide: task=Print half., feedback-context=none\nprint(0)\n```\n\n::: {.cell-output-stdout}\nSECRET_ENGINE_OUTPUT\n:::\n:::\n';
 q+='\n# Nested examples\n\nNESTED_LEAD\n\n- A list item.\n\n  ```{py-exercise}\n  #| task: Print one.\n  print(0)\n  ## TESTS ##\n  assert True\n  ```\n\n::: {.ai-context #nested}\nNESTED_TAGGED_PROSE\n\n```{pyodide-python}\n#| task: Print one.\nprint(0)\n```\n:::\n';
 return q;
}
test('one shared installation supplies identical context across integrations, orders and install layouts',{skip:!site},()=>{
 for(const qualified of [false,true]){
 const dir=fs.mkdtempSync(path.join(path.dirname(path.dirname(site)),'common-context-'));
 try{
  
  for(const name of names)fs.cpSync(path.join(path.dirname(site),'_extensions',name),path.join(dir,'_extensions',...(qualified?['Erasmus-CTM']:[]),name),{recursive:true});
  fs.mkdirSync(path.join(dir,'chapter'));
  const filters=qualified?['ai-feedback','py-exercise','pyodide-interaktiv','math-exercise']:['math-exercise','pyodide-interaktiv','py-exercise'];
  fs.writeFileSync(path.join(dir,'_quarto.yml'),'project:\n  type: website\n  render: [chapter/context.qmd]\nfilters: ['+filters.join(', ')+']\n');
  fs.writeFileSync(path.join(dir,'chapter','context.qmd'),fixture([]));
  const result=spawnSync(process.env.QUARTO_BIN||'quarto',['render'],{cwd:dir,encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stderr);
  const outputs=fs.readdirSync(dir,{recursive:true}).filter(f=>f.endsWith('context.html'));assert.equal(outputs.length,1, result.stderr);
  const output=path.join(dir,outputs[0]);
  const html=fs.readFileSync(output,'utf8'),w=new JSDOM(html,{url:'https://context.invalid/',runScripts:'outside-only'}).window;
  assert.match(html,/SECRET_TITLE/);assert.match(html,/SECRET_BODY/); // notes remain visible
  for(const name of ['feedback-core.js','feedback-dom.js','ai-feedback.js']){
   const scripts=[...w.document.scripts].filter(s=>s.src.endsWith('/'+name));assert.equal(scripts.length,1);
   w.eval(fs.readFileSync(path.resolve(path.dirname(output),scripts[0].getAttribute('src')),'utf8'));
  }
  const text=[...w.document.querySelectorAll('script.ai-feedback-data')].map(s=>{const d=JSON.parse(s.textContent);return{mode:d.contextMode,refs:d.contextRefs,text:d.context};});
  const math=[...w.document.querySelectorAll('.math-exercise-cell')].map(e=>({mode:e.dataset.contextMode,refs:e.dataset.contextRefs,text:JSON.parse(e.dataset.context)}));
  for(const script of w.document.scripts)if(script.textContent.includes('(window.__pyExercises =')||script.textContent.includes('globalThis.qpyodideCellDetails ='))w.eval(script.textContent);
  const python=w.__pyExercises.map(e=>e.feedbackContext),pyodide=w.qpyodideCellDetails.map(e=>e.options.feedbackContext);
  for(let i=0;i<3;i++){
   const contexts=[text[i],math[i],python[i],pyodide[i]].map(d=>JSON.parse(JSON.stringify(w.AIFeedback.contextMaterials(d))));
   for(const materials of contexts){
    assert.deepEqual(materials,contexts[0]);
    const serialized=JSON.stringify(materials);assert.doesNotMatch(serialized,/SECRET_|Print half|Explain a half/);
    if(i===1)assert.deepEqual(materials,[]);
    else {assert.match(materials[0].text,i===0?/COMMON_PROSE/:/SHARED_FACT/);assert.ok(materials[0].text.includes('\\frac{1}{2}'));}
   }
  }
  assert.equal(pyodide[3].mode,'explicit');assert.equal(pyodide[3].refs,'shared');assert.equal(pyodide[4].mode,'none');
  assert.match(python[3].text,/NESTED_LEAD/);assert.match(pyodide[5].text,/NESTED_TAGGED_PROSE/);
  w.close();
  // Missing installation fails early with an actionable render error.
  fs.rmSync(path.join(dir,'_extensions',...(qualified?['Erasmus-CTM']:[]),'ai-feedback'),{recursive:true});
  fs.writeFileSync(path.join(dir,'_quarto.yml'),'project:\n  type: website\n  render: [chapter/context.qmd]\nfilters: [math-exercise]\n');
  fs.writeFileSync(path.join(dir,'chapter/context.qmd'),fixture([]));
  fs.rmSync(path.join(dir,'_site'),{recursive:true,force:true});
  fs.rmSync(path.join(dir,'.quarto'),{recursive:true,force:true});
  const missing=spawnSync(process.env.QUARTO_BIN||'quarto',['render'],{cwd:dir,encoding:'utf8',timeout:120000});
  assert.notEqual(missing.status,0);assert.match(missing.stderr,/quarto add Erasmus-CTM\/ai-feedback/);
 }finally{if(!process.env.KEEP_CONTEXT)fs.rmSync(dir,{recursive:true,force:true});else console.log('Fixture:',dir);}
 }
});
