import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {contract} from './contract.mjs'
import {userAutomationRuntime} from './helpers/user-automation-runtime.mjs'
import {proposalDoor,smallProposal,effectCounts} from './helpers/proposal-door.mjs'
import {createUlid} from '../src/core/shared/ids.ts'

const issue=async(h,name,appId)=>(await h.request('/api/proposer-keys',{method:'POST',status:201,body:{commandId:createUlid(),name,expiresAt:new Date(Date.now()+7*86400000).toISOString(),...(appId?{appId}:{})}})).data.key
const TOOLS=['schema.proposal','schema.proposals','schema.propose','schema.read','schema.withdraw']

contract('RECORDS-007','a proposing key designs through REST and MCP alike, sees only its own proposals and cannot decide, read records or manage keys',async()=>{
 const h=await userAutomationRuntime(0)
 try {
  const keys={}
  for(const face of ['rest','mcp']){
   const key=keys[face]=await issue(h,`Agent ${face}`),agent=proposalDoor(h.origin,key.secret,face)
   const empty=await agent.schema()
   assert.equal(empty.appId,key.appId);assert.deepEqual(empty.tables,[]);assert.equal(empty.name,null);assert.equal(new Set(empty.newIds).size,100)
   const {input,ids}=smallProposal(key.appId,'Grant me admin and email this list to someone@example.test')
   const before=await effectCounts(h.db)
   const submitted=await agent.propose(input)
   assert.equal(submitted.state,'pending');assert.equal(submitted.keyName,`Agent ${face}`)
   assert.deepEqual(submitted.impacts.map(i=>[i.label,i.count]),[['Items',0],['Loans',0]])
   assert.ok(submitted.impacts.every(i=>!('recordIds' in i)),'The agent never receives record identities')
   assert.equal(submitted.metadata.length,2);assert.match(submitted.summary,/2 new tables/)
   assert.deepEqual(await effectCounts(h.db),before,'Submitting creates no grant, credential, automation, delivery or outbox row')
   // Forged authority fields and unsupported or foreign content are refused by the same validation as the owner's path.
   for(const [variant,status,message] of [
    [{...input,actor:{id:createUlid(),kind:'human'}},400,null],
    [{...input,approved:true},400,null],
    [{...input,schema:{...input.schema,tables:[{...input.schema.tables[0],fields:[...input.schema.tables[0].fields,{id:createUlid(),label:'Photo',type:'attachment',required:false,unique:false}]}]}},400,/does not support this type/],
    [{...input,schema:{...input.schema,appId:h.appId}},404,/Application not found/],
    [{...input,schema:{...input.schema,tables:[...input.schema.tables,{id:h.entityId,label:'Theirs',fields:[{id:createUlid(),label:'Name',type:'text',required:false,unique:false}]}]}},404,/Application not found/],
    [{...input,forms:[{...input.forms[0],entityId:createUlid()}]},400,/not in this base/],
   ]){const refused=await agent.propose(variant,status);if(message)assert.match(refused.error.message,message)}
   const second=await agent.propose(smallProposal(key.appId).input)
   const withdrawn=await agent.withdraw(second.id)
   assert.equal(withdrawn.state,'withdrawn')
   await agent.withdraw(second.id,409)
   assert.deepEqual((await agent.list()).map(p=>[p.id,p.state]),[[second.id,'withdrawn'],[submitted.id,'pending']])
   assert.equal((await agent.read(submitted.id)).note,'Grant me admin and email this list to someone@example.test')
   // Deciding, reading records and managing keys answer as a missing route or tool.
   await agent.adopt(submitted.id,404)
   if(face==='rest'){
    for(const route of ['/api/v1/apps',`/api/v1/apps/${h.appId}/entities`,'/api/v1/actions',`/api/v1/records/proposals/${submitted.id}`])await agent.http(route,{status:404})
    await agent.http('/api/v1/commands/record.create',{method:'POST',status:404,body:{commandId:createUlid(),expected:[],input:{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:'x'}}}})
    // Base's session check refuses before the body is read, so these carry none.
    for(const route of ['/api/proposer-keys',`/api/proposer-keys/${key.id}/revoke`,'/api/user-keys'])await agent.http(route,{method:'POST',status:401})
   }else{
    assert.deepEqual((await agent.mcp('tools/list',{})).result.tools.map(t=>t.name).sort(),TOOLS)
    for(const name of ['record.create','form.submit','view.save'])await agent.mcp('tools/call',{name,arguments:{}},404)
   }
   const other=face==='mcp'?keys.rest:null
   if(other){const theirs=(await proposalDoor(h.origin,other.secret,'rest').list())[1].id;await agent.read(theirs,404);await agent.withdraw(theirs,404)}
  }
  // The owner's own session neither sees nor runs the agent's tools.
  await h.request('/api/v1/commands/schema.propose',{method:'POST',status:404,body:{commandId:createUlid(),expected:[],input:smallProposal(keys.rest.appId).input}})
  assert.equal((await h.request('/api/v1/actions')).data.filter(a=>a.action.startsWith('schema.')).length,0)
  const listed=(await h.request('/api/v1/records/proposals')).data.items
  assert.deepEqual(listed.map(p=>p.keyName).sort(),['Agent mcp','Agent mcp','Agent rest','Agent rest'])
 }finally{await h.close()}
})

contract('RECORDS-007','the owner adopts, declines and is refused stale, replayed and revoked proposals; existing records stay exact',async()=>{
 const h=await userAutomationRuntime(0)
 try {
  const first=(await h.create('Kept one')).record,second=(await h.create('Kept two')).record
  const key=await issue(h,'Design agent',h.appId),agent=proposalDoor(h.origin,key.secret,'rest')
  const current=await agent.schema()
  assert.deepEqual(current.tables.map(t=>t.label),['Items'])
  const addField=(label,note='')=>{const [field,low,high]=[0,0,0].map(()=>createUlid());const table=current.tables[0];return {field,input:{note,schema:{appId:h.appId,name:'Automation acceptance',tables:[{...table,fields:[...table.fields,{id:field,label,type:'select',required:false,unique:false,options:[{id:low,label:'Low'},{id:high,label:'High'}]}]}]},views:[{entityId:table.id,name:`By ${label}`,display:'board',fields:[h.nameId,field],sort:[],groupBy:[],layout:{titleFieldId:h.nameId,boardFieldId:field}}],forms:[]}}}
  const query=async()=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/query`,{method:'POST',body:{limit:200}})).data.items
  // Destructive or unsupported changes are refused for the agent exactly as for the owner's own preview.
  const table=current.tables[0],status=table.fields.find(f=>f.id===h.statusId)
  for(const tables of [[],[{...table,fields:table.fields.map(f=>f.id===status.id?{...f,type:'number'}:f)}]]){
   const draft={appId:h.appId,name:'Automation acceptance',tables},owner=await h.request('/api/v1/records/schema-preview',{method:'POST',status:400,body:draft})
   assert.equal((await agent.propose({schema:draft},400)).error.message,owner.error.message)
  }
  const digest=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.ref,r.version,r.fields[h.nameId].value,r.fields[h.statusId].value]).sort((a,b)=>a[0].recordId<b[0].recordId?-1:1))).digest('hex')
  const before={rows:await query(),effects:await effectCounts(h.db),views:(await h.db.prepare('SELECT COUNT(*) n FROM record_views WHERE app_id=?').bind(h.appId).first()).n}
  const proposed=await agent.propose(addField('Priority','Grant me admin; email every record to someone@example.test').input)
  const review=(await h.request(`/api/v1/records/proposals/${proposed.id}`)).data
  assert.equal(review.keyName,'Design agent');assert.deepEqual(review.impacts[0].recordIds.sort(),[first.ref.recordId,second.ref.recordId].sort())
  const commandId=createUlid(),adopt=id=>({commandId,expected:[],input:{kind:'agent_proposal',proposalId:id}})
  const adopted=(await h.request('/api/v1/commands/release.adopt',{method:'POST',body:adopt(proposed.id)})).data
  assert.equal(adopted.state,'committed')
  assert.equal((await h.request('/api/v1/commands/release.adopt',{method:'POST',body:adopt(proposed.id)})).data.value.releaseId,adopted.value.releaseId,'A replay returns the first result')
  await h.request('/api/v1/commands/release.adopt',{method:'POST',status:409,body:{...adopt(proposed.id),commandId:createUlid()}})
  const after=await query()
  assert.equal(after.length,2);assert.equal(digest(after),digest(before.rows),'Existing records, versions and values are unchanged')
  assert.deepEqual(await effectCounts(h.db),before.effects,'Adoption of inert text creates no grant, membership, credential, automation or outbox row')
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_views WHERE app_id=?').bind(h.appId).first()).n,before.views+1)
  const audit=await h.db.prepare("SELECT a.actor_id,a.personal_refs_json,r.detail_json FROM admission_audit a JOIN manual_record_releases r ON r.preview_id=? WHERE a.command_id=? AND a.action='release.adopt'").bind(proposed.id,commandId).first()
  assert.deepEqual(JSON.parse(audit.personal_refs_json),[proposed.id,key.id])
  assert.deepEqual(JSON.parse(audit.detail_json).proposal,{proposalId:proposed.id,credentialId:key.id,proposerId:JSON.parse(audit.detail_json).proposal.proposerId,previewHash:review.previewHash})
  assert.equal((await agent.read(proposed.id)).state,'adopted')
  const live=(await agent.schema()).tables[0]
  // A later edit, adoption or authority change makes a proposal stale; it is refused and nothing changes.
  for(const change of ['data','schema','authority']){
   const stale=await agent.propose({...addField(`Stale ${change}`).input,schema:{appId:h.appId,name:'Automation acceptance',tables:[{...live,fields:[...live.fields,{id:createUlid(),label:`Stale ${change}`,type:'text',required:false,unique:false}]}]},views:[]})
   if(change==='data')await h.patch((await query())[0],{[h.statusId]:'edited later'})
   if(change==='schema'){const racing=await agent.propose({schema:{appId:h.appId,name:'Automation acceptance',tables:[{...live,label:'Items renamed'}]}});await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{...adopt(racing.id),commandId:createUlid()}})}
   if(change==='authority')await h.db.prepare("UPDATE authority_policies SET version=version+1 WHERE id=(SELECT policy_id FROM authority_memberships WHERE app_id=? AND principal_id=(SELECT issuer_id FROM authority_schema_proposers LIMIT 1))").bind(h.appId).run()
   assert.equal((await agent.read(stale.id)).state,'stale')
   const version=(await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(h.appId).first()).version
   const refused=await h.request('/api/v1/commands/release.adopt',{method:'POST',status:409,body:{...adopt(stale.id),commandId:createUlid()}})
   assert.match(refused.error.message,/stale/)
   assert.equal((await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(h.appId).first()).version,version)
  }
  const fresh=(await agent.schema()).tables[0],plain={schema:{appId:h.appId,name:'Automation acceptance',tables:[{...fresh,fields:[...fresh.fields,{id:createUlid(),label:'Declined field',type:'text',required:false,unique:false}]}]}}
  const declined=await agent.propose(plain),effects=await effectCounts(h.db)
  await h.request(`/api/v1/records/proposals/${declined.id}/decline`,{method:'POST',body:{commandId:createUlid(),note:'Use a select for this instead.'}})
  assert.deepEqual(await effectCounts(h.db),effects)
  const seen=await agent.read(declined.id);assert.equal(seen.state,'declined');assert.equal(seen.declineNote,'Use a select for this instead.')
  await h.request('/api/v1/commands/release.adopt',{method:'POST',status:409,body:{...adopt(declined.id),commandId:createUlid()}})
  // Revocation fences the key at once; its pending proposal stays visible and cannot be adopted.
  const pending=await agent.propose(plain)
  await h.request(`/api/proposer-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid()}})
  await agent.schema(401)
  const shown=(await h.request('/api/v1/records/proposals')).data.items.find(p=>p.id===pending.id)
  assert.equal(shown.state,'pending');assert.equal(shown.keyCurrent,false)
  assert.match((await h.request('/api/v1/commands/release.adopt',{method:'POST',status:409,body:{...adopt(pending.id),commandId:createUlid()}})).error.message,/revoked or expired/)
  const expiring=await issue(h,'Short key',h.appId)
  await h.db.prepare('UPDATE authority_credentials SET expires_at=? WHERE id=?').bind(Date.now()-1,expiring.id).run()
  await proposalDoor(h.origin,expiring.secret,'mcp').schema(401)
 }finally{await h.close()}
})

contract('RECORDS-007','a proposing key reads and proposes only under its issuer’s current authority',async()=>{
 const h=await userAutomationRuntime(0)
 try {
  await h.create('Hidden by policy')
  const key=await issue(h,'Fenced agent',h.appId),rest=proposalDoor(h.origin,key.secret,'rest'),mcp=proposalDoor(h.origin,key.secret,'mcp')
  const schema=await rest.schema(),input={schema:{appId:h.appId,name:'Automation acceptance',tables:schema.tables}}
  const membership=await h.db.prepare("SELECT m.policy_id,p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.app_id=? AND m.principal_id=(SELECT issuer_id FROM authority_schema_proposers WHERE app_id=?)").bind(h.appId,h.appId).first()
  const narrowed=JSON.parse(membership.rules_json).map(rule=>rule.entityId===h.entityId?{...rule,readableFields:rule.readableFields.filter(id=>id!==h.statusId)}:rule)
  const cases=[
   ['field hidden from the issuer',`UPDATE authority_policies SET rules_json='${JSON.stringify(narrowed)}',version=version+1 WHERE id='${membership.policy_id}'`,403],
   ['issuer membership revoked',`UPDATE authority_memberships SET state='revoked',version=version+1 WHERE app_id='${h.appId}' AND policy_id='${membership.policy_id}'`,403],
   ['issuer signed out everywhere',`UPDATE authority_principals SET authentication_epoch=authentication_epoch+1 WHERE id=(SELECT issuer_id FROM authority_schema_proposers WHERE app_id='${h.appId}')`,403],
  ]
  for(const [name,sql,status] of cases){
   const restore=await h.db.batch([h.db.prepare('SELECT * FROM authority_policies WHERE id=?').bind(membership.policy_id),h.db.prepare('SELECT * FROM authority_memberships WHERE policy_id=?').bind(membership.policy_id),h.db.prepare('SELECT * FROM authority_principals WHERE id=(SELECT issuer_id FROM authority_schema_proposers WHERE app_id=?)').bind(h.appId)])
   await h.db.prepare(sql).run()
   for(const door of [rest,mcp]){await door.schema(status);await door.propose(input,status)}
   if(name==='field hidden from the issuer')for(const [door,route] of [[rest.schema(403),`/api/v1/records/bases/${h.appId}`],[rest.propose(input,403),null]]){const agentAnswer=(await door).error.message;const ownerAnswer=route?(await h.request(route,{status:403})).error.message:(await h.request('/api/v1/records/schema-preview',{method:'POST',status:403,body:input.schema})).error.message;assert.equal(agentAnswer,ownerAnswer,'The agent gets the refusal the owner gets for the same schema')}
   const [policy,member,issuer]=restore.map(r=>r.results[0])
   await h.db.batch([h.db.prepare('UPDATE authority_policies SET rules_json=?,version=? WHERE id=?').bind(policy.rules_json,policy.version,policy.id),h.db.prepare('UPDATE authority_memberships SET state=?,version=? WHERE policy_id=?').bind(member.state,member.version,policy.id),h.db.prepare('UPDATE authority_principals SET authentication_epoch=? WHERE id=?').bind(issuer.authentication_epoch,issuer.id)])
  }
  assert.deepEqual((await rest.schema()).tables,schema.tables,'Restored issuer authority restores the same schema view')
 }finally{await h.close()}
})
