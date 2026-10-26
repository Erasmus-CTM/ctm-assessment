// Exact witnesses for H1's reviewed result changes; never a broad case mask.
'use strict';
const {createHash}=require('node:crypto');
const {isDeepStrictEqual:same}=require('node:util');
const hash=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>
  item && !Array.isArray(item) && typeof item==='object' ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item)).digest('hex');
function evidence(a,b,ar,br) {
  const side=(c,r)=>c&&r?{request:hash({probe:c.probe,request:c.request}),result:hash({results:r.results,feedback:r.feedback,responses:r.responses??null})}:null;
  const verdict=r=>r.results.map(x=>({status:x.status,score:x.score??null}));
  let unchanged=null;
  if(ar&&br) {
    const aa=verdict(ar),bb=verdict(br);
    unchanged=aa.length===bb.length && aa.every((x,i)=>x.status===bb[i].status &&
      (x.score===bb[i].score || typeof x.score==='number' && typeof bb[i].score==='number' && Math.abs(x.score-bb[i].score)<=1e-12));
  }
  return {before:side(a,ar),after:side(b,br),sameQuestion:a&&b?a.request.question.name===b.request.question.name:null,verdictsUnchanged:unchanged};
}
function validate(entry) {
  const w=entry.witness;
  if(!entry.path?.startsWith('ctm-stack/') || !entry.case?.startsWith('stack:') || /^\/.*\/$/.test(entry.case) ||
    !w || !same(Object.keys(w).sort(),['after','before','sameQuestion','verdictsUnchanged']) ||
    ![null,true,false].includes(w.sameQuestion) || ![null,true,false].includes(w.verdictsUnchanged))throw new Error('H1 witness requires an exact STACK page/case and complete evidence');
  for(const side of [w.before,w.after])if(side!==null && (!same(Object.keys(side).sort(),['request','result']) ||
    !/^[a-f0-9]{64}$/.test(side.request) || !/^[a-f0-9]{64}$/.test(side.result)))throw new Error('Invalid H1 request/result witness');
  if(!w.before && !w.after || w.sameQuestion===true && w.verdictsUnchanged!==true)throw new Error('H1 witnesses cannot accept changed verdicts for the same question');
  if((!w.before || !w.after || w.sameQuestion===false) && !/^ctm-stack\/docs\/python-(?:checker-api|answer-tests)\.html$/.test(entry.path))throw new Error('H1 card retirement/replacement is restricted to the rewritten checker guides');
}
function matches(entry,difference) {
  return entry.witness ? same(entry.witness,difference.stackEvidence) : !difference.stackEvidence;
}
module.exports={evidence,validate,matches};
