import {createUlid} from '../../src/core/shared/ids.ts'
import {AUTHORITY_ENTITY_IDS} from '../../src/domains/authority/contracts.ts'
import assert from 'node:assert/strict'

/** A scripted key issue/replay/revoke sequence appears once per committed action. */
export async function adminAuditJourney(h,{issueCommand,revokeCommand,secret}){
 const endpoint='/api/v1/launch/admin-audit'
 const response=await fetch(h.origin+endpoint,{headers:{cookie:h.cookie}})
 assert.equal(response.status,200,'The installation owner has an admin audit read door')
 assert.match(response.headers.get('cache-control'),/no-store/)
 const all=(await response.json()).data.items
 const expected=[[issueCommand,'credential.issue'],[revokeCommand,'credential.revoke']]
 for(const [id,action] of expected){const rows=all.filter(row=>row.eventId===id&&row.action===action);assert.equal(rows.length,1,`${action} appears once, including after replay`)}
 assert.ok(all.some(row=>row.action==='release.adopt'),'The public schema adoption is in the same owner log')
 const own=all.find(row=>row.eventId===issueCommand)
 assert.ok(own.personId);assert.equal(own.person,'Import owner');assert.equal(own.baseId,h.appId)
 const query=new URLSearchParams({person:own.personId,base:h.appId,from:'2020-01-01T00:00:00.000Z',to:'2099-01-01T00:00:00.000Z'})
 const filtered=(await h.request(endpoint+'?'+query)).data.items
 assert.ok(filtered.length>=2);assert.ok(filtered.every(row=>row.personId===own.personId&&row.baseId===h.appId))
 assert.deepEqual((await h.request(endpoint+'?from=2099-01-01T00%3A00%3A00.000Z')).data.items,[])
 const boundary=new URLSearchParams({from:own.createdAt.slice(0,19)+'Z',to:new Date(Date.parse(own.createdAt)+1000).toISOString().slice(0,19)+'Z'})
 assert.ok((await h.request(endpoint+'?'+boundary)).data.items.some(row=>row.eventId===issueCommand),'Whole-second ISO filters include canonical millisecond timestamps')
 for(const format of ['csv','json']){
  const exported=await fetch(h.origin+endpoint+'?'+query+'&format='+format,{headers:{cookie:h.cookie}})
  assert.equal(exported.status,200);assert.match(exported.headers.get('content-disposition'),/attachment/)
  const text=await exported.text();assert.ok(!text.includes(secret),'Exports never expose the key')
  if(format==='json')assert.deepEqual(JSON.parse(text).data.items,filtered)
  else for(const [id,action] of expected)assert.equal(text.split('\r\n').filter(line=>line.includes(id)&&line.includes(action)).length,1)
 }
 await h.request(endpoint,{secret,status:403})
 await h.request(endpoint+'?format=json',{secret,status:403})
 await h.request(endpoint+'?format=csv',{secret,status:403})
 await h.request(endpoint+'?from=invalid',{status:400})
 const email='synthetic-cradle-19@example.test',name='synthetic-cradle-19'
 await h.request('/auth/invite',{method:'POST',status:202,body:{email,displayName:name,role:'member'}})
 const messages=await h.mailMessages(),invite=messages.findLast(message=>message.personalizations?.some(group=>group.to?.some(to=>to.email===email)))
 assert.ok(invite)
 const href=invite.content.find(part=>part.type==='text/plain').value.match(/https?:\/\/[^\s<>"']+/g).find(value=>new URL(value).pathname==='/auth/confirm')
 const confirmation=await fetch(h.origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({token:new URL(href).searchParams.get('token')})})
 assert.equal(confirmation.status,303)
 const member={cookie:confirmation.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')}
 const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:member.cookie}})).json()).csrfToken
 const home=await fetch(h.origin+'/app',{headers:{cookie:member.cookie}});assert.equal(home.status,200);await home.arrayBuffer()
 const person=(await h.db.prepare('SELECT id FROM operators WHERE email=?').bind(email).first()).id
 await h.request(`/api/v1/records/bases/${h.appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:person,role:'editor',version:0}})
 assert.equal((await fetch(h.origin+endpoint,{headers:{cookie:member.cookie}})).status,403,'A human member cannot read the installation log')
 const command=createUlid(),schema=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
 const created=await fetch(h.origin+'/api/v1/commands/record.create',{method:'POST',headers:{cookie:member.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({commandId:command,expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:schema.version}],input:{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:'synthetic-cradle-20'}}})})
 assert.equal(created.status,200,await created.clone().text())
 assert.equal((await h.request(endpoint)).data.items.find(row=>row.eventId===command).person,name)
 const version=async()=>(await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(person).first()).version
 for(const action of ['remove','erase'])await h.request('/api/v1/commands/member.'+action,{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:AUTHORITY_ENTITY_IDS.member,recordId:person},version:await version()}],input:{memberId:person,reason:'synthetic-cradle-21'}}})
 const erased=(await h.request(endpoint)).data.items.find(row=>row.eventId===command)
 assert.ok(erased,'The event survives actor erasure');assert.equal(erased.personId,null);assert.equal(erased.person,'Erased or unavailable person')
 const after=await fetch(h.origin+endpoint+'?format=json',{headers:{cookie:h.cookie}}),text=await after.text()
 assert.ok(!text.includes(name)&&!text.includes(email)&&!text.includes(person),'Export omits the erased subject identity')
}
