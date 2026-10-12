import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {bindings} from './rer-data-fixture.mjs'
/** The real HTTP body stays open while the owner requests erasure. */
export async function erasureWriteRace({copy,origin,prior,csrfToken,id,request,value,text}){
 const headers={cookie:prior.cookie,origin,'content-type':'application/json','x-csrf-token':csrfToken}
 const command=async(action,input)=>{const response=await fetch(origin+'/api/v1/commands/'+action,{method:'POST',headers,body:JSON.stringify({commandId:id(),expected:[],input})});const result=await response.json();assert.equal(response.status,200,action+': '+JSON.stringify(result.error??{}));return result.data.value}
 const staged=await command('source.stage',{appId:prior.records.appId,purpose:'source'})
 const bytes=Buffer.from(text),upload=await command('upload.begin',{appId:prior.records.appId,subject:staged.subject,filename:'erasure-race.txt',mediaType:'text/plain',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
 let finish;const remaining=new Promise(resolve=>finish=resolve)
 const body=new ReadableStream({async start(controller){controller.enqueue(bytes.subarray(0,1));await remaining;controller.enqueue(bytes.subarray(1));controller.close()}})
 const pending=fetch(origin+upload.uploadUrl,{method:'PUT',headers:{...headers,'content-type':'text/plain'},body,duplex:'half'})
 try{
  await bindings(copy.source,async({DB})=>{for(let n=0;n<100;n++){if(await DB.prepare('SELECT 1 FROM lifecycle_file_writes LIMIT 1').first())return;await new Promise(resolve=>setTimeout(resolve,100))}assert.fail('Real streaming PUT acquires a durable reservation before body completion')})
  const refused=await request({...value,commandId:id()}),result=await refused.json();assert.equal(refused.status,409);assert.match(result.error.message,/in-flight file write/)
 }finally{finish()}
 const response=await pending;assert.equal(response.status,200,'The original upload can finish before erasure');await response.arrayBuffer()
 await bindings(copy.source,async({DB})=>assert.equal((await DB.prepare('SELECT count(*) n FROM lifecycle_file_writes').first()).n,0,'Successful file publication releases its reservation in admission'))
 console.log('ERASURE_FILE_RACE: real delayed PUT reserves before bytes; erase409; publication succeeds and reservation clears')
}
