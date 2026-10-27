const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('engine host preserves bytes, MIME and isolation; denies outside files',async()=>{
 const {serve}=await import('../tools/p13-serve.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p13-host-')),root=path.join(dir,'site');
 fs.mkdirSync(root);fs.writeFileSync(path.join(root,'index.html'),'<title>Exam</title>');
 const bytes=Buffer.from([0,97,115,109,255]);fs.writeFileSync(path.join(root,'python.wasm'),bytes);
 fs.writeFileSync(path.join(dir,'private'),'outside');fs.symlinkSync(path.join(dir,'private'),path.join(root,'escape'));
 try {for(const isolated of [false,true]){
  const server=await serve(root,0,isolated),base='http://127.0.0.1:'+server.address().port;
  try {
   const res=await fetch(base+'/python.wasm');assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes);
   assert.equal(res.headers.get('content-type'),'application/wasm');
   assert.equal(res.headers.get('cross-origin-opener-policy'),isolated?'same-origin':null);
   assert.equal(res.headers.get('cross-origin-embedder-policy'),isolated?'require-corp':null);
   const head=await fetch(base+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
   for(const file of ['/missing','/escape','/%2e%2e%2fprivate'])assert.equal((await fetch(base+file)).status,404);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
