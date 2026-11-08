import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {createUlid} from '../../src/core/shared/ids.ts'

// Real HTTP, emitted Worker, D1 and R2; no upload permission is injected.
export async function fileUploadJourney(h){
 const seed=JSON.parse(await readFile(new URL('../../seed.json',import.meta.url),'utf8'))
 const limit=seed.limits.attachmentUploadBytes,appId=createUlid(),entityId=createUlid(),nameId=createUlid(),fileId=createUlid()
 const envelope=input=>({commandId:createUlid(),expected:[],input})
 const draft={appId,name:'synthetic-cradle-9601',tables:[{id:entityId,label:'Items',primaryFieldId:nameId,fields:[
  {id:nameId,label:'Name',type:'text',required:true,unique:false},
  {id:fileId,label:'Files',type:'attachment',required:false,unique:false},
 ]}]}
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:envelope({kind:'manual_schema',previewId:preview.id})})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data
 const created=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{...envelope({appId,entityId,values:{[nameId]:'synthetic-cradle-9602'}}),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}]}})).data.value
 const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
 const chunk=Buffer.alloc(64*1024,97),tail=Buffer.from('synthetic-cradle-9603')
 function* chunks(size){for(let n=0;n<size-tail.length;n+=chunk.length)yield chunk.subarray(0,Math.min(chunk.length,size-tail.length-n));yield tail}
 const checksum=size=>{const hash=createHash('sha256');for(const bytes of chunks(size))hash.update(bytes);return hash.digest('hex')}
 const stream=size=>ReadableStream.from(chunks(size))
 const begin=async(size,sha256=checksum(size),status=200)=>h.request('/api/v1/commands/upload.begin',{method:'POST',status,body:envelope({appId,subject:created.ref,filename:'synthetic-cradle-9603.txt',mediaType:'text/plain',bytes:size,sha256})})
 const put=async(upload,body)=>{
  const response=await fetch(h.origin+upload.uploadUrl,{method:'PUT',duplex:'half',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'text/plain'},body})
  return {status:response.status,body:await response.json()}
 }
 const count=async(sql,...values)=>(await h.db.prepare(sql).bind(...values).first()).n
 const bucket=await h.runtime.getR2Bucket('FILES')
 const stored=async upload=>h.db.prepare('SELECT object_key,state FROM evidence_files WHERE id=?').bind(upload.file.id).first()
 const noBytes=async upload=>{
  const row=await stored(upload)
  assert.equal(row.state,'rejected');assert.equal(await bucket.head(row.object_key),null,'A refused upload leaves no stored object')
  await h.request(upload.uploadUrl,{status:404})
  assert.equal(await count('SELECT count(*) n FROM lifecycle_file_writes'),0,'Refused writes release their erasure reservation')
 }
 const upload=(await begin(limit)).data.value
 assert.equal((await put(upload,stream(limit))).status,200,'The declared direct-upload boundary arrives through the emitted Worker')
 const downloaded=await fetch(h.origin+upload.uploadUrl,{headers:{cookie:h.cookie}})
 assert.equal(downloaded.status,200)
 const actual=createHash('sha256');let downloadedBytes=0
 for await(const bytes of downloaded.body){actual.update(bytes);downloadedBytes+=bytes.length}
 assert.equal(downloadedBytes,limit);assert.equal(actual.digest('hex'),checksum(limit),'Boundary bytes return equal by independent checksum')
 const current=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/records/${created.id}`)).data.record
 await h.request('/api/v1/commands/record.patch',{method:'POST',body:{...envelope({ref:current.ref,changes:{[fileId]:[{fileId:upload.file.id}]}}),expected:[{ref:current.ref,version:current.version}]}})
 assert.equal((await h.request(`/api/v1/apps/${appId}/entities/${entityId}/records/${created.id}`)).data.record.fields[fileId].value[0].fileId,upload.file.id)

 const before=await count('SELECT count(*) n FROM evidence_files WHERE app_id=?',appId)
 const oversized=await begin(limit+1,checksum(limit),400)
 assert.ok(JSON.stringify(oversized.error).includes(String(limit)),'An oversized declaration names the declared byte limit')
 assert.equal(await count('SELECT count(*) n FROM evidence_files WHERE app_id=?',appId),before,'Oversized initiation creates no upload custody')
 const overflow=(await begin(limit)).data.value,overflowed=await put(overflow,stream(limit+1))
 assert.equal(overflowed.status,413);assert.ok(overflowed.body.error.message.includes(String(limit)))
 await noBytes(overflow)
 const shorter=(await begin(2,createHash('sha256').update('ab').digest('hex'))).data.value
 const overDeclared=await put(shorter,Buffer.from('abc'))
 assert.equal(overDeclared.status,413);assert.ok(overDeclared.body.error.message.includes(String(limit)));await noBytes(shorter)
 const mismatch=(await begin(3,createHash('sha256').update('abc').digest('hex'))).data.value
 assert.equal((await put(mismatch,Buffer.from('abd'))).status,413);await noBytes(mismatch)

 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId,h.operator).first()
 const rules=JSON.parse(policy.rules_json),setRules=async value=>h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(value),policy.id).run()
 const waiting=(await begin(3,createHash('sha256').update('abc').digest('hex'))).data.value
 for(const restriction of ['row','read','write','action']){
  await setRules(rules.map(rule=>rule.entityId!==entityId?rule:restriction==='row'?{...rule,rows:{kind:'condition',fieldId:nameId,op:'eq',value:'synthetic-cradle-9604'}}:restriction==='read'?{...rule,readableFields:rule.readableFields.filter(id=>id!==fileId)}:restriction==='write'?{...rule,writableFields:rule.writableFields.filter(id=>id!==fileId)}:{...rule,actions:rule.actions.filter(action=>!action.startsWith('upload.'))}))
  const denied=await fetch(h.origin+waiting.uploadUrl,{method:'PUT',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'text/plain'},body:'abc'})
  assert.ok([403,404].includes(denied.status),restriction+' narrowing refuses a retained upload');await denied.arrayBuffer()
  const initiation=await fetch(h.origin+'/api/v1/commands/upload.begin',{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify(envelope({appId,subject:created.ref,filename:'synthetic-cradle-9605.txt',mediaType:'text/plain',bytes:3,sha256:createHash('sha256').update('abc').digest('hex')}))})
  assert.ok([403,404].includes(initiation.status),restriction+' narrowing refuses new upload custody');await initiation.arrayBuffer()
  const row=await stored(waiting);assert.equal(row.state,'uploading');assert.equal(await bucket.head(row.object_key),null)
  if(['row','read'].includes(restriction))await h.request(upload.uploadUrl,{status:404})
 }
 await setRules(rules)
 assert.equal((await put(waiting,Buffer.from('abc'))).status,200,'Restored current authority permits the retained upload')
 const inFlight=(await begin(3,createHash('sha256').update('abc').digest('hex'))).data.value
 let finish,narrowed
 const remaining=new Promise(resolve=>finish=resolve)
 const pending=put(inFlight,new ReadableStream({async start(controller){controller.enqueue(Buffer.from('a'));await remaining;controller.enqueue(Buffer.from('bc'));controller.close()}}))
 try{
  const row=await stored(inFlight);let reserved=false
  for(let attempt=0;attempt<100;attempt++){
   if(await count('SELECT count(*) n FROM lifecycle_file_writes WHERE object_key=?',row.object_key)===1){reserved=true;break}
   await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.equal(reserved,true,'The ordinary streamed upload reserves its private write before the body finishes')
  await setRules(rules.map(rule=>rule.entityId===entityId?{...rule,writableFields:rule.writableFields.filter(id=>id!==fileId)}:rule))
 }finally{finish();narrowed=await pending;await setRules(rules)}
 assert.equal(narrowed.status,403,'Losing attachment write authority during the body prevents publication')
 await noBytes(inFlight)
 await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE app_id=? AND principal_id=?").bind(appId,h.operator).run()
 await h.request(upload.uploadUrl,{status:404})
 const replay=await fetch(h.origin+waiting.uploadUrl,{method:'PUT',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'text/plain'},body:'abc'})
 assert.ok([403,404].includes(replay.status));await replay.arrayBuffer()
 console.log('PROBE FILE-001 direct-boundary: authenticated upload and download -> '+downloadedBytes+' bytes, checksum equal')
 console.log('PROBE FILE-001 oversized-initiation: limit plus one -> 400, named limit, no custody')
 console.log('PROBE FILE-001 overflowing-body: limit plus one and declaration plus one -> 413, named limit, no R2 bytes')
 console.log('PROBE FILE-001 current-authority: row, readable field, writable field, action and removed membership -> retained and new writes refused')
 console.log('PROBE FILE-001 streamed-authority-loss: field write permission removed during a reserved PUT -> 403, no R2 bytes or erasure reservation')
}
