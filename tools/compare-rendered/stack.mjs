// Recognize only the reviewed v1 -> v2 shell move with identical engine data.
import {isDeepStrictEqual as same} from 'node:util';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const keys=(x,wanted)=>x&&same(Object.keys(x).sort(),wanted.split(' ').sort());
export function stackTransition(A,B) {
  const old=A.configs['stack-sympy-data'], next=B.configs['ctm-stack-data'];
  if(!old?.length||old.length!==next?.length)return false;
  const cards=[...B.doc.querySelectorAll('section.ctm-stack:not(.stack-diagnostic)')];
  if(cards.length!==next.length)return false;
  const descriptors=B.configs['ctm-stack-backend'];
  if(descriptors?.length!==1)return false;
  const d=descriptors[0];
  if(!keys(d,'id version adapter requires')||d.id!=='sympy'||d.adapter!=='backends/sympy.js'||!keys(d.requires,'isolation')||d.requires.isolation!==false||typeof d.version!=='string')return false;
  for(let i=0;i<old.length;i++) {
    const a=old[i],b=next[i];
    if(a.version!==1||b.version!==2||!keys(b,'version id common backend variants review')||
      !keys(b.common,'inputs qtests checker')||!keys(b.backend,'id planSchema stackRevision runtimeHash question')||
      b.backend.id!=='sympy'||b.backend.planSchema!==1||b.backend.runtimeHash!==null||!/^[a-f0-9]{40}$/.test(b.backend.stackRevision)||
      b.common.checker!==null||!same(a.question,b.backend.question)||!same(a.question.inputs,b.common.inputs)||
      !same(a.question.qtests,b.common.qtests)||a.review!==b.review||a.variants.length!==b.variants.length||
      b.id!==cards[i].dataset.stackId)return false;
    for(let j=0;j<a.variants.length;j++) {
      const v=b.variants[j];
      if(!keys(v,'n id hash display plan')||v.n!==j+1||v.id!==String(a.variants[j].seed)||!/^[a-f0-9]{64}$/.test(v.hash)||
        !same(a.variants[j],v.plan)||!same(v.display,Object.fromEntries(Object.entries(v.plan).filter(([k])=>k.endsWith('_html')))))return false;
    }
  }
  // The normalized JSON remains fully compared; any engine-data mutation above
  // leaves the original unmatched payloads as unexplained differences.
  B.configs['stack-sympy-data']=next.map((b,i)=>({version:1,id:old[i].id,question:b.backend.question,variants:b.variants.map(v=>v.plan),review:b.review}));
  delete B.configs['ctm-stack-data'];delete B.configs['ctm-stack-backend'];
  B.stackTransitionCards=new Set(cards);
  B.doc.ctmStackTransition=true;
  return true;
}
export function markStackChanges(B,items,contextIsOwn) {
  if(B.stackVariantCards)markVariantChanges(B,items,contextIsOwn);
  if(!B.stackTransitionCards)return;
  for(const item of items) {
    if(item.area!=='dom')continue;
    const node=item.node;
    if(!B.stackTransitionCards.has(node))continue;
    if(item.attribute==='class'&&item.before==='stack-sympy'&&item.after==='ctm-stack')item.stack='shell';
    const expected={'data-backend':'sympy','data-lang':'en','data-validation':'button'};
    if(item.change==='attribute added'&&expected[item.attribute]===item.after)item.stack='shell';
    if(item.change==='attribute added'&&item.attribute==='data-stop-after'&&/^[1-9]\d*$/.test(item.after))item.stack='shell';
    if(item.change==='attribute added'&&item.attribute==='data-mathjax'&&item.after==='https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js')item.stack='shell';
    if(item.attribute==='data-stack-id'&&item.after===node.dataset.ctmId&&node.dataset.ctmId)item.stack='identity';
    if(item.attribute==='data-stack-feedback') {
      try {
        const next=JSON.parse(item.after),before=item.before&&JSON.parse(item.before);
        if(before&&same(before,next))item.stack='json-order';
        else if(!before&&keys(next,'context policySelection language uiLanguage')&&keys(next.context,'mode refs text')&&
          ['auto','explicit','none'].includes(next.context.mode)&&typeof next.context.text==='string'&&
          keys(next.policySelection,'exercise name')&&next.policySelection.exercise===node.dataset.stackId&&next.language==='en'&&next.uiLanguage==='en')item.stack='auto-feedback';
      }catch{}
    }
  }
}

export function stackVariantsTransition(A,B) {
  const left=A.configs['ctm-stack-data'],right=B.configs['ctm-stack-data'];
  if(!left?.length || left.length!==right?.length || !A.file || !B.file)return false;
  if(left.some(p=>!keys(p.common,'inputs qtests checker')))return false;
  const oldCards=[...A.doc.querySelectorAll('section.ctm-stack')],cards=[...B.doc.querySelectorAll('section.ctm-stack')];
  if(cards.length!==right.length || oldCards.length!==left.length ||
    !same(A.configs['ctm-stack-backend'],B.configs['ctm-stack-backend']))return false;
  const edits=[];
  for(let i=0;i<left.length;i++) {
    const a=left[i],b=right[i],old=oldCards[i],card=cards[i];
    if(a.version!==2 || b.version!==2 || a.id!==old.dataset.stackId || !keys(b,'version id common backend variants review') ||
      !keys(b.common,'inputs qtests checker reviewCatalog renderMode') || b.common.renderMode!=='review' ||
      b.common.reviewCatalog!==false || b.common.checker!==null || !same(a.backend,b.backend) ||
      !same(a.common.inputs,b.common.inputs) || !same(a.common.qtests,b.common.qtests) ||
      !b.variants.length || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(b.id) || card.dataset.stackId!==b.id)return false;
    if(a.variants.some((v,j)=>!keys(v,'n id hash display plan') || v.n!==j+1 || v.id!==String(v.plan.seed) || !/^[0-9a-f]{64}$/.test(v.hash)))return false;
    for(const v of b.variants)if(!keys(v,'n id hash proposal reviewKey display plan') ||
      !/^seed=[1-9]\d*$/.test(v.id) || v.id!=='seed='+v.plan.seed || !/^[0-9a-f]{16}$/.test(v.hash) ||
      !/^[0-9a-f]{64}$/.test(v.reviewKey) || !(v.proposal===true && v.n===null || v.proposal===false && Number.isSafeInteger(v.n) && v.n>0))return false;
    const prompt=card.querySelector('.stack-prompt'),oldPrompt=old.querySelector('.stack-prompt');
    const expected=B.doc.createElement('div');expected.innerHTML=b.variants[0].display.question_html;
    if(!prompt || !oldPrompt)return false;
    const actual=prompt.cloneNode(true),headings=[...expected.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    [...actual.querySelectorAll('h1,h2,h3,h4,h5,h6')].forEach((h,j)=>{
      if(headings[j] && !headings[j].classList.contains('anchored'))h.classList.remove('anchored');
      if(!h.className)h.removeAttribute('class');
    });
    if(actual.innerHTML!==expected.innerHTML)return false;
    const toolbar=card.querySelector('.stack-toolbar'),oldToolbar=old.querySelector('.stack-toolbar');
    if(!toolbar || !oldToolbar || toolbar.innerHTML!==
      '<span class="stack-variant-number" aria-live="polite"></span><button type="button" class="stack-new-variant">New variant</button><span class="stack-variant-approval" role="status"></span>')return false;
    const source=card.closest('.stack-question-group')?.querySelector('code.language-markdown');
    const oldSource=old.closest('.stack-question-group')?.querySelector('code.language-markdown');
    if(Boolean(source)!==Boolean(oldSource))return false;
    if(source) {
      const labels=[...source.textContent.matchAll(/^#\| label: (.+)$/gm)].map(m=>m[1]);
      const clean=s=>s.replace(/^#\| (?:label|seed):.*\n/gm,'');
      if(labels.length!==1 || labels[0]!==b.id || clean(source.textContent)!==clean(oldSource.textContent))return false;
    }
    const tests=card.querySelector('.stack-tests'),oldTests=old.querySelector('.stack-tests');
    if(!oldTests && tests && tests.outerHTML!=='<button type="button" class="stack-tests">Run question tests</button>')return false;
    edits.push(()=>{prompt.innerHTML=oldPrompt.innerHTML;toolbar.replaceWith(oldToolbar.cloneNode(true));
      if(source)source.textContent=oldSource.textContent;if(!oldTests && tests)tests.remove();});
  }
  // Shape checks alone cannot explain changed values. Reinstantiate every seed
  // from the installed backend and verify the new hashes against native history.
  const helper=fileURLToPath(new URL('./verify-stack-plans.py',import.meta.url));
  const temporary=mkdtempSync(join(tmpdir(),'ctm-stack-compare-'));
  let bindings;
  try { for(const [side,mode] of [[A,'plans'],[B,'variants']]) {
    const input=join(temporary,'request.json');
    writeFileSync(input,JSON.stringify({page:side.file,cards:side.configs['ctm-stack-data'],mode}));
    const result=spawnSync(process.env.QUARTO_PYTHON || 'python3',[helper,input],{
      encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
    let receipt;try {receipt=JSON.parse(result.stdout);}catch{}
    if(result.status!==0 || receipt?.verified!==true) {
      if(process.env.CTM_STACK_COMPARE_DEBUG)console.error(JSON.stringify({page:side.file,status:result.status,signal:result.signal,error:result.error?.message,stderr:result.stderr?.slice(-1500)}));
      return false;
    }
    if(mode==='variants')bindings=receipt.bindings;
  }} finally {rmSync(temporary,{recursive:true,force:true});}
  if(!Array.isArray(bindings) || bindings.length!==cards.length || bindings.some((b,i)=>
    b.id!==right[i].id || cards[i].dataset.ctmId!==b.id || cards[i].dataset.ctmSource!==b.source || cards[i].dataset.ctmSave!==String(b.save)))return false;
  edits.forEach(edit=>edit());
  B.configs['ctm-stack-data']=structuredClone(left);
  B.stackVariantCards=new Set(cards);
  B.stackVariantBindings=new Map(cards.map((card,i)=>[card,bindings[i]]));
  const codeSignature=node=>node.outerHTML.replace(/((?:id|href)=")(#?)cb\d+(?=(?:-\d+)?")/g,'$1$2cbX');
  B.stackVariantDocCode=[];
  for(const before of A.doc.querySelectorAll('div.sourceCode[id]')) {
    const after=[...B.doc.querySelectorAll('div.sourceCode[id]')].find(node=>
      /^cb\d+$/.test(before.id) && /^cb\d+$/.test(node.id) && codeSignature(before)===codeSignature(node));
    if(after)B.stackVariantDocCode.push(before,after);
  }
  B.doc.ctmStackTransition=true;
  return true;
}

function markVariantChanges(B,items,contextIsOwn) {
  const manifest=B.configs['ctm-store-manifest']?.[0];
  const entries=new Set();
  for(const [card,binding] of B.stackVariantBindings) {
    const index=manifest?.exercises?.findIndex(e=>e.component==='ctm-stack' && e.id===binding.id && e.source===binding.source && e.save===binding.save && e.runtimeId===card.dataset.ctmRuntimeId);
    if(index>=0)entries.add(index);
  }
  for(const item of items) {
    if(item.area==='config' && item.object==='ctm-store-manifest') {
      const match=/^\/0\/exercises\/(\d+)\/(id|source|save|runtimeId)$/.exec(item.path || '');
      if(match && entries.has(Number(match[1])) || item.path==='/0/save' && manifest?.save===manifest.exercises.some(e=>e.save))item.stack='variant-store';
    }
    if(item.area!=='dom')continue;
    if(B.stackVariantDocCode.some(code=>code===item.node || code.contains(item.node)))item.stack='variant-documentation';
    const card=item.node, binding=B.stackVariantBindings.get(card);
    if(binding && item.change==='attribute changed') {
      if(['data-stack-id','data-ctm-id'].includes(item.attribute) && item.after===binding.id)item.stack='variant-identity';
      if(item.attribute==='data-ctm-source' && item.after===binding.source)item.stack='variant-store';
      if(item.attribute==='data-ctm-save' && item.after===String(binding.save))item.stack='variant-store';
      if(item.attribute==='data-ctm-runtime-id' && /^ctm-(?:runtime|block)-[1-9]\d*$/.test(item.after))item.stack='variant-store';
      if(item.attribute==='data-stack-feedback')try {
        const a=JSON.parse(item.before),b=JSON.parse(item.after);
        if(a.policySelection && b.policySelection?.exercise===binding.id) {
          a.policySelection.exercise=binding.id;
          if(item.page==='docs/authoring.html' || item.page==='corpus.html') {
            // These two documented teaching paragraphs changed with V5. The
            // context must still be exactly the shared resolver's own section.
            if(b.context?.mode==='auto' && a.context?.mode===b.context.mode && a.context?.refs===b.context.refs &&
              contextIsOwn?.(card,b.context.text,b.context.refs))a.context.text=b.context.text;
          }
          if(same(a,b))item.stack='variant-identity';
        }
      }catch{}
    }
    if(B.doc.ctmValidatedStoreBar?.contains(item.node) && ['attribute changed','text changed'].includes(item.change))item.stack='variant-store';
    const ancestors=item.ancestors || '';
    if(B.doc.ctmValidatedStoreBar && /div\.ctm-save-bar > p\.ctm-save-notice$/.test(ancestors) &&
      item.after===B.doc.ctmValidatedStoreBar.querySelector('.ctm-save-notice')?.textContent &&
      Object.values(manifest.messages).includes(item.before))item.stack='variant-store';
    if(!item.node?.closest?.('.ctm-stack') && item.page==='docs/authoring.html' &&
      /section#(?:start-with-a-native-export|question-block-options|choose-a-teaching-policy|validate-and-publish)\./.test(ancestors))item.stack='variant-documentation';
    if(item.page==='docs/python-checker-api.html' && /section#author-the-spd-checker\./.test(ancestors) && /pre\.sourceCode\.markdown/.test(ancestors))item.stack='variant-documentation';
    if(item.page==='corpus.html' && item.change==='text changed' && (
      item.before?.replace('Its original qtest passes on the first three deployed seeds.','Its original qtest passed on the recorded Moodle seeds; the SymPy proposals below run their own qtests.')===item.after ||
      item.before?.replace('cards use a replayed variant of each question.','cards use independently generated SymPy variants of each question.')===item.after))item.stack='variant-documentation';
  }
}
