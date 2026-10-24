import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {proposalDoor,smallProposal} from './proposal-door.mjs'

/** Exercise administration doors; replacement rotation uses revoke/delete + issue. */
export async function adminAuditActions(h){
 const endpoint='/api/v1/launch/admin-audit',expected=[]
 async function track(label,action,operation,person='Import owner'){
  const before=new Set((await h.request(endpoint)).data.items.map(row=>row.id)),result=await operation()
  const rows=(await h.request(endpoint)).data.items.filter(row=>!before.has(row.id)&&row.action===action)
  assert.equal(rows.length,1,label+': exactly one committed action');assert.equal(rows[0].person,person,label+': actor name')
  assert.ok(rows[0].personId);expected.push(rows[0]);return result
 }
 const expiresAt=new Date(Date.now()+86400000).toISOString()
 const keyInput={appId:h.appId,entityId:h.entityId,name:'Audit API key',permissions:'read',expiresAt}
 const issueApi=async()=> (await track('API issue','credential.issue',()=>h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),...keyInput}}))).data.key
 const revokeApi=key=>track('API revoke','credential.revoke',()=>h.request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId:h.appId}}))
 let key=await issueApi();await revokeApi(key);key=await issueApi()
 const subscriptions='/api/v1/change-subscriptions'
 const createSubscription=async()=> (await track('Subscription issue','subscription.create',()=>h.request(subscriptions,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,url:'https://receiver.example.com/changes'}}),'Audit API key')).data
 let subscription=await createSubscription()
 await track('Subscription renew','subscription.refresh',()=>h.request(subscriptions+'/'+subscription.id+'/refresh',{method:'POST',secret:key.secret,body:{commandId:createUlid()}}),'Audit API key')
 await track('Subscription rotate retirement','subscription.delete',()=>h.request(subscriptions+'/'+subscription.id,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}}),'Audit API key')
 subscription=await createSubscription()
 await track('Subscription revoke','subscription.delete',()=>h.request(subscriptions+'/'+subscription.id,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}}),'Audit API key')
 await revokeApi(key)
 const issueProposer=async()=> (await track('Proposing issue','credential.issue',()=>h.request('/api/proposer-keys',{method:'POST',status:201,body:{commandId:createUlid(),name:'Audit proposing key',expiresAt}}))).data.key
 const revokeProposer=key=>track('Proposing revoke','credential.revoke',()=>h.request(`/api/proposer-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid()}}))
 let proposing=await issueProposer();await revokeProposer(proposing);proposing=await issueProposer()
 const agent=proposalDoor(h.origin,proposing.secret,'rest'),proposal=await agent.propose(smallProposal(proposing.appId).input)
 await track('Proposed adoption','release.adopt',()=>h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'agent_proposal',proposalId:proposal.id}}}))
 await revokeProposer(proposing)
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:smallProposal(createUlid()).input.schema})).data
 await track('Manual adoption','release.adopt',()=>h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}}))
 for(const action of ['issue','rotate','revoke'])await track('SCIM '+action,'scim.'+action,()=>h.request('/auth/settings/scim',{method:'POST',body:{action:action==='issue'?'rotate':action}}))
 const destination=async()=> (await track('Webhook key issue','automation.destination.create',()=>h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,kind:'webhook',url:'https://receiver.example.com/automation'}}))).data
 const oldDestination=await destination(),nextDestination=await destination()
 let definition={name:'Audit automation',appId:h.appId,entityId:h.entityId,event:'created',enabled:false,actions:[{kind:'webhook',destinationId:oldDestination.id}]},automation
 async function save(label,action,next=definition,expiry=expiresAt){
  const result=await track(label,action,()=>h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),...(automation?{id:automation.id,version:automation.version}:{}),expiresAt:expiry,definition:next}}))
  automation=result.data.result.value;definition=next
 }
 await save('Automation create','automation.create')
 await save('Automation edit','automation.edit',{...definition,name:'Audit automation reviewed'})
 await save('Automation enable','automation.enable',{...definition,enabled:true})
 const renewed=new Date(Date.parse(expiresAt)+86400000).toISOString()
 await save('Automation renew','automation.renew',definition,renewed)
 await save('Automation destination change','automation.destination.change',{...definition,actions:[{kind:'webhook',destinationId:nextDestination.id}]},renewed)
 await track('Automation disable','automation.disable',()=>h.request('/api/user-automations/'+automation.id+'/disable',{method:'POST',body:{commandId:createUlid(),version:automation.version}}))
 for(const target of [oldDestination,nextDestination])await track('Webhook key revoke','automation.destination.revoke',()=>h.request('/api/user-automations/destinations/'+target.id+'/revoke',{method:'POST',body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId}}))
 await h.request('/api/user-automations',{method:'POST',status:404,body:{commandId:createUlid(),id:automation.id,version:automation.version+1,expiresAt:renewed,definition:{...definition,enabled:true}}})
 for(const format of ['json','csv']){
  const response=await fetch(h.origin+endpoint+'?format='+format,{headers:{cookie:h.cookie}})
  assert.equal(response.status,200);const body=await response.text()
  for(const row of expected){
   if(format==='json')assert.equal(JSON.parse(body).data.items.filter(item=>item.id===row.id&&item.action===row.action&&item.person===row.person).length,1,row.action+' JSON exactly once')
   else assert.equal(body.split('\r\n').filter(line=>line.includes(row.id)&&line.includes(row.action)&&line.includes(row.person)).length,1,row.action+' CSV exactly once')
  }
 }
 const ownerId=expected[0].personId
 for(const query of [new URLSearchParams({person:ownerId}),new URLSearchParams({base:h.appId}),new URLSearchParams({from:'2020-01-01T00:00:00.000Z',to:'2099-01-01T00:00:00.000Z'})]){
  const rows=(await h.request(endpoint+'?'+query)).data.items
  const relevant=expected.filter(row=>(!query.has('person')||row.personId===ownerId)&&(!query.has('base')||row.baseId===h.appId))
  for(const row of relevant)assert.equal(rows.filter(item=>item.id===row.id).length,1,'Filtered log retains '+row.action)
 }
}
