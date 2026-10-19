const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{JSDOM}=require('jsdom');
const site=process.env.CTM_INTEGRATION_SITE;
// The deprecated keys (project-policy, page-policy, page-policy-files) are kept
// here on purpose: they keep working in 0.9 with a warning each, and the new
// keys (policy-files adds up, policy selects) give the same effective policies.
const names=['plain-text','math-exercise','py-exercise','pyodide-interaktiv'];
const DEPRECATED=[/project-policy \(in _quarto\.yml\) is deprecated/,/page-policy \(in chapter\/example\.qmd\) is deprecated/,/page-policy-files \(in chapter\/example\.qmd\) is deprecated/];
function effective(dir){
 const w=new JSDOM(fs.readFileSync(path.join(dir,'_site/chapter/example.html'),'utf8'),{runScripts:'outside-only'}).window;
 w.eval(fs.readFileSync(path.join(dir,'_extensions/ctm-libs/feedback/feedback-core.js'),'utf8'));
 for(const script of w.document.scripts)if(/window.__aiFeedbackPolicies =|\(window.__pyExercises =|globalThis.qpyodideCellDetails =/.test(script.textContent))w.eval(script.textContent);
 const selections=[JSON.parse(w.document.querySelector('.ai-feedback-data').textContent).policySelection,JSON.parse(w.document.querySelector('.math-exercise-cell').dataset.feedbackPolicy),w.__pyExercises[0].policySelection,w.qpyodideCellDetails[0].options.policySelection];
 const result={selections:JSON.parse(JSON.stringify(selections)),
  policies:selections.map((selection,i)=>JSON.parse(JSON.stringify(w.AIFeedback.resolvePolicy(names[i],'en',{},undefined,selection)))),
  defaults:names.map(name=>JSON.parse(JSON.stringify(w.AIFeedback.resolvePolicy(name)))),
  marked:JSON.parse(JSON.stringify(w.qpyodideCellDetails.slice(1).map(c=>c.options.policySelection))),
  activityText:w.document.querySelector('.ai-feedback-activity').textContent};
 w.close();
 return result;
}
test('external project/page policies and inline named selections reach all four integrations',{skip:!site},()=>{
 const dir=fs.mkdtempSync(path.join(path.dirname(path.dirname(site)),'scoped-policy-'));
 try {
  fs.cpSync(path.join(path.dirname(site),'_extensions'),path.join(dir,'_extensions'),{recursive:true});
  fs.mkdirSync(path.join(dir,'chapter'));
  fs.writeFileSync(path.join(dir,'chapter/shape.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="5"/></svg>');
  fs.writeFileSync(path.join(dir,'_quarto.yml'),'project:\n  type: website\n  render: [chapter/example.qmd]\nfilters: [ctm-assessment]\nai-feedback:\n  policy-files: project.yml\n  project-policy: project-math\npy-exercise:\n  feedback: true\npyodide:\n  feedback: true\n');
  fs.writeFileSync(path.join(dir,'project.yml'),'ai-feedback:\n  policies:\n    project-math:\n      max-words: 300\n    short:\n      base-prompt: NAMED_REVIEW_INSTRUCTION\n      steps:\n        - step-prompt: First hint\n        - step-prompt: Full solution\n          allow-full-solution: true\n');
  let overrides='ai-feedback:\n  policies:\n    page-baseline:\n      max-words: 140\n    short:\n      steps:\n        - step-prompt: PAGE_HINT\n  exercises:\n';
  for(const name of names)overrides+=`    ${name}:\n      exercise-one:\n        max-words: 80\n`;
  fs.writeFileSync(path.join(dir,'page.yml'),overrides);
  const q='---\nai-feedback:\n  page-policy-files: page.yml\n  page-policy: page-baseline\n---\n\n::: {.ai-feedback #exercise-one feedback-policy="short"}\nExplain your work.\n:::\n\n'+['math-exercise','py-exercise','pyodide-python'].map(name=>'```{'+name+'}\n#| label: exercise-one\n#| feedback-policy: short\n'+(name==='math-exercise'?'Find _[2]':name==='py-exercise'?'#| task: Print one.\nprint(1)\n## TESTS ##\nassert True':'print(1)')+'\n```\n').join('\n')+'\n```{.python #bare-task}\n# pyodide: feedback-policy=short\nprint(1)\n```\n\n::: {.cell #wrapped-task}\n```python\n# pyodide: feedback-policy=short\nprint(1)\n```\n:::\n\n::: {.cell #cell-fig-display-task}\n```python\n# pyodide: feedback-policy=short\nprint(1)\n```\n::: {.cell-output-display}\n![Shape](shape.svg){#fig-display-task}\n:::\n:::\n\n::: {.cell #cell-fig-unrelated}\n```python\n# pyodide: feedback-policy=short\nprint(1)\n```\n:::\n\n![Unrelated figure](shape.svg){#fig-unrelated}\n';
  fs.writeFileSync(path.join(dir,'chapter/example.qmd'),q);
  const render=()=>spawnSync(process.env.QUARTO_BIN||'quarto',['render'],{cwd:dir,encoding:'utf8',timeout:120000});
  let run=render();assert.equal(run.status,0,run.stderr);
  for(const warning of DEPRECATED)assert.match(run.stderr,warning);
  const old=effective(dir);
  old.selections.forEach((selection,i)=>{
   assert.equal(selection.name,'short');assert.equal(selection.exercise,'exercise-one');
   const p=old.policies[i];
   assert.equal(p['max-words'],80);assert.equal(p.steps.length,1);assert.equal(p.steps[0]['step-prompt'],'PAGE_HINT');assert.equal(p['allow-full-solution'],false);
  });
  assert.deepEqual(Array.from(old.marked,s=>s.exercise),['bare-task','wrapped-task','fig-display-task','cell-fig-unrelated']);
  assert.ok(old.marked.every(s=>s.name==='short'));
  assert.equal(old.defaults[1]['max-words'],140);
  assert.ok(!old.activityText.includes('NAMED_REVIEW_INSTRUCTION'));
  // The same setup with the new keys: identical selections and effective policies, no warnings.
  fs.writeFileSync(path.join(dir,'_quarto.yml'),fs.readFileSync(path.join(dir,'_quarto.yml'),'utf8').replace('  project-policy: project-math\n','  policy: project-math\n'));
  fs.writeFileSync(path.join(dir,'chapter/example.qmd'),q.replace('  page-policy-files: page.yml\n  page-policy: page-baseline\n','  policy-files: page.yml\n  policy: page-baseline\n'));
  fs.rmSync(path.join(dir,'.quarto'),{recursive:true,force:true});
  run=render();assert.equal(run.status,0,run.stderr);
  assert.doesNotMatch(run.stderr,/is deprecated/);
  assert.deepEqual(effective(dir),old);
  fs.writeFileSync(path.join(dir,'_quarto.yml'),fs.readFileSync(path.join(dir,'_quarto.yml'),'utf8').replace('  policy: project-math\n','  project-policy: project-math\n'));
  for(const invalid of ['missing','{prompt: Inline is forbidden}']){
   fs.writeFileSync(path.join(dir,'chapter/example.qmd'),q.replaceAll('feedback-policy: short','feedback-policy: '+invalid));
   fs.rmSync(path.join(dir,'.quarto'),{recursive:true,force:true});
   run=render();assert.notEqual(run.status,0);assert.match(run.stderr,/feedback-policy/);
  }
  fs.writeFileSync(path.join(dir,'chapter/example.qmd'),q);
  fs.writeFileSync(path.join(dir,'project.yml'),'ai-feedback:\n  policies:\n    project-math:\n      max-words: 300\n    short: {}\n');
  fs.rmSync(path.join(dir,'.quarto'),{recursive:true,force:true});
  run=render();assert.notEqual(run.status,0);assert.match(run.stderr,/must define at least one option/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
