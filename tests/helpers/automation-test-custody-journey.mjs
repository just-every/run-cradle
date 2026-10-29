import assert from 'node:assert/strict'
import {baseHttpSession} from './base-http-session.mjs'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

/** Hold only the mail acknowledgement while real ownership and erasure commands commit. */
export async function automationTestCustodyJourney(){
 const holds=new Map(),pending=[]
 let entered
 const ready=new Promise(resolve=>{entered=resolve})
 const h=await userAutomationRuntime(0,{mailResponse:async message=>{
  if(message.subject!=='synthetic-cradle-5102')return
  await new Promise(resolve=>{holds.set(message.custom_args.rer_delivery_id,resolve);if(holds.size===2)entered()})
 }})
 try{
  const owner=await h.db.prepare('SELECT p.id,o.email,o.display_name FROM authority_principals p JOIN cradle_base_operators b ON b.principal_id=p.id JOIN oa_operators o ON o.id=b.base_id WHERE p.initial_owner=1').first()
  const baseId=createUlid(),email=['synthetic-cradle-5101','example.test'].join('@')
  await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(baseId,email,'synthetic-cradle-5101',Date.now()).run()
  const successor=await h.db.prepare('SELECT principal_id AS id FROM cradle_base_operators WHERE base_id=?').bind(baseId).first()
  await h.request(`/api/v1/records/bases/${h.appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:successor.id,role:'editor',version:0}})
  await baseHttpSession(h.origin,email)
  const chosen=(await h.create('synthetic-cradle-5103')).record
  const saved=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-5104',appId:h.appId,entityId:h.entityId,event:'created',enabled:false,actions:[{kind:'email',operatorId:h.operator,subject:'synthetic-cradle-5102',text:'synthetic-cradle-5106'}]}}})).data.result.value
  const route=`/api/user-automations/${saved.id}/test`,inputs=[0,1].map(()=>({commandId:createUlid(),recordId:chosen.id,event:'created'}))
  const csrf=await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}}).then(response=>response.json())
  const raw=(session,path,body)=>fetch(h.origin+path,{method:body?'POST':'GET',headers:{cookie:session.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':session.csrfToken},...(body?{body:JSON.stringify(body)}:{})})
  const original={cookie:h.cookie,csrfToken:csrf.csrfToken}
  for(const input of inputs)pending.push(raw(original,route,input).then(async response=>({status:response.status,body:await response.json()})))
  await Promise.race([ready,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('The two admitted tests did not reach their mail edge')),15000);timer.unref()})])
  const stored=async id=>h.db.prepare('SELECT state,result_json FROM record_automation_tests WHERE id=?').bind(id).first()
  const beforeTransfer=await stored(inputs[0].commandId)
  const release=async input=>holds.get(JSON.parse((await stored(input.commandId)).result_json).steps[0].id)()
  assert.equal(beforeTransfer.state,'Unknown');assert.ok(beforeTransfer.result_json.includes(owner.email))
  const command=async(session,action,id)=>{
   const version=(await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(id).first()).version
   const response=await raw(session,'/api/v1/commands/'+action,{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000101',recordId:id},version}],input:{memberId:id,...(action==='member.transfer-ownership'?{}:{reason:'synthetic-cradle-5105'})}}),body=await response.json()
   assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.state,'committed');return body.data.value
  }
  // A fresh native email-link sign-in supplies the public ownership step-up.
  const fresh=await baseHttpSession(h.origin,owner.email)
  await command(fresh,'member.transfer-ownership',successor.id)
  await release(inputs[0])
  const transferred=await pending[0]
  assert.ok([401,403,404].includes(transferred.status),JSON.stringify(transferred))
  assert.deepEqual(await stored(inputs[0].commandId),beforeTransfer,'Lost author authority cannot persist the late private test result')
  const next=await baseHttpSession(h.origin,email)
  await command(next,'member.remove',owner.id)
  const erased=await command(next,'member.erase',owner.id)
  assert.equal(erased.confirmed,true)
  assert.equal((await h.db.prepare('SELECT state FROM authority_principals WHERE id=?').bind(owner.id).first()).state,'erased')
  const afterErasure=await stored(inputs[1].commandId)
  assert.ok(afterErasure&&!afterErasure.result_json.includes(owner.email),'Confirmed erasure scrubs the admitted test history before completion')
  await release(inputs[1])
  const completed=await pending[1]
  assert.ok([401,403,404].includes(completed.status),JSON.stringify(completed))
  assert.deepEqual(await stored(inputs[1].commandId),afterErasure,'In-flight completion cannot restore the erased identity or private output')
  const mailCount=(await h.mailMessages()).length
  const replay=await raw(original,route,inputs[1]);assert.ok([401,403,404].includes(replay.status));await replay.arrayBuffer()
  const replacement=await raw(next,route,inputs[1]);assert.equal(replacement.status,404);await replacement.arrayBuffer()
  assert.equal((await h.mailMessages()).length,mailCount,'Captured test replay cannot send after erasure or transfer')
  assert.deepEqual(await stored(inputs[1].commandId),afterErasure)
 }finally{for(const release of holds.values())release();await Promise.allSettled(pending);await h.close()}
}
