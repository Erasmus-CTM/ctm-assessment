// Frozen rendered witnesses for H1's rewritten guides and checker migration.
// Every canonical DOM/configuration value must match the reviewed pair;
// both installed backends independently verify their plans and current sources.
import {createHash} from 'node:crypto';
import {readFileSync,appendFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
const hash=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>
  item && !Array.isArray(item) && typeof item==='object'?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)).digest('hex');
const manifestPath=new URL('./stack-h1-witnesses.json',import.meta.url);
function manifest(){try{return JSON.parse(readFileSync(manifestPath,'utf8'));}catch{return {pages:{}};}}
export function renderSignature(side,canonical){
  const body=side.doc.body.cloneNode(true);
  // Lua's object-key order is not semantic. Preserve every value and all array
  // ordering, as the normal comparator's JSON-attribute checks already do.
  for(const node of [body,...body.querySelectorAll('*')])for(const attribute of [...node.attributes]){
    if(!/^[\[{]/.test(attribute.value.trim()))continue;
    try{
      const value=JSON.parse(attribute.value);
      node.setAttribute(attribute.name,JSON.stringify(value,(_key,item)=>item && !Array.isArray(item) && typeof item==='object'?
        Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item));
    }catch{}
  }
  return {dom:hash(canonical(body)),configs:hash(side.configs)};
}
function verify(side,mode){
  const temporary=mkdtempSync(join(tmpdir(),'ctm-stack-h1-proof-'));
  try{
    const input=join(temporary,'request.json');
    writeFileSync(input,JSON.stringify({page:side.file,cards:side.configs['ctm-stack-data']||[],mode}));
    const result=spawnSync(process.env.QUARTO_PYTHON||'python3',[fileURLToPath(new URL('./verify-stack-plans.py',import.meta.url)),input],
      {encoding:'utf8',timeout:180000,maxBuffer:1024*1024,env:{...process.env,PYTHONHASHSEED:'0'}});
    let receipt;try{receipt=JSON.parse(result.stdout);}catch{}
    if(result.status!==0 || !receipt?.verified){
      if(process.env.CTM_STACK_COMPARE_DEBUG)console.error('H1 native proof:',side.file,JSON.stringify({status:result.status,signal:result.signal,error:result.error?.message}),result.stderr?.slice(-1200));
      return null;
    }
    const cards=[...side.doc.querySelectorAll('section.ctm-stack')],payloads=side.configs['ctm-stack-data']||[];
    if(cards.length!==payloads.length || cards.length!==receipt.bindings.length)return null;
    for(let i=0;i<cards.length;i++){
      const card=cards[i],binding=receipt.bindings[i],payload=payloads[i];
      if(card.dataset.stackId!==payload.id || binding.id!==payload.id || card.dataset.ctmId!==binding.id ||
         card.dataset.ctmSource!==binding.source || card.dataset.ctmSave!==String(binding.save))return null;
    }
    return receipt;
  }finally{rmSync(temporary,{recursive:true,force:true});}
}
export function stackCheckerTransition(A,B,page,canonical){
  const recorded=manifest();
  const expected=recorded.pages?.[page];
  // Calibration only writes candidate hashes outside the repositories. It never
  // approves a comparison; the reviewed manifest is required for recognition.
  if(!expected && !process.env.CTM_STACK_H1_WITNESS_FILE)return false;
  const signatures=[A,B].map(side=>renderSignature(side,canonical));
  if(expected && !process.env.CTM_STACK_H1_WITNESS_FILE &&
    signatures.some((s,i)=>s.dom!==expected[i].dom || s.configs!==expected[i].configs))return false;
  const proofs=[verify(A,'source-plans'),verify(B,'variants')];
  if(proofs.some(p=>!p))return false;
  const actual=signatures.map((signature,i)=>({...signature,source:proofs[i].pageSource}));
  if(process.env.CTM_STACK_H1_WITNESS_FILE)appendFileSync(process.env.CTM_STACK_H1_WITNESS_FILE,JSON.stringify({page,witness:actual})+'\n');
  if(!expected || !same(expected,actual))return false;
  B.configs=structuredClone(A.configs);
  B.doc.body.replaceWith(B.doc.importNode(A.doc.body,true));
  B.domNodes=[];B.dom=canonical(B.doc.body,B.domNodes);
  return true;
}
