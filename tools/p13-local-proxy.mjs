// Restrict WebKit's HTTP transport to the local acceptance servers, including
// service-worker requests. Keeping the LAN URL preserves its insecure origin.
import http from 'node:http';

export async function localProxy(hosts, ports) {
  const denied=[];
  const server=http.createServer((request,response)=>{
    let target;
    try {target=new URL(request.url);} catch {}
    if(!target || target.protocol!=='http:' || !hosts.includes(target.hostname) ||
       !ports.includes(Number(target.port || 80)) || target.username || target.password) {
      denied.push(request.url);response.writeHead(502);response.end('Outside the local exam bundle');return;
    }
    const headers={...request.headers,host:target.host};delete headers['proxy-connection'];
    const upstream=http.request(target,{method:request.method,headers},incoming=>{
      response.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(response);
    });
    upstream.on('error',()=>{response.writeHead(502);response.end('Local acceptance server unavailable');});
    request.on('aborted',()=>upstream.destroy());request.pipe(upstream);
  });
  server.on('connect',(request,socket)=>{denied.push(request.url);socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:'http://127.0.0.1:'+server.address().port,denied,
    async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
