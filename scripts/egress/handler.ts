import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { NodePinnedTransport } from '../../vendor/base/modules/integrations/core/node-transport.ts'
import { validateDestination } from '../../vendor/base/modules/integrations/core/destination.ts'
import type { TrustedTransport, WireRequest } from '../../vendor/base/modules/integrations/core/types.ts'

const hash=(value:string)=>createHash('sha256').update(value).digest()
function parseWire(value:unknown):WireRequest {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_wire')
 const wire=value as WireRequest
 if(Object.keys(wire).sort().join(',')!=='body,headers,url'||typeof wire.url!=='string'||typeof wire.body!=='string'||
  !wire.headers||typeof wire.headers!=='object'||Array.isArray(wire.headers))throw new Error('invalid_wire')
 validateDestination(wire.url)
 if(Buffer.byteLength(wire.body)>1048576||Object.keys(wire.headers).length>32)throw new Error('request_limit')
 for(const [name,content] of Object.entries(wire.headers))
  if(!/^[A-Za-z0-9-]{1,64}$/.test(name)||typeof content!=='string'||content.length>2048||/[\r\n\0]/.test(content))throw new Error('invalid_header')
 return wire
}

/** The transport seam is only for network-edge tests. The command supplies NodePinnedTransport. */
export function createRelayHandler(secret:string,transport:TrustedTransport=new NodePinnedTransport({timeoutMs:5000,maxResponseBytes:65536})) {
 if(secret.length<32)throw new Error('A private relay credential is required')
 const expected=hash(`Bearer ${secret}`)
 return async(request:IncomingMessage,response:ServerResponse)=>{
  response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store')
  const end=(status:number,code:string)=>{response.writeHead(status);response.end(JSON.stringify({error:code}))}
  if(request.method!=='POST'||request.url!=='/v1/deliver')return end(404,'not_found')
  if(!timingSafeEqual(hash(request.headers.authorization??''),expected))return end(401,'unauthorized')
  if(request.headers['content-type']!=='application/json')return end(415,'json_required')
  const timer=setTimeout(()=>request.destroy(),15000);let size=0,started=false
  try {
   const chunks:Buffer[]=[]
   for await(const chunk of request){size+=chunk.length;if(size>2097152)return end(413,'request_limit');chunks.push(Buffer.from(chunk))}
   const raw=Buffer.concat(chunks),wire=parseWire(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)))
   started=true
   const result=await transport.send(wire)
   if(result.status>=300&&result.status<400)return end(422,'redirect_refused')
   if(Buffer.byteLength(result.body)>65536)return end(502,'response_limit')
   const headers=Object.fromEntries(Object.entries(result.headers).filter(([name])=>['retry-after','content-type'].includes(name.toLowerCase())))
   response.writeHead(200);response.end(JSON.stringify({status:result.status,headers,body:result.body}))
  }catch {if(!response.headersSent)end(started?502:400,started?'delivery_unknown':'invalid_request')}
  finally {clearTimeout(timer)}
 }
}
