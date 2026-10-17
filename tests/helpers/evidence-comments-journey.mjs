import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {channelLegacyPolicyRules} from '../../src/domains/channels/setup.server.ts'
import {LAUNCH_APP_ID} from '../../src/apps/launch/contracts.ts'
import {completeFirstRun} from './complete-first-run.mjs'

/** Native sessions and public comment/read doors; only the paid mail edge is fake. */
export async function evidenceCommentsJourney(h){
 const email='comment-reader@example.test',name='Comment reader'
 await h.request('/auth/invite',{method:'POST',status:202,body:{email,displayName:name,role:'member'}})
 const messages=await h.mailMessages(),invite=messages.findLast(message=>message.personalizations?.some(group=>group.to?.some(to=>to.email===email)))
 assert.ok(invite)
 const text=invite.content.find(part=>part.type==='text/plain').value,href=text.match(/https?:\/\/[^\s<>"']+/g).find(value=>new URL(value).pathname==='/auth/confirm')
 const confirmation=await fetch(h.origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({token:new URL(href).searchParams.get('token')})})
 assert.equal(confirmation.status,303)
 const cookie=confirmation.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
 await completeFirstRun(h.origin,cookie)
 const csrf=(await (await fetch(h.origin+'/auth/csrf',{headers:{cookie}})).json()).csrfToken
 const operator=(await h.db.prepare('SELECT id FROM operators WHERE email=?').bind(email).first()).id
 const ownerPolicy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(h.operator,h.appId).first(),original=JSON.parse(ownerPolicy.rules_json)
 const recipientPolicy=createUlid(),now=Date.now(),rules=original.map(rule=>({...rule,id:createUlid(),principals:[{id:operator,kind:'human'}]}))
 for(const [appId,id,assigned]of [[h.appId,recipientPolicy,rules],[LAUNCH_APP_ID,createUlid(),channelLegacyPolicyRules(operator)]]){
  await h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(id,appId,'Comment acceptance',JSON.stringify(assigned),now,now).run()
  await h.db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,state,legacy,version) VALUES(?,?,?,'active',0,1)").bind(operator,appId,id).run()
 }
 async function recipient(route,{method='GET',body,status=200}={}){
  const response=await fetch(h.origin+route,{method,headers:{cookie,...(body?{origin:h.origin,'content-type':'application/json','x-csrf-token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})}),value=await response.json()
  assert.equal(response.status,status,`${method} ${route.split('?')[0]}: ${value.error?.code??''}`);return value
 }
 const record=(await h.create('Shared comment record')).record,subject=record.ref,query=new URLSearchParams(subject),expected=[{ref:subject,version:record.version}],command=(input,id=createUlid())=>({commandId:id,expected,input})
 const candidates=(await h.request('/api/v1/comments/mentions?'+query)).data.items
 assert.ok(candidates.some(person=>person.id===operator&&person.name===name))
 await h.db.prepare("UPDATE workspace_settings SET quiet_hours_start='00:00',quiet_hours_end='00:00',version=version+1").run()
 const input=command({subject,body:'Searchable initial comment',mentions:[operator]}),added=(await h.request('/api/v1/commands/comment.add',{method:'POST',body:input})).data.value
 assert.equal((await h.request('/api/v1/commands/comment.add',{method:'POST',body:input})).data.value.id,added.id)
 const wake=async()=>{const worker=await h.runtime.getWorker();await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.channels.wake.v1'}}])}
 await wake()
 const notices=(await recipient('/api/v1/notifications')).data.items.filter(item=>item.kind==='comment-mentioned')
 assert.equal(notices.length,1);assert.equal(notices[0].subject.href,`/app/records/${subject.appId}/${subject.entityId}/${subject.recordId}`)
 const mailed=(await h.mailMessages()).filter(message=>message.subject==='You were mentioned in a comment'&&message.personalizations.some(group=>group.to.some(to=>to.email===email)))
 assert.equal(mailed.length,1)
 const own=(await h.request('/api/v1/comments?'+query)).data.items.find(item=>item.id===added.id)
 assert.equal(own.authorLabel,'Import owner');assert.equal(own.canEdit,true);assert.equal(own.mentionLabels[0].name,name)
 const edited=(await h.request('/api/v1/commands/comment.edit',{method:'POST',body:command({subject,id:added.id,version:added.version,body:'Searchable edited comment',mentions:[operator]})})).data.value
 assert.equal(edited.version,2)
 await recipient('/api/v1/commands/comment.edit',{method:'POST',status:403,body:command({subject,id:added.id,version:edited.version,body:'Foreign edit',mentions:[]})})
 await recipient('/api/v1/commands/comment.delete',{method:'POST',status:403,body:command({subject,id:added.id,version:edited.version})})
 const search='/api/v1/comments?'+new URLSearchParams({...subject,q:'edited comment'})
 assert.equal((await recipient(search)).data.items[0].edited,true)
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'Comment REST reader',permissions:'read',expiresAt:new Date(Date.now()+3600000).toISOString()}})).data.key
 assert.equal((await h.request(search,{secret:key.secret})).data.items[0].id,added.id)
 // Hold the next record's notice until after its recipient loses read authority.
 const start=new Date(Date.now()-3600000).toISOString().slice(11,16),end=new Date(Date.now()+3600000).toISOString().slice(11,16)
 await h.db.prepare('UPDATE workspace_settings SET quiet_hours_start=?,quiet_hours_end=?,version=version+1').bind(start,end).run()
 const hidden=(await h.create('Private after mention')).record,hiddenCommand={commandId:createUlid(),expected:[{ref:hidden.ref,version:hidden.version}],input:{subject:hidden.ref,body:'Undelivered private comment',mentions:[operator]}}
 await h.request('/api/v1/commands/comment.add',{method:'POST',body:hiddenCommand})
 const limited=rules.map(rule=>rule.entityId===h.entityId?{...rule,rows:{kind:'condition',fieldId:h.nameId,op:'eq',value:'No matching record'}}:rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(limited),recipientPolicy).run()
 await recipient(search,{status:403})
 const gone=(await h.request('/api/v1/comments/mentions?'+query)).data.items
 assert.ok(!gone.some(person=>person.id===operator))
 await h.request('/api/v1/commands/comment.add',{method:'POST',status:403,body:command({subject,body:'Forbidden recipient',mentions:[operator]})})
 const unavailable=(await recipient('/api/v1/notifications')).data.items.filter(item=>item.kind==='comment-mentioned')
 assert.ok(unavailable.every(item=>!item.subject.available&&item.subject.id===null))
 await h.db.prepare("UPDATE channel_deliveries SET state='queued',due_at=? WHERE operator_id=? AND state='held'").bind(Date.now(),operator).run()
 await wake()
 assert.equal((await h.mailMessages()).filter(message=>message.subject==='You were mentioned in a comment'&&message.personalizations.some(group=>group.to.some(to=>to.email===email)))).length,1)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),recipientPolicy).run()
 // Own deletion is versioned, searchable content disappears, and the thread retains its tombstone.
 await h.request('/api/v1/commands/comment.delete',{method:'POST',body:command({subject,id:added.id,version:edited.version})})
 assert.equal((await h.request(search)).data.items.length,0)
 assert.ok((await h.request('/api/v1/comments?'+query)).data.items.find(item=>item.id===added.id).deletedAt)
}
