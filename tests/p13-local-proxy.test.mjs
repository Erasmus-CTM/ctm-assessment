import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {localProxy} from '../tools/p13-local-proxy.mjs';

test('WebKit transport forwards only exact local HTTP destinations',async()=>{
  const reached=[];
  const target=http.createServer((req,res)=>{reached.push(req.url);res.end('local bundle');});
  await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));
  const port=target.address().port,proxy=await localProxy(['127.0.0.1'],[port]);
  const request=(url,method='GET')=>new Promise((resolve,reject)=>{
    const req=http.request(proxy.url,{path:url,method},res=>{
      let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));
    });
    req.on('connect',(res,socket)=>{socket.destroy();resolve({status:res.statusCode});});
    req.on('error',reject);req.end();
  });
  try {
    assert.deepEqual(await request(`http://127.0.0.1:${port}/worker.js?q=1`),{status:200,body:'local bundle'});
    for(const url of [`http://localhost:${port}/`,`http://127.0.0.1:${port+1}/`,'https://127.0.0.1:'+port+'/','http://user@127.0.0.1:'+port+'/'])
      assert.equal((await request(url)).status,502);
    assert.equal((await request('outside.invalid:443','CONNECT')).status,502);
    assert.deepEqual(reached,['/worker.js?q=1']);
    assert.equal(proxy.denied.length,5);
  } finally {await proxy.close();await new Promise(resolve=>target.close(resolve));}
});
