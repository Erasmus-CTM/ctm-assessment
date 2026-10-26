import http from 'node:http';
import os from 'node:os';
import {webkit} from 'playwright';
import {localProxy} from './p13-local-proxy.mjs';
const lan=Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address;
const reached=[];
const server=http.createServer((req,res)=>{reached.push(req.url);res.end('<!doctype html><title>P13 local origin</title>');});
await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
const port=server.address().port,proxy=await localProxy(['127.0.0.1',lan],[port]);
try {
 for(const mode of ['direct','bypass','forward']) {
  const browser=await webkit.launch({headless:true,...(mode==='direct'?{}:{proxy:mode==='bypass'?{server:'http://127.0.0.1:9',bypass:'127.0.0.1,'+lan}:{server:proxy.url}})});
  try {
   for(const host of ['127.0.0.1',lan])for(const routed of [false,true]) {
    const context=await browser.newContext({serviceWorkers:'block'});
    if(routed)await context.route('**/*',r=>r.continue());
    const page=await context.newPage();
    const result={mode,host,routed,requestsBefore:reached.length};
    try {await page.goto(`http://${host}:${port}/probe`,{waitUntil:'domcontentloaded',timeout:5000});result.title=await page.title();result.secure=await page.evaluate(()=>isSecureContext);}
    catch(error){result.error=String(error);}
    result.requestsAfter=reached.length;console.log(JSON.stringify(result));await context.close();
   }
  }finally{await browser.close();}
 }
}finally{await proxy.close();await new Promise(resolve=>server.close(resolve));}
