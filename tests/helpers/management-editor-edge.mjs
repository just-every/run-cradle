import {createServer} from 'node:http'
import {once} from 'node:events'

/** The management service is a network edge, never a substitute application. */
export async function managementEditorEdge(applicationOrigin,installationId){
 const requests=[]
 const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1')
  const allowed=url.pathname==='/editor'&&url.searchParams.get('installation')===installationId
  requests.push({path:url.pathname,allowed})
  response.writeHead(200,{'content-type':'text/html','cache-control':'private, no-store',
   'content-security-policy':`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors ${allowed?applicationOrigin:"'none'"}`})
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Management network fixture</title>
   <style>body{font:16px system-ui;margin:0}section{position:fixed;right:16px;bottom:80px;width:280px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:16px;background:white;border:1px solid #aaa}h1{font-size:18px}textarea{display:block;width:100%;box-sizing:border-box}</style>
   <section><h1>Management network fixture</h1><p id="connection">Waiting for negotiation</p><label>Draft<textarea aria-label="Draft"></textarea></label></section>
   <script>
    const application=${JSON.stringify(applicationOrigin)},installation=${JSON.stringify(installationId)};
    let current,visible=false;
    const send=(type,extra={})=>parent.postMessage({protocol:'rer-editor',version:1,installationId:installation,type,...extra},application);
    const surface=()=>{const r=document.querySelector('section').getBoundingClientRect();send('interactive-regions',{sessionId:current,viewport:{width:innerWidth,height:innerHeight},regions:visible?[{x:r.x,y:r.y,width:r.width,height:r.height}]:[]})};
    addEventListener('message',event=>{
     if(event.origin!==application||event.source!==parent)return;
     const data=event.data;
     if(data?.protocol!=='rer-editor'||data.version!==1||data.installationId!==installation)return;
     if(data.type==='protocol-offer') {current=data.sessionId;send('protocol-accept',{sessionId:current});}
     if(data.type==='protocol-connected'&&data.sessionId===current){
      document.querySelector('#connection').textContent='Connected';
      surface();
     }
     if(data.type==='editor-visibility'&&data.sessionId===current){visible=data.open===true;surface();}
    });
    send('ready');
   </script></html>`)
 })
 server.listen(0,'127.0.0.1');await once(server,'listening')
 return {origin:`http://127.0.0.1:${server.address().port}`,requests,
  async close(){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}}
}
