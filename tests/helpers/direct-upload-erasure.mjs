import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createUlid} from '../../src/core/shared/ids.ts'
import {AUTHORITY_ENTITY_IDS} from '../../src/domains/authority/contracts.ts'
import {completeFirstRun} from './complete-first-run.mjs'

// A real pending stream fences erasure, then releases its reservation on rejection.
export async function directUploadErasure(h,{begin,headers}){
 const {LAUNCH_APP_ID}=await import('../../src/apps/launch/contracts.ts')
 const name='synthetic-cradle-9511',email=[name,'example.test'].join('@')
 const policy=(await h.db.prepare('SELECT policy_id FROM authority_memberships WHERE app_id=? AND principal_id=?').bind(LAUNCH_APP_ID,h.operator).first()).policy_id
 const person=(await h.request('/api/v1/commands/member.invite',{method:'POST',body:{commandId:createUlid(),expected:[],input:{email,name,scopes:[{appId:LAUNCH_APP_ID,policyId:policy,legacy:false}]}}})).data.value.id
 await h.request('/auth/invite',{method:'POST',status:202,body:{email,displayName:name,role:'member'}})
 const invite=(await h.mailMessages()).findLast(message=>message.personalizations?.some(group=>group.to?.some(to=>to.email===email)))
 assert.ok(invite)
 const href=invite.content.find(part=>part.type==='text/plain').value.match(/https?:\/\/[^\s<>"']+/g).find(value=>new URL(value).pathname==='/auth/confirm'),token=new URL(href).searchParams.get('token')
 const confirmed=await fetch(h.origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({token})})
 assert.equal(confirmed.status,303)
 const session={cookie:confirmed.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '),token}
 await confirmed.arrayBuffer();await completeFirstRun(h.origin,session.cookie)
 const member=async()=>(await h.request('/api/v1/members?appId='+LAUNCH_APP_ID)).data.items.find(item=>item.id===person)
 const lifecycle=async(action,status=200)=>{
  const current=await member();assert.ok(current)
  return h.request('/api/v1/commands/member.'+action,{method:'POST',status,body:{commandId:createUlid(),expected:[{ref:{appId:LAUNCH_APP_ID,entityId:AUTHORITY_ENTITY_IDS.member,recordId:person},version:current.version}],input:{memberId:person,reason:'synthetic-cradle-9512'}}})
 }
 await lifecycle('remove')
 const bytes=Buffer.alloc(32,'x'),upload=await begin(bytes.length,createHash('sha256').update(bytes).digest('hex'))
 let finish;const gate=new Promise(resolve=>finish=resolve)
 const body=new ReadableStream({async start(controller){controller.enqueue(bytes.subarray(0,16));await gate;controller.close()}})
 const pending=fetch(h.origin+upload.uploadUrl,{method:'PUT',headers,body,duplex:'half'})
 try{
  let reserved=false
  for(let n=0;n<100;n++){if(await h.db.prepare('SELECT 1 FROM lifecycle_file_writes w JOIN evidence_files f ON f.object_key=w.object_key WHERE f.id=?').bind(upload.file.id).first()){reserved=true;break}await new Promise(resolve=>setTimeout(resolve,20))}
  assert.ok(reserved)
  const refused=await lifecycle('erase',409)
  assert.match(refused.error.message,/in-flight file write/)
  assert.equal((await member()).state,'removed','Pending upload prevents a false erasure confirmation')
 }finally{finish()}
 const rejected=await pending;assert.equal(rejected.status,413);await rejected.arrayBuffer()
 assert.equal((await h.db.prepare('SELECT count(*) n FROM lifecycle_file_writes').first()).n,0)
 const row=await h.db.prepare('SELECT state,object_key FROM evidence_files WHERE id=?').bind(upload.file.id).first()
 assert.equal(row.state,'rejected');assert.equal(await(await h.runtime.getR2Bucket('FILES')).head(row.object_key),null)
 const erased=(await lifecycle('erase')).data.value
 assert.equal(erased.confirmed,true);assert.equal(erased.erasureState,'complete')
 const denied=await fetch(h.origin+'/api/v1/apps',{headers:{cookie:session.cookie}})
 assert.equal(denied.status,401);await denied.arrayBuffer()
 const replay=await fetch(h.origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({token:session.token})})
 assert.ok([400,401,403,404,409,410].includes(replay.status));assert.equal(replay.headers.get('set-cookie'),null);await replay.arrayBuffer()
 console.log('PROBE FILE-001 erasure: pending streamed body -> erase 409; interrupted stream rejected and bytes removed; erase completes; old session and confirmation replay refused')
}
