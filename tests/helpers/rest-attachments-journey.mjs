import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {createUlid} from '../../src/core/shared/ids.ts'
const {Agent}=createRequire(import.meta.resolve('miniflare'))('undici')

export async function restAttachmentsJourney(h,{call,endpoint,validator,seen,key,appId,entityId,record,attachmentId,nameId}){
 const bytes='synthetic-cradle-230 private attachment',sha256=createHash('sha256').update(bytes).digest('hex')
 const input={commandId:createUlid(),fieldId:attachmentId,filename:'synthetic-cradle-230.txt',mediaType:'text/plain',bytes:Buffer.byteLength(bytes),sha256}
 await call('attachment.begin',{id:record.id,body:input,status:403})
 const before=Number(await h.db.prepare('SELECT count(*) n FROM evidence_files WHERE app_id=?').bind(appId).first('n'))
 const upload=(await call('attachment.begin',{id:record.id,body:input,secret:null})).result.value
 const fileId=upload.file.id
 assert.equal(upload.maximumBytes,Buffer.byteLength(bytes))
 assert.equal(Number(await h.db.prepare('SELECT count(*) n FROM evidence_files WHERE app_id=?').bind(appId).first('n')),before+1)
 assert.equal((await call('attachment.begin',{id:record.id,body:input,secret:null})).result.value.file.id,fileId)
 const dispatcher=new Agent({pipelining:0})
 try{
  const csrfResponse=await fetch(h.origin+'/auth/csrf',{dispatcher,headers:{cookie:h.cookie}})
  assert.equal(csrfResponse.status,200);const csrf=(await csrfResponse.json()).csrfToken
  const raw=async(name,{id=record.id,file=fileId,body,secret,status=200,mediaType='text/plain'}={})=>{
   const item=endpoint(name);seen.add(name)
   const path=item.path.replace('{recordId}',id).replace('{fileId}',file)
   const response=await fetch(h.origin+path,{dispatcher,method:item.method,headers:{...(secret?{authorization:`Bearer ${secret}`}:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf}),'content-type':mediaType},...(body===undefined?{}:{body})})
   assert.equal(response.status,status,`${name} status`)
   if(name==='attachment.download'&&status===200){assert.equal(response.headers.get('cache-control'),'private, no-store');return response.text()}
   const result=await response.json()
   if(status===200){const valid=validator.compile(item.operation.responses['200'].content['application/json'].schema);assert.equal(valid(result),true,JSON.stringify(valid.errors))}
   return result
  }
  const read=await key({permissions:'read'})
  await raw('attachment.upload',{body:bytes,secret:read.secret,status:403})
  await raw('attachment.download',{status:404})
  assert.equal((await raw('attachment.upload',{body:bytes})).data.state,'available')
  assert.equal(await raw('attachment.download',{secret:read.secret}),bytes,'A current readable credential fetches the original bytes')
  const linked=(await call('update',{id:record.id,secret:null,body:{commandId:createUlid(),version:record.version,changes:{[attachmentId]:[{fileId}]}}})).result.value.rows[0]
  assert.deepEqual(linked.fields[attachmentId].value,[{fileId}])
  assert.deepEqual((await call('get',{id:record.id})).fields[attachmentId].value,[{fileId}])
  const bad=(await call('attachment.begin',{id:record.id,body:{...input,commandId:createUlid(),filename:'synthetic-cradle-231.txt'},secret:null})).result.value
  await raw('attachment.upload',{file:bad.file.id,body:'synthetic-cradle-231 wrong bytes',status:413})
  await raw('attachment.download',{file:bad.file.id,status:404})
  assert.deepEqual((await call('get',{id:record.id})).fields[attachmentId].value,[{fileId}],'Rejected bytes do not replace the linked attachment')
  const other=(await call('create',{body:{commandId:createUlid(),schemaVersion:record.schemaVersion,values:{[nameId]:'synthetic-cradle-232 separate attachment subject'}}})).result.value.rows[0]
  await raw('attachment.download',{id:other.id,status:404})
  const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id JOIN authority_credentials c ON c.principal_id=m.principal_id WHERE c.id=? AND m.app_id=?').bind(read.id,appId).first()
  try{
   const rules=JSON.parse(policy.rules_json).map(rule=>({...rule,readableFields:rule.readableFields.filter(id=>id!==attachmentId)}))
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
   await raw('attachment.download',{secret:read.secret,status:404})
  }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()}
  await h.request(`/api/user-keys/${read.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId}})
  await raw('attachment.download',{secret:read.secret,status:401})
  return linked
 }finally{await dispatcher.close()}
}
