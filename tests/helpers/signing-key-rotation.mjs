import assert from 'node:assert/strict'
import {verifyWebhook} from '../../vendor/base/modules/integrations/core/webhook.ts'
import {unbase64} from '../../src/adapters/crypto.server.ts'

/** Pause at the relay boundary after preparation, then receive the signed wire over HTTP. */
export async function preparedSigningRotation({h,edge,path,destinationId,priorKey,dispatch,rotate}){
 const original=edge.outbound,receivedBefore=edge.received.length
 let prepared,release,held=false
 const ready=new Promise(resolve=>{prepared=resolve}),gate=new Promise(resolve=>{release=resolve})
 edge.outbound=async request=>{
  const wire=await request.clone().json()
  if(!held&&new URL(wire.url).pathname===path){held=true;prepared();await gate}
  return original(request)
 }
 const pending=dispatch()
 let rotation
 try{
  await Promise.race([ready,pending.then(()=>assert.fail('The dispatcher must prepare the held delivery before rotation'))])
  assert.equal(edge.received.slice(receivedBefore).filter(row=>row.path===path).length,0,'The prepared delivery has not reached the receiver')
  rotation=await rotate()
 }finally{release();try{await pending}finally{edge.outbound=original}}
 const received=edge.received.slice(receivedBefore).filter(row=>row.path===path)
 assert.equal(received.length,1,'Exactly one held delivery reaches the real receiver after rotation')
 const ping=received[0],input={body:new TextEncoder().encode(ping.body),headers:ping.headers,tenant:h.appId,destinationId}
 await verifyWebhook({...input,key:unbase64(priorKey)})
 await assert.rejects(verifyWebhook({...input,key:unbase64(rotation.signingKey)}),'A delivery prepared before rotation keeps its prior signing key')
 return rotation
}
