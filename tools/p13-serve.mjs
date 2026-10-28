// Static acceptance server: preserve deployed bytes and expose real HTTP headers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
export async function serve(root,port=0,isolated=false){
  root=fs.realpathSync(root);
  const server=http.createServer((req,res)=>{
    // DIAGNOSTIC: request timing log (P13_SERVE_LOG=1).
    if(process.env.P13_SERVE_LOG==='1'){const start=Date.now();res.on('close',()=>console.log(JSON.stringify({t:start,ms:Date.now()-start,m:req.method,u:req.url,s:res.statusCode,done:res.writableFinished})));}
    const headers=isolated?{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}:{};
    try {
      const url=new URL(req.url,'http://local');
      let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
      if(!file.startsWith(root+path.sep)&&file!==root)throw new Error('outside root');
      if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      file=fs.realpathSync(file);
      if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw new Error('outside root');
      res.writeHead(200,{...headers,'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':fs.statSync(file).size});
      if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
    }catch{res.writeHead(404,headers);res.end();}
  });
  await new Promise(resolve=>server.listen(port,'0.0.0.0',resolve));return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await serve(process.argv[2],Number(process.argv[3]),process.argv.includes('--isolated'));
  console.log(JSON.stringify({port:server.address().port,isolated:process.argv.includes('--isolated')}));
}
