import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {AUTHORITY_ENTITY_IDS} from '../../src/domains/authority/contracts.ts'

const synthetic=id=>'synthetic-cradle-'+id
const emailFor=id=>[synthetic(id),'example.test'].join('@')
const entityRoute=base=>`/api/v1/apps/${base.appId}/entities/${base.entityId}`
const recordRoute=base=>`${entityRoute(base)}/records/${base.record.id}`

function sessionRequests(h){
 return async function requestAs(cookie,path,{method,body,status=200}={}){
  const headers={cookie,origin:h.origin}
  if(body!==undefined){
   const csrf=await fetch(h.origin+'/auth/csrf',{headers:{cookie}})
   assert.equal(csrf.status,200)
   headers['x-csrf-token']=(await csrf.json()).csrfToken
   headers['content-type']='application/json'
  }
  const response=await fetch(h.origin+path,{method:method??(body===undefined?'GET':'POST'),redirect:'manual',headers,...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json().catch(()=>null)
  assert.ok((Array.isArray(status)?status:[status]).includes(response.status),`${path}: ${response.status} ${value?.error?.code??''}`)
  return value
 }
}

async function confirm(h,token){
 return fetch(h.origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({token})})
}

async function operatorMeasurement(h){
 const response=await fetch(h.origin+'/api/v1/settings',{headers:{cookie:h.cookie}})
  assert.equal(response.status,200)
 const value=await response.json(),measurement=value.data.limits.find(item=>item.name==='operators')
 assert.equal(typeof measurement?.current,'number');return measurement.current
}

async function createRecord(h,base,label){
 const schema=(await h.request(entityRoute(base))).data
 const created=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:base.appId,entityId:'00000000000000000000000001',recordId:base.entityId},version:schema.version}],input:{appId:base.appId,entityId:base.entityId,values:{[base.nameId]:label}}}})).data
 assert.equal(created.state,'committed')
 return {...base,schemaVersion:schema.version,record:created.value,recordName:label}
}

export async function guestAccessJourney(h){
 const requestAs=sessionRequests(h),id=createUlid().toLowerCase(),searchToken=synthetic(id)
 const other={appId:createUlid(),entityId:createUlid(),nameId:createUlid(),name:synthetic('other-'+id)}
 const draft={appId:other.appId,name:other.name,tables:[{id:other.entityId,label:synthetic('table-'+id),primaryFieldId:other.nameId,fields:[{id:other.nameId,label:synthetic('field-'+id),type:'text',required:true,unique:false}]}]}
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 const adopted=(await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})).data
 assert.equal(adopted.state,'committed')
 const sharedDraft=(await h.request(`/api/v1/records/bases/${h.appId}`)).data
 const shared=await createRecord(h,{appId:h.appId,entityId:h.entityId,nameId:h.nameId,name:sharedDraft.name},searchToken+'-shared')
 const unrelated=await createRecord(h,other,searchToken+'-other')
 const measuredBefore=await operatorMeasurement(h),mailBefore=(await h.mailMessages()).length
 const inviteBody={commandId:createUlid(),expected:[],input:{appId:shared.appId,name:synthetic('guest-'+id),email:emailFor(id)}}
 const invited=(await h.request('/api/v1/guests/invite',{method:'POST',body:inviteBody})).data
 assert.equal(invited.state,'committed');assert.equal(invited.value.appId,shared.appId);assert.equal(invited.value.licenseCount,0)
 const delivered=(await h.mailMessages()).slice(mailBefore)
 assert.equal(delivered.length,1)
 assert.deepEqual(delivered[0].personalizations.flatMap(group=>group.to.map(recipient=>recipient.email)),[inviteBody.input.email])
 const plain=delivered[0].content.find(part=>part.type==='text/plain')?.value
 assert.ok(plain)
 const link=new URL(plain.match(/https?:\/\/[^\s]+/)[0]),confirmationToken=link.searchParams.get('token')
 assert.ok(confirmationToken)
 const replay=(await h.request('/api/v1/guests/invite',{method:'POST',body:inviteBody})).data
 assert.equal(replay.state,'committed');assert.equal(replay.value.id,invited.value.id)
 assert.equal((await h.mailMessages()).length,mailBefore+1)
 const confirmed=await confirm(h,confirmationToken)
 assert.equal(confirmed.status,303)
 const cookie=confirmed.headers.get('set-cookie')?.split(';')[0]
 assert.ok(cookie);await confirmed.arrayBuffer()
 const app=await fetch(h.origin+'/app',{headers:{cookie},redirect:'manual'})
 assert.equal(app.status,303);assert.equal(new URL(app.headers.get('location'),h.origin).pathname,`/app/records/${shared.appId}`);await app.arrayBuffer()
 const bases=(await requestAs(cookie,'/api/v1/apps')).data.items
 assert.ok(bases.some(base=>base.id===shared.appId))
 assert.ok(!bases.some(base=>base.id===unrelated.appId))
 assert.ok(bases.every(base=>base.id===shared.appId))
 const records=(await requestAs(cookie,entityRoute(shared)+'/query',{body:{limit:20}})).data.items
 assert.ok(records.some(record=>record.id===shared.record.id))
 const own=(await requestAs(cookie,recordRoute(shared))).data.record
 assert.equal(own.fields[shared.nameId].value,shared.recordName)
 const search=(await requestAs(cookie,'/api/search?q='+encodeURIComponent(searchToken))).items
 assert.ok(search.some(hit=>hit.id===shared.record.id&&hit.appId===shared.appId))
 assert.ok(!search.some(hit=>hit.appId===unrelated.appId||hit.id===unrelated.record.id))
 for(const path of [entityRoute(unrelated),recordRoute(unrelated),`/api/v1/records/bases/${unrelated.appId}`])await requestAs(cookie,path,{status:[403,404]})
 await requestAs(cookie,entityRoute(unrelated)+'/query',{body:{limit:20},status:[403,404]})
 const ownerList=(await h.request('/api/v1/guests')).data,guest=ownerList.items.find(person=>person.id===invited.value.id)
 assert.ok(guest);assert.equal(guest.state,'active');assert.equal(guest.email,inviteBody.input.email)
 assert.equal(guest.appId,shared.appId);assert.equal(guest.licenseCount,0);assert.equal(ownerList.licenseCount,0)
 assert.equal(await operatorMeasurement(h),measuredBefore)
 const policy=await h.db.prepare('SELECT policy_id FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(guest.id,shared.appId).first()
 assert.ok(policy)
 const blockedEmail=emailFor('blocked-'+id),beforeBlocked=(await h.mailMessages()).length
 await requestAs(cookie,'/auth/invite',{body:{email:blockedEmail,displayName:synthetic('blocked-'+id),role:'member'},status:[403,404]})
 await requestAs(cookie,'/api/v1/commands/member.invite',{body:{commandId:createUlid(),expected:[],input:{email:blockedEmail,name:synthetic('blocked-'+id),scopes:[{appId:shared.appId,policyId:policy.policy_id,legacy:false}]}},status:[403,404]})
 await requestAs(cookie,'/api/v1/guests/invite',{body:{commandId:createUlid(),expected:[],input:{appId:shared.appId,name:synthetic('blocked-'+id),email:blockedEmail}},status:[403,404]})
 await requestAs(cookie,'/api/v1/commands/record.create',{body:{commandId:createUlid(),expected:[{ref:{appId:shared.appId,entityId:'00000000000000000000000001',recordId:shared.entityId},version:shared.schemaVersion}],input:{appId:shared.appId,entityId:shared.entityId,values:{[shared.nameId]:synthetic('blocked-record-'+id)}}},status:[403,404]})
 await requestAs(cookie,'/api/v1/commands/record.patch',{body:{commandId:createUlid(),expected:[{ref:shared.record.ref,version:shared.record.version}],input:{ref:shared.record.ref,changes:{[shared.nameId]:synthetic('blocked-patch-'+id)}}},status:[403,404]})
 assert.equal((await h.request(recordRoute(shared))).data.record.fields[shared.nameId].value,shared.recordName)
 assert.equal((await h.mailMessages()).length,beforeBlocked)
 return {cookie,guest,shared,other:unrelated,inviteBody,confirmationToken,requestAs}
}

export async function finishGuestAccess(h,world){
 const {cookie,guest,shared,inviteBody,confirmationToken,requestAs}=world
 const current=async()=>{
  const person=(await h.request('/api/v1/guests')).data.items.find(item=>item.id===guest.id)
  assert.ok(person);return person
 }
 const command=async(action,person)=>{
  const result=(await h.request('/api/v1/commands/'+action,{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:shared.appId,entityId:AUTHORITY_ENTITY_IDS.member,recordId:guest.id},version:person.version}],input:{memberId:guest.id,reason:synthetic('guest-finish')}}})).data
  assert.equal(result.state,'committed');return result
 }
 await command('member.remove',await current())
 assert.equal((await current()).state,'removed')
 for(const path of [recordRoute(shared),entityRoute(shared),'/api/v1/apps','/api/search?q='+encodeURIComponent(shared.recordName)])await requestAs(cookie,path,{status:[401,403,404]})
 const rejectToken=async()=>{
  const response=await confirm(h,confirmationToken)
  assert.ok([400,401,403,404,409,410].includes(response.status));assert.equal(response.headers.get('set-cookie'),null)
  await response.arrayBuffer()
 }
 await rejectToken()
 const mailBefore=(await h.mailMessages()).length
 const replay=(await h.request('/api/v1/guests/invite',{method:'POST',body:inviteBody})).data
 assert.equal(replay.state,'committed');assert.equal(replay.value.id,guest.id)
 assert.equal((await current()).state,'removed')
 assert.equal((await h.mailMessages()).length,mailBefore)
 const erased=await command('member.erase',await current())
 assert.equal(erased.value.confirmed,true)
 assert.ok(!(await h.request('/api/v1/guests')).data.items.some(person=>person.id===guest.id))
 await rejectToken()
 const afterErase=(await h.request('/api/v1/guests/invite',{method:'POST',body:inviteBody})).data
 assert.equal(afterErase.state,'committed');assert.equal(afterErase.value.id,guest.id)
 assert.ok(!(await h.request('/api/v1/guests')).data.items.some(person=>person.id===guest.id))
 assert.equal((await h.mailMessages()).length,mailBefore)
 await requestAs(cookie,recordRoute(shared),{status:[401,403,404]})
}
