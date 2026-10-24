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
