import assert from 'node:assert/strict'
import https from 'node:https'
import http from 'node:http'
import dns from 'node:dns/promises'
import {syncBuiltinESMExports} from 'node:module'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomBytes} from 'node:crypto'
import {Response as WorkerResponse} from 'miniflare'
import {createRelayHandler} from '../../scripts/egress/handler.ts'
import {PinnedHttpTransport} from '../../scripts/egress/pinned-http.ts'

/** Only DNS/TLS routing is replaced; the real relay and pinned transport process real sockets. */
export async function automationNetworkEdge({extraHosts=[],receive,sharedSecret}={}) {
 const directory=await mkdtemp(join(tmpdir(),'cradle-automation-tls-'))
 const hosts=['automation-receiver.example.com','hooks.slack.com',...extraHosts],keyFile=join(directory,'receiver.key'),certFile=join(directory,'receiver.crt')
 execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-days','1',
  '-keyout',keyFile,'-out',certFile,'-subj',`/CN=${hosts[0]}`,'-addext',`subjectAltName=${hosts.map(host=>'DNS:'+host).join(',')}`],{stdio:'ignore'})
 const cert=await readFile(certFile),key=await readFile(keyFile),received=[],sockets=new Set()
 let privateAnswer=false,tlsCalls=0
 const receiver=https.createServer({key,cert},async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk)
  const body=Buffer.concat(chunks)
  received.push({path:req.url,method:req.method,headers:req.headers,body:body.toString('utf8')})
  if(receive&&await receive(req,res,body))return
  if(req.url==='/changes-retry-once'&&received.filter(request=>request.path===req.url).length===1){res.writeHead(429,{'retry-after':'1'});res.end('rate limited')}
  else if(req.url==='/redirect'){res.writeHead(302,{location:'https://'+hosts[0]+'/followed'});res.end()}
  else if(req.url==='/oversized'){res.writeHead(200);res.end(Buffer.alloc(65537,'x'))}
  else if(req.url==='/stalled'){res.writeHead(200);res.write('waiting')}
  else {res.writeHead(200,{'content-type':'text/plain'});res.end(req.url.startsWith('/services/')?'ok':'accepted')}
 })
 receiver.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))})
 await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve))
 const receiverPort=receiver.address().port,nativeLookup=dns.lookup,nativeRequest=https.request
 dns.lookup=async hostname=>{
  if(!hosts.includes(hostname)&&nativeLookup.fixtureHosts?.includes(hostname))return nativeLookup(hostname)
  assert.ok(hosts.includes(hostname),'The network edge receives only its declared test destinations')
  return [{address:'93.184.216.34',family:4},...(privateAnswer?[{address:'127.0.0.1',family:4}]:[])]
 }
 dns.lookup.fixtureHosts=[...new Set([...hosts,...(nativeLookup.fixtureHosts??[])])]
 https.request=(url,options,onResponse)=>{
  if(!hosts.includes(url.hostname)&&nativeRequest.fixtureHosts?.includes(url.hostname))return nativeRequest(url,options,onResponse)
  assert.ok(hosts.includes(url.hostname));assert.equal(options.rejectUnauthorized,true);assert.equal(options.agent,false)
  options.lookup(url.hostname,{all:false},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'93.184.216.34');assert.equal(family,4)})
  tlsCalls++
  return (nativeRequest.fixtureOriginal??nativeRequest)({...options,headers:{...options.headers,host:url.host},hostname:'127.0.0.1',port:receiverPort,path:url.pathname+url.search,servername:url.hostname,ca:cert},onResponse)
 }
 https.request.fixtureOriginal=nativeRequest.fixtureOriginal??nativeRequest
 https.request.fixtureHosts=[...new Set([...hosts,...(nativeRequest.fixtureHosts??[])])]
 syncBuiltinESMExports()
 const secret=sharedSecret??randomBytes(32).toString('base64url'),transportErrors=[],networkErrors=[];let outboundSeen=0
 const transport=new PinnedHttpTransport()
 const relay=http.createServer(createRelayHandler(secret,{async send(wire){
  try{return await transport.send(wire)}catch(error){
   const known=['DNS timeout','Transport timeout','Response limit exceeded','Destination DNS is not public','Response aborted','Response incomplete','Transport closed']
   transportErrors.push({code:error.code??null,reason:known.includes(error.message)?error.message:'transport_error'});throw error
  }
 }}))
 const relaySockets=new Set();relay.on('connection',socket=>{relaySockets.add(socket);socket.on('close',()=>relaySockets.delete(socket))})
 await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve))
 const relayOrigin=`http://127.0.0.1:${relay.address().port}`
 return {
  secret,received,transportErrors,networkErrors,receiverOrigin:'https://'+hosts[0],get tlsCalls(){return tlsCalls},get outboundSeen(){return outboundSeen},
  privateAnswers(enabled){privateAnswer=enabled},
  async deliver(wire,authorized=true){
   return fetch(relayOrigin+'/v1/deliver',{method:'POST',headers:{'content-type':'application/json',
    ...(authorized?{authorization:`Bearer ${secret}`}:{})},body:JSON.stringify(wire)})
  },
  async outbound(request){
   outboundSeen++
   try{
    assert.equal(request.url,'https://relay.egress.example.com/v1/deliver')
    // Fetch reserializes this body; let Node compute its own framing header.
    const headers=new Headers(request.headers);headers.delete('content-length')
    const response=await fetch(relayOrigin+'/v1/deliver',{method:request.method,headers,body:await request.text()})
    if(!response.ok)networkErrors.push({status:response.status})
    return new WorkerResponse(await response.arrayBuffer(),{status:response.status,headers:response.headers})
   }catch(error){networkErrors.push({code:error.code??error.cause?.code??null,name:error.name});throw error}
  },
  async close(){
   dns.lookup=nativeLookup;https.request=nativeRequest;syncBuiltinESMExports()
   for(const socket of [...sockets,...relaySockets])socket.destroy()
   await Promise.all([new Promise(resolve=>receiver.close(resolve)),new Promise(resolve=>relay.close(resolve))])
   await rm(directory,{recursive:true,force:true})
  },
 }
}
