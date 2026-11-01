#!/usr/bin/env node
// Audit-only mock provider. No external requests, keys or production mutation.
// node provider-matrix.cjs /workspace/ctm-libs [--real-cuts]
const http=require('node:http'), path=require('node:path'), assert=require('node:assert/strict');
const repo=process.argv[2]||'/workspace/ctm-libs';
const F=require(path.join(repo,'_extensions/ctm-libs/feedback/feedback-core.js'));
const calls=[], results=[]; let serial=0;
const json=(res,text='Final answer.')=>{res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});res.end(JSON.stringify({choices:[{message:{content:text},finish_reason:'stop'}]}));};
const event=(text,finish)=>'data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:finish}]})+'\n\n';
const server=http.createServer(async(req,res)=>{
 let data='';for await(const c of req)data+=c;const b=JSON.parse(data);calls.push({path:req.url,...b}); const mode=req.url.split('/')[1];
 const bad=(status,msg)=>{res.writeHead(status,{'content-type':'application/json'});res.end(msg);};
 if(mode==='qwen' && (b.messages[0]?.role!=='system'||b.messages.filter(m=>m.role==='system').length!==1))return bad(400,'System message must be at the beginning');
 if(mode==='tokens' && b.max_tokens)return bad(400,'max_tokens unsupported; use max_completion_tokens');
 if(mode==='nostream'&&b.stream)return bad(400,'stream unsupported');
 if(mode==='optional'&&b.thinking)return bad(400,'thinking unsupported');
 if(mode==='400')return bad(400,'invalid mock request');
 if(mode==='504')return bad(504,'mock proxy timeout');
 if(mode==='disconnect'){res.writeHead(200,{'content-type':'text/event-stream'});res.write(event('partial'));return setTimeout(()=>res.destroy(),10);}
 if(mode==='eof'){res.writeHead(200,{'content-type':'text/event-stream'});return res.end(event('Partial answer without finish reason'));}
 if(mode==='errorchunk'){res.writeHead(200,{'content-type':'text/event-stream'});return res.end('data: {"error":{"message":"mock overload"}}\n\n');}
 if(mode==='afterdone'){res.writeHead(200,{'content-type':'text/event-stream'});return res.end(event('Expected answer','stop')+'data: [DONE]\n\n'+event(' EXTRA AFTER DONE','stop'));}
 if(mode==='reasoningfield'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({choices:[{message:{reasoning_content:'PRIVATE',content:'Final answer.'},finish_reason:'stop'}]}));}
 if(mode==='malformed'){res.writeHead(200,{'content-type':'text/event-stream'});return res.end('data: bad-json\n\n'+event('Valid final answer','stop')+'data: [DONE]\n\n');}
 if(mode==='giant'){res.writeHead(200,{'content-type':'text/event-stream'});return res.end(event('x'.repeat(2*1024*1024),'stop'));}
 if(mode==='reasoning')return json(res,calls.filter(c=>c.path===req.url).length===1?'<think>Private reasoning</think>Final answer.':'Final answer.');
 if(mode==='heartbeat'){res.writeHead(200,{'content-type':'text/event-stream'});const timer=setInterval(()=>res.write(': keepalive\n\n'),20);res.on('close',()=>clearInterval(timer));return;}
 if(mode==='cut30'||mode==='cut60'||mode==='cut100'){const delay=Number(mode.slice(3))*1000;return setTimeout(()=>res.destroy(),delay);}
 if(mode==='slowfirst'){res.writeHead(200,{'content-type':'text/event-stream'});return setTimeout(()=>res.end(event('Slow answer','stop')+'data: [DONE]\n\n'),80);}
 if(b.stream){res.writeHead(200,{'content-type':'text/event-stream'});return res.end(event('Final answer.','stop')+'data: [DONE]\n\n');}
 return json(res);
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r)); const base='http://127.0.0.1:'+server.address().port;
 async function run(name, mode, options={}, model='mock-instruct', validate){const start=Date.now(),requestPath='/'+mode+'/'+(++serial)+'/chat/completions';
  try{const out=await F.createClient({baseUrl:base+requestPath.replace('/chat/completions',''),model}).complete([{role:'system',content:'Tutor'},{role:'user',content:'Answer'}],{timeoutMs:65000,...options,validate});results.push({name,ok:true,text:out.text.slice(0,100),length:out.text.length,ms:Date.now()-start,calls:calls.filter(c=>c.path===requestPath).length});}
  catch(e){results.push({name,ok:false,code:e.code,message:e.message,ms:Date.now()-start,calls:calls.filter(c=>c.path===requestPath).length});}}
 try{
 await run('OpenAI JSON','json',{stream:false}); await run('OpenAI/LiteLLM SSE','sse');
 let v=0;await run('Qwen one-leading-system correction','qwen',{},'qwen-instruct',()=>++v===1?'Use Norwegian.':'');
 await run('max_completion_tokens fallback','tokens');await run('stream unsupported fallback','nostream');
 await run('Kimi thinking body fallback','optional',{},'kimi-k2.5');await run('reasoning tags retry','reasoning',{stream:false});
 await run('generation strips reasoning tags','reasoning',{generation:true,stream:false});
 await run('400 classification','400',{stream:false}); await run('CORSless 504 Node transport only','504',{stream:false});
 await run('mid-stream socket disconnect','disconnect');await run('stream EOF without stop','eof');await run('SSE error chunk','errorchunk');
 await run('malformed event then valid event','malformed');await run('data after DONE appended','afterdone');await run('reasoning_content excluded','reasoningfield',{stream:false});await run('2MiB response accepted','giant');await run('slow first token','slowfirst');
 // Compress only the configured inactivity timer; production logic and real network reads unchanged.
 const realSetTimeout=global.setTimeout;global.setTimeout=(fn,ms,...args)=>realSetTimeout(fn,ms===65001?50:ms,...args);
 const controller=new AbortController();realSetTimeout(()=>controller.abort(),220);
 await run('heartbeats exceed 50ms inactivity budget by 4x','heartbeat',{timeoutMs:65001,signal:controller.signal});global.setTimeout=realSetTimeout;
 if(process.argv.includes('--real-cuts'))await Promise.all([run('real 30s cut','cut30',{stream:false,timeoutMs:45000}),run('real 60s cut','cut60',{stream:false,timeoutMs:80000}),run('real 100s cut','cut100',{stream:false,timeoutMs:120000})]);
 console.log(JSON.stringify({results,requestShapes:calls.map(({path,model,messages,max_tokens,max_completion_tokens,stream,thinking})=>({path,model,roles:messages.map(m=>m.role),max_tokens,max_completion_tokens,stream,thinking}))},null,2));
 assert.equal(results.find(r=>r.name==='stream EOF without stop').ok,true);
 assert.equal(results.find(r=>r.name==='2MiB response accepted').length,2*1024*1024);
 assert.equal(results.find(r=>r.name.startsWith('heartbeats')).code,'ABORTED');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
