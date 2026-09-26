const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{JSDOM}=require('jsdom');
const site=process.env.CTM_INTEGRATION_SITE;
test('external project/page policies and inline named selections reach all four integrations',{skip:!site},()=>{
 const dir=fs.mkdtempSync(path.join(path.dirname(path.dirname(site)),'scoped-policy-'));
 try {
  fs.cpSync(path.join(path.dirname(site),'_extensions'),path.join(dir,'_extensions'),{recursive:true});
  fs.mkdirSync(path.join(dir,'chapter'));
  fs.writeFileSync(path.join(dir,'_quarto.yml'),'project:\n  type: website\n  render: [chapter/example.qmd]\nfilters: [ctm-assessment]\nai-feedback:\n  policy-files: project.yml\npy-exercise:\n  feedback: true\npyodide:\n  feedback: true\n');
  fs.writeFileSync(path.join(dir,'project.yml'),'ai-feedback:\n  integrations:\n    math-exercise:\n      max-words: 300\n  policies:\n    short:\n      prompt: NAMED_REVIEW_INSTRUCTION\n      steps:\n        - prompt: First hint\n        - prompt: Full solution\n          allow-full-solution: true\n');
  let overrides='ai-feedback:\n  defaults:\n    max-words: 140\n  policies:\n    short:\n      steps:\n        - prompt: PAGE_HINT\n  exercises:\n';
  const names=['non-python','math-exercise','py-exercise','pyodide-interaktiv'];
  for(const name of names)overrides+=`    ${name}:\n      exercise-one:\n        max-words: 80\n`;
  fs.writeFileSync(path.join(dir,'page.yml'),overrides);
  const q='---\nai-feedback:\n  page-policy-files: page.yml\n---\n\n::: {.ai-feedback #exercise-one feedback-policy="short"}\nExplain your work.\n:::\n\n'+['math-exercise','py-exercise','pyodide-python'].map(name=>'```{'+name+'}\n#| label: exercise-one\n#| feedback-policy: short\n'+(name==='math-exercise'?'Find _[2]':name==='py-exercise'?'print(1)\n## TESTS ##\nassert True':'print(1)')+'\n```\n').join('\n')+'\n```{.python #bare-task}\n# pyodide: feedback-policy=short\nprint(1)\n```\n\n::: {.cell #wrapped-task}\n```python\n# pyodide: feedback-policy=short\nprint(1)\n```\n:::\n';
  fs.writeFileSync(path.join(dir,'chapter/example.qmd'),q);
  const render=()=>spawnSync(process.env.QUARTO_BIN||'quarto',['render'],{cwd:dir,encoding:'utf8',timeout:120000});
  let run=render();assert.equal(run.status,0,run.stderr);
  const w=new JSDOM(fs.readFileSync(path.join(dir,'_site/chapter/example.html'),'utf8'),{runScripts:'outside-only'}).window;
  w.eval(fs.readFileSync(path.join(dir,'_extensions/ai-feedback/feedback-core.js'),'utf8'));
  for(const script of w.document.scripts)if(/window.__aiFeedbackPolicies =|\(window.__pyExercises =|globalThis.qpyodideCellDetails =/.test(script.textContent))w.eval(script.textContent);
  const selections=[JSON.parse(w.document.querySelector('.ai-feedback-data').textContent).policySelection,JSON.parse(w.document.querySelector('.math-exercise-cell').dataset.feedbackPolicy),w.__pyExercises[0].policySelection,w.qpyodideCellDetails[0].options.policySelection];
  selections.forEach((selection,i)=>{
   assert.equal(selection.name,'short');assert.equal(selection.exercise,'exercise-one');
   const p=w.AIFeedback.resolvePolicy(names[i],'en',{},undefined,selection);
   assert.equal(p['max-words'],80);assert.equal(p.steps.length,1);assert.equal(p.steps[0].prompt,'PAGE_HINT');assert.equal(p['allow-full-solution'],false);
  });
  const marked=w.qpyodideCellDetails.slice(1).map(c=>c.options.policySelection);
  assert.deepEqual(Array.from(marked,s=>s.exercise),['bare-task','wrapped-task']);
  assert.ok(marked.every(s=>s.name==='short'));
  assert.equal(w.AIFeedback.resolvePolicy('math-exercise')['max-words'],140);
  assert.ok(!w.document.querySelector('.ai-feedback-activity').textContent.includes('NAMED_REVIEW_INSTRUCTION'));w.close();
  for(const invalid of ['missing','{prompt: Inline is forbidden}']){
   fs.writeFileSync(path.join(dir,'chapter/example.qmd'),q.replaceAll('feedback-policy: short','feedback-policy: '+invalid));
   fs.rmSync(path.join(dir,'.quarto'),{recursive:true,force:true});
   run=render();assert.notEqual(run.status,0);assert.match(run.stderr,/feedback-policy/);
  }
  fs.writeFileSync(path.join(dir,'chapter/example.qmd'),q);
  fs.writeFileSync(path.join(dir,'project.yml'),'ai-feedback:\n  policies:\n    short: {}\n');
  fs.rmSync(path.join(dir,'.quarto'),{recursive:true,force:true});
  run=render();assert.notEqual(run.status,0);assert.match(run.stderr,/must define at least one option/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
