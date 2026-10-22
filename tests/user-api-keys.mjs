import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {userAutomationRuntime} from './helpers/user-automation-runtime.mjs'
import {createUlid} from '../src/core/shared/ids.ts'

contract('API-USER-001','[WEBHOOK-USER-002] owner issues a once-only hashed key; real API reads and scoped writes stop on revoke and issuer policy change',async()=>{
 const h=await userAutomationRuntime(18951)
 try {
  const record=(await h.create('Key acceptance')).record
  const issue={commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'Read service',permissions:'read',expiresAt:new Date(Date.now()+86400000).toISOString()}
  const issued=(await h.request('/api/user-keys',{method:'POST',status:201,body:issue})).data.key
  assert.ok(typeof issued.secret==='string'&&issued.secret.length>=32)
  const subscriptions='/api/v1/change-subscriptions'
  const subscription=(await h.request(subscriptions,{method:'POST',secret:issued.secret,status:201,body:{appId:h.appId,entityId:h.entityId,url:'https://receiver.example.com/changes'}})).data
  assert.ok(subscription.id)
  const stored=await h.db.prepare('SELECT token_hash,scopes_json FROM authority_credentials WHERE id=?').bind(issued.id).first()
  assert.ok(stored.token_hash&&!stored.token_hash.includes(issued.secret),'The credential stores a digest')
  const listed=(await h.request(`/api/user-keys?appId=${h.appId}`)).data.keys
  assert.equal(listed.length,1);assert.ok(!JSON.stringify(listed).includes(issued.secret),'Listing never recovers the key')
  await h.request('/api/user-keys',{method:'POST',status:409,body:issue})
  const route=`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${record.ref.recordId}`
  const read=(await h.request(route,{secret:issued.secret})).data
  assert.equal(read.record.fields[h.nameId].value,'Key acceptance')
  await h.patch(record,{[h.statusId]:'not allowed'},issued.secret,createUlid(),403)
  const otherApp=(await h.request('/api/v1/apps')).data.items.find(app=>app.id!==h.appId)
  assert.ok(otherApp)
  const otherEntity=(await h.request(`/api/v1/apps/${otherApp.id}/entities`)).data.items[0]
  assert.deepEqual((await h.request(`/api/v1/apps/${otherApp.id}/entities`,{secret:issued.secret})).data.items,[])
  await h.request(`/api/v1/apps/${otherApp.id}/entities/${otherEntity.id}/query`,{secret:issued.secret,method:'POST',body:{limit:10},status:403})
  const browser=await fetch(h.origin+'/app/settings',{redirect:'manual',headers:{authorization:`Bearer ${issued.secret}`}})
   .catch(error=>assert.fail(`Browser request transport failed: ${error.cause?.code??error.cause?.name??'unknown'}`))
  assert.equal(browser.status,303);await browser.body?.cancel()
  await h.request(`/api/user-keys/${issued.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId:h.appId}})
  await h.request(route,{secret:issued.secret,status:401})
  const writable=(await h.request('/api/user-keys',{method:'POST',status:201,body:{...issue,commandId:createUlid(),name:'Write service',permissions:'write'}})).data.key
  const commandId=createUlid(),patched=(await h.patch(record,{[h.statusId]:'updated'},writable.secret,commandId)).data
  assert.equal(patched.state,'committed');assert.equal(patched.value.fields[h.statusId].value,'updated')
  const replay=(await h.patch(record,{[h.statusId]:'updated'},writable.secret,commandId)).data
  assert.equal(replay.state,'committed');assert.equal(replay.value.version,patched.value.version)
  const created=(await h.create('Created by the key',writable.secret)).record
  assert.equal(created.fields[h.nameId].value,'Created by the key')
  const delegation=await h.db.prepare('SELECT d.grant_id FROM authority_delegations d JOIN authority_credentials c ON c.principal_id=d.principal_id WHERE c.id=?').bind(writable.id).first()
  const grant=await h.db.prepare('SELECT * FROM authority_grants WHERE id=?').bind(delegation.grant_id).first()
  for(const restriction of ['revoked','expired','restore-held']){
   await h.db.prepare('UPDATE authority_grants SET state=?,revoked_at=?,expires_at=?,restore_hold=? WHERE id=?')
    .bind(restriction==='revoked'?'revoked':'active',restriction==='revoked'?Date.now():null,restriction==='expired'?1:grant.expires_at,restriction==='restore-held'?1:0,grant.id).run()
   await h.request(route,{secret:writable.secret,status:403})
   await h.patch(created,{[h.statusId]:'stale delegated authority'},writable.secret,createUlid(),403)
  }
  await h.db.prepare('UPDATE authority_grants SET state=?,revoked_at=?,expires_at=?,restore_hold=? WHERE id=?').bind(grant.state,grant.revoked_at,grant.expires_at,grant.restore_hold,grant.id).run()
  assert.equal((await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${created.ref.recordId}`)).data.record.version,created.version)
  const owner=await h.db.prepare("SELECT principal_id FROM cradle_base_operators WHERE base_id=(SELECT id FROM oa_operators WHERE email='import-owner@example.test')").first()
  await h.db.prepare('UPDATE authority_policies SET version=version+1 WHERE id=(SELECT policy_id FROM authority_memberships WHERE app_id=? AND principal_id=?)').bind(h.appId,owner.principal_id).run()
  await h.request(route,{secret:writable.secret,status:403})
 }finally{await h.close()}
})
