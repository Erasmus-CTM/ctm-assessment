// Recognize only the reviewed v1 -> v2 shell move with identical engine data.
import {isDeepStrictEqual as same} from 'node:util';
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
export function markStackChanges(B,items) {
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
