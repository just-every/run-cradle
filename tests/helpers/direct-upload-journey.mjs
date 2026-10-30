import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {directUploadErasure} from './direct-upload-erasure.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

// The adopted schema and native owner policy are the only source of upload authority.
export async function directUploadJourney(h){
 const appId=createUlid(),entityId=createUlid(),title=createUlid(),attachment=createUlid()
 const command=(input,expected=[])=>({commandId:createUlid(),expected,input})
 const post=(action,input,expected=[])=>h.request('/api/v1/commands/'+action,{method:'POST',body:command(input,expected)})
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:{appId,name:'synthetic-cradle-9500',tables:[{id:entityId,label:'Files',primaryFieldId:title,fields:[{id:title,label:'Name',type:'text',required:true,unique:false},{id:attachment,label:'Files',type:'attachment',required:false,unique:false}]}]}})).data
 await post('release.adopt',{kind:'manual_schema',previewId:preview.id})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data
 const record=(await post('record.create',{appId,entityId,values:{[title]:'synthetic-cradle-9501'}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}])).data.value
 const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
 const headers={cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'text/plain'}
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),limit=100*1024*1024,chunk=Buffer.alloc(256*1024,'synthetic-cradle-9502')
 function stream(size){let remaining=size;return new ReadableStream({pull(controller){if(!remaining){controller.close();return}const bytes=chunk.subarray(0,Math.min(chunk.length,remaining));remaining-=bytes.length;controller.enqueue(bytes)}})}
 const hash=createHash('sha256');for(let n=0;n<limit;n+=chunk.length)hash.update(chunk.subarray(0,Math.min(chunk.length,limit-n)))
 const expectedHash=hash.digest('hex')
 const input=(bytes,sha256)=>({appId,subject:record.ref,filename:'synthetic-cradle-9502.txt',mediaType:'text/plain',bytes,sha256})
 const begin=async(bytes,sha256)=>(await post('upload.begin',input(bytes,sha256))).data.value
 const put=async(upload,body,status)=>{const response=await fetch(h.origin+upload.uploadUrl,{method:'PUT',headers,body,duplex:'half'});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result}
 const download=async(upload,status=200)=>{const response=await fetch(h.origin+upload.uploadUrl,{headers:{cookie:h.cookie}});assert.equal(response.status,status);return response}
 const retained=command(input(limit,expectedHash))
 const upload=(await h.request('/api/v1/commands/upload.begin',{method:'POST',body:retained})).data.value
 assert.equal(upload.maximumBytes,limit)
 await put(upload,stream(limit),200)
 const returned=await download(upload),readHash=createHash('sha256');let received=0
 for await(const bytes of returned.body){readHash.update(bytes);received+=bytes.length}
 assert.equal(received,limit);assert.equal(readHash.digest('hex'),expectedHash,'The boundary file returns identical bytes through the private download door')
 const attached=(await post('record.patch',{ref:record.ref,changes:{[attachment]:[{fileId:upload.file.id}]}},[{ref:record.ref,version:record.version}])).data.value
 assert.equal(attached.fields[attachment].value[0].fileId,upload.file.id)
 const before=(await h.db.prepare('SELECT count(*) n FROM evidence_files WHERE app_id=?').bind(appId).first()).n
 const oversized=await h.request('/api/v1/commands/upload.begin',{method:'POST',status:400,body:command(input(limit+1,expectedHash))})
 assert.match(JSON.stringify(oversized.error),/100 MB.*104,857,600 bytes/)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM evidence_files WHERE app_id=?').bind(appId).first()).n,before,'Oversized initiation creates no file custody')
 const bucket=await h.runtime.getR2Bucket('FILES')
 for(const scenario of ['overflow','interrupted','checksum']){
  const size=scenario==='overflow'?limit:32,declaredHash=scenario==='overflow'?expectedHash:digest(Buffer.alloc(size,'x'))
  const refused=await begin(size,declaredHash)
  const result=await put(refused,scenario==='overflow'?stream(limit+1):scenario==='interrupted'?Buffer.from('short'):Buffer.alloc(size,'y'),413)
  if(scenario==='overflow')assert.match(result.error.message,/100 MB.*104,857,600 bytes/)
  const metadata=(await h.request('/api/v1/files/'+refused.file.id)).data
  assert.equal(metadata.state,'rejected')
  await download(refused,404)
  const row=await h.db.prepare('SELECT object_key FROM evidence_files WHERE id=?').bind(refused.file.id).first()
  assert.equal(await bucket.head(row.object_key),null,scenario+': failed transfers leave no orphan object')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM lifecycle_file_writes').first()).n,0,scenario+': cleanup releases the durable write reservation')
 }
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId,h.operator).first(),rules=JSON.parse(policy.rules_json)
 const setRules=async value=>h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(value),policy.id).run()
 for(const restriction of ['row','read','write','action']){
  await setRules(rules)
  const pending=await begin(32,digest(Buffer.alloc(32,'x')))
  let finish;const gate=new Promise(resolve=>finish=resolve),body=new ReadableStream({async start(controller){controller.enqueue(Buffer.alloc(16,'x'));await gate;controller.enqueue(Buffer.alloc(16,'x'));controller.close()}})
  const writing=fetch(h.origin+pending.uploadUrl,{method:'PUT',headers,body,duplex:'half'})
  try{
   let reserved=false
   for(let n=0;n<100;n++){if(await h.db.prepare('SELECT 1 FROM lifecycle_file_writes w JOIN evidence_files f ON f.object_key=w.object_key WHERE f.id=?').bind(pending.file.id).first()){reserved=true;break}await new Promise(resolve=>setTimeout(resolve,20))}
   assert.ok(reserved,'The pending body holds its durable reservation')
   await setRules(rules.map(rule=>rule.entityId!==entityId?rule:restriction==='row'?{...rule,rows:{kind:'condition',fieldId:title,op:'eq',value:'synthetic-cradle-9599'}}:restriction==='read'?{...rule,readableFields:rule.readableFields.filter(id=>id!==attachment)}:restriction==='write'?{...rule,writableFields:rule.writableFields.filter(id=>id!==attachment)}:{...rule,actions:rule.actions.filter(action=>!action.startsWith('upload.'))}))
  }finally{finish()}
  const publication=await writing;assert.ok([403,404].includes(publication.status),restriction+': authority lost during transfer refuses publication');await publication.arrayBuffer()
  const rejected=await h.db.prepare('SELECT object_key,state FROM evidence_files WHERE id=?').bind(pending.file.id).first()
  assert.equal(rejected.state,'rejected');assert.equal(await bucket.head(rejected.object_key),null,'Revoked pending bytes are removed')
  const response=await fetch(h.origin+'/api/v1/commands/upload.begin',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(command(input(32,digest(Buffer.alloc(32,'x')))))})
  assert.ok([403,404].includes(response.status),restriction+': current authority refuses a new upload');await response.arrayBuffer()
  if(['row','read'].includes(restriction))await download(upload,404)
 }
 await setRules(rules)
 await download(upload).then(response=>response.body.cancel())
 await directUploadErasure(h,{begin,headers})
 await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE app_id=? AND principal_id=?").bind(appId,h.operator).run()
 await download(upload,404)
 await h.request('/api/v1/commands/upload.begin',{method:'POST',body:retained,status:403})
 console.log('PROBE FILE-001 direct boundary: adopted owner API -> 104857600 bytes returned with equal SHA-256')
 console.log('PROBE FILE-001 oversize: declaration and overflowing stream -> limit named; no available metadata or orphan object')
 console.log('PROBE FILE-001 authority: row, readable field, writable field, upload action and removed membership -> refused; checksum and interrupted bodies -> rejected and cleaned')
}
