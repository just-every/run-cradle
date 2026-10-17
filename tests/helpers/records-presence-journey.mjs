import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {harness,add} from './records-manual-harness.mjs'
import {adoptFixtureOperators} from './base-fixture-auth.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {createRecordPresence} from '../../src/domains/records/presence.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {AdmissionError} from '../../src/domains/admission/errors.ts'

/** VIEW-014: real D1 and records HTTP doors; only authentication is injected. No new test registration. */
export async function recordsPresenceJourney(){
 const h=await harness()
 try{
  let {draft,r}=await h.create()
  const other=createUlid(),session=createUlid(),time=Date.now()
  await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(other,'Second operator','second@example.test',time,time).run()
  await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(other,other,time,time).run()
  await h.db.prepare('INSERT INTO authority_sessions(id,principal_id,token_hash,csrf_hash,authentication_epoch,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,1,?,?,?)').bind(session,other,createUlid(),createUlid(),time,time,time+3600000).run()
  const peer={...h.ctx,principal:{...h.ctx.principal,id:other,humanId:other,sessionId:session}}
  const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(draft.appId).first()
  const rules=JSON.parse(policy.rules_json).map(rule=>({...rule,id:createUlid(),principals:[{id:other,kind:'human'}]})),policyId=createUlid()
  await h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(policyId,draft.appId,'Second operator',JSON.stringify(rules),time,time).run()
  await h.db.prepare('INSERT INTO authority_memberships(principal_id,app_id,policy_id) VALUES(?,?,?)').bind(other,draft.appId,policyId).run()
  await adoptFixtureOperators(h.db)
  for(const actor of [h.ctx,peer]){
   const base=createUlid();actor.principal.baseSessionId=base
   await h.db.prepare("INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at) VALUES(?,?,?,1,'native',?,?)").bind(base,createUlid(),actor.principal.id,time,time+3600000).run()
   await h.db.prepare('INSERT INTO cradle_base_sessions(base_id,session_id) VALUES(?,?)').bind(base,actor.principal.sessionId).run()
  }
  const table=r.registry.get(draft.appId,draft.tables[0].id).schema,entityPath=`/api/v1/apps/${draft.appId}/entities/${table.id}`
  const origin='https://presence.example.test'
  const authenticate=async request=>{
   const selected=request.headers.get('x-test-person')
   if(selected==='signed-out')throw new AdmissionError('signed_out','Sign in')
   const actor=selected==='peer'?peer:h.ctx
   return selected==='machine'?{...actor,principal:{...actor.principal,sessionId:null,credentialId:createUlid()}}:actor
  }
  const http=()=>createRecordHttp({...r.services,authenticate}),commands=()=>createCommandHttp({...r,authenticate})
  async function call(path,person='owner',body={},status=200,door=http()){
   const response=await door.fetch(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','x-test-person':person},body:JSON.stringify(body)}))
   const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));assert.equal(response.headers.get('cache-control'),'no-store')
   return status===200?result.data:result.error
  }
  const pulse=(path=entityPath,person='owner',status=200)=>call(path+'/presence',person,{},status)
  const people=result=>result.participants.map(person=>person.id).sort()
  const both=[h.owner,other].sort()
  async function saveView(visibility='app'){
   const view={appId:draft.appId,entityId:table.id,name:'Activity view',display:'grid',fields:[table.fields[0].id],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:table.fields[0].id},visibility,shipped:false}
   return (await call('/api/v1/commands/view.save','owner',{commandId:createUlid(),expected:[],input:{view}},200,commands())).value
  }
  const shared=await saveView(),second=await saveView(),privateView=await saveView('private'),sharedPath=`/api/v1/views/${shared.id}`,privatePath=`/api/v1/views/${privateView.id}`
  const row=await add(h,r,table,{[table.fields[0].id]:'Before'});await add(h,r,table,{[table.fields[0].id]:'Second'})
  const page=await call(entityPath+'/query','owner',{limit:1});assert.ok(page.nextCursor)
  const revision=await r.services.reader.revision()
  await pulse(sharedPath,'peer')
  assert.deepEqual(people(await pulse()),[h.owner],'A saved view does not announce activity in its table')
  const result=await pulse(sharedPath)
  assert.deepEqual(people(result),both)
  for(const person of result.participants)assert.deepEqual(Object.keys(person).sort(),['id','name'])
  assert.equal(result.participants.find(person=>person.id===other).name,'Second operator')
  assert.equal(result.revision,revision)
  assert.equal(await r.services.reader.revision(),revision,'Heartbeats never create command admissions')
  assert.equal((await call(entityPath+'/query','owner',{limit:1,cursor:page.nextCursor})).items.length,1,'Presence preserves a retained record cursor')
  assert.deepEqual(people(await pulse(`/api/v1/views/${second.id}`)),[h.owner],'Different saved views remain separate')
  await pulse(entityPath,'peer');assert.deepEqual(people(await pulse()),both)
  await call('/api/v1/commands/record.patch','peer',{commandId:createUlid(),expected:[{ref:row.ref,version:1}],input:{ref:row.ref,changes:{[table.fields[0].id]:'Committed by colleague'}}},200,commands())
  assert.ok((await pulse(sharedPath)).revision>revision)
  assert.equal((await call(entityPath+'/query')).items.find(item=>item.id===row.id).fields[table.fields[0].id].value,'Committed by colleague')

  await h.db.prepare('DELETE FROM record_presence').run()
  await pulse(privatePath)
  assert.deepEqual(people(await pulse(entityPath,'peer')),[other],'Private-view activity does not leak through the table')
  assert.deepEqual(people(await pulse(sharedPath,'peer')),[other],'Private-view activity does not leak through a shared view')
  await pulse(privatePath,'peer',404)
  await pulse(entityPath,'signed-out',401);await pulse(entityPath,'machine',403)
  await pulse(`/api/v1/apps/${createUlid()}/entities/${table.id}`,'peer',403)
  const spoof=await call(entityPath+'/presence','peer',{id:h.owner,name:'Impersonated',sessionId:h.session})
  assert.deepEqual(people(spoof),[other],'Request payload cannot choose presence identity')
  await pulse()
  await h.db.prepare('UPDATE record_presence SET expires_at=? WHERE principal_id=?').bind(Date.now()-1,other).run()
  assert.deepEqual(people(await pulse()),[h.owner])
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_presence WHERE principal_id=?').bind(other).first()).n,0,'Expired handles are pruned')

  const restore=()=>h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policyId).run()
  await pulse(sharedPath,'peer');await pulse(sharedPath)
  await h.db.prepare("UPDATE authority_policies SET rules_json='[]',version=version+1 WHERE id=?").bind(policyId).run()
  assert.deepEqual(people(await pulse(sharedPath)),[h.owner],'Returned participants recheck current read policy')
  await pulse(sharedPath,'peer',403)
  await restore();await pulse(sharedPath,'peer')
  await h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),session).run()
  assert.deepEqual(people(await pulse(sharedPath)),[h.owner],'Revoked mirrored sessions disappear immediately')
  await pulse(sharedPath,'peer',403)
  await h.db.prepare('UPDATE authority_sessions SET revoked_at=NULL WHERE id=?').bind(session).run();await pulse(sharedPath,'peer')
  await h.db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),peer.principal.baseSessionId).run()
  assert.deepEqual(people(await pulse(sharedPath)),[h.owner],'Revoked Base sessions disappear even while the mirror remains active')
  await pulse(sharedPath,'peer',403)
  await h.db.prepare('UPDATE oa_sessions SET revoked_at=NULL WHERE id=?').bind(peer.principal.baseSessionId).run();await pulse(sharedPath,'peer')
  await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=?").bind(other).run()
  assert.deepEqual(people(await pulse(sharedPath)),[h.owner]);await pulse(sharedPath,'peer',403)
  await h.db.prepare("UPDATE authority_memberships SET state='active',version=version+1 WHERE principal_id=?").bind(other).run();await pulse(sharedPath,'peer')
  const batch=h.db.batch.bind(h.db);let heartbeatBatches=0
  h.db.batch=async statements=>{
   if(++heartbeatBatches===2)await h.db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),peer.principal.baseSessionId).run()
   return batch(statements)
  }
  try{assert.deepEqual(people(await pulse(sharedPath)),[h.owner],'A revocation after participant projection is fenced before response')}
  finally{h.db.batch=batch}
  await h.db.prepare("UPDATE authority_principals SET state='erased' WHERE id=?").bind(other).run()
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_presence WHERE principal_id=?').bind(other).first()).n,0,'Erasure deletes all activity handles without waiting for another heartbeat')

  // Revoke between preparation and the heartbeat SQL: no presence write is admitted.
  await h.db.prepare('DELETE FROM record_presence WHERE principal_id=?').bind(h.owner).run()
  const racingPolicy={...r.policy,async scope(ctx,input){const scope=await r.policy.scope(ctx,input);await h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run();return scope}}
  const raceHttp=createRecordHttp({...r.services,presence:createRecordPresence(h.db,racingPolicy,r.services.metadata),authenticate})
  await call(entityPath+'/presence','owner',{},403,raceHttp)
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_presence WHERE principal_id=?').bind(h.owner).first()).n,0,'Atomic heartbeat guards reject an authority race')
 }finally{h.close()}
}
