const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {readExpected,applyExpected} = require('../integration/pyodide-parity/run.cjs');

test('retired or added cases match only their exact identity and declared direction',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ctm-parity-expected-'));
 try {
  const file=path.join(root,'expected.json');
  fs.writeFileSync(file,JSON.stringify({differences:[{path:'math-exercise/generated-variants.html',case:'removed-case',onlyIn:'base',reason:'Retired legacy source',required:true}]}));
  const expected=readExpected(file);
  const removed={id:'removed-case',path:'math-exercise/generated-variants.html',why:'only in base'};
  assert.equal(applyExpected(expected,[removed]).accepted.length,1);
  for(const changed of [{...removed,why:'only in head'},{...removed,why:undefined},{...removed,path:'math-exercise/examples.html'},{...removed,id:'different-case'}]){
   const result=applyExpected(expected,[changed]);assert.equal(result.unexpected.length,1);assert.equal(result.stale.length,1);
  }
  assert.equal(applyExpected(expected,[]).stale.length,1);
  fs.writeFileSync(file,JSON.stringify({differences:[{case:'x',onlyIn:'either',reason:'invalid'}]}));
  assert.throws(()=>readExpected(file),/onlyIn/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('a path-only entry never accepts a changed verdict; an entry naming the case does',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ctm-parity-expected-'));
 try {
  const file=path.join(root,'expected.json');
  const flip={id:'basic-features.html#q1',path:'math-exercise/basic-features.html',verdict:true,
   base:{results:[{status:'correct',score:1}]},head:{results:[{status:'incorrect',score:0}]}};
  fs.writeFileSync(file,JSON.stringify({differences:[{path:'math-exercise',reason:'a new page'}]}));
  let result=applyExpected(readExpected(file),[flip]);
  assert.equal(result.accepted.length,0);assert.equal(result.unexpected.length,1);
  // The same entry still covers a difference that keeps every verdict (feedback text, details).
  result=applyExpected(readExpected(file),[{...flip,verdict:false}]);
  assert.equal(result.accepted.length,1);
  fs.writeFileSync(file,JSON.stringify({differences:[{case:'basic-features.html#q1',reason:'a reviewed grading change'}]}));
  result=applyExpected(readExpected(file),[flip]);
  assert.equal(result.accepted.length,1);assert.equal(result.unexpected.length,0);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
