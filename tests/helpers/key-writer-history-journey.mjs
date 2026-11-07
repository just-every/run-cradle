import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

/** Real REST writes, then native human history reads; never seed audit rows. */
export async function keyWriterHistoryJourney(h,{appId,entityId,nameId,flagId,hiddenId,key,call}){
 const actor={id:key.principalId,kind:'connector'}
 assert.ok(actor.id&&actor.id!==h.operator&&actor.id!==key.id,'Issuance identifies an independent delegated principal')
 const principal=await h.db.prepare('SELECT c.principal_id,p.kind,p.human_id FROM authority_credentials c JOIN authority_principals p ON p.id=c.principal_id WHERE c.id=?').bind(key.id).first()
 assert.deepEqual(principal,{principal_id:actor.id,kind:'connector',human_id:null})
 const initial={ [nameId]:'synthetic-cradle-220 history', [flagId]:false, [hiddenId]:'synthetic-cradle-221 initial note' }
 const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data
 const created=await call('create',{body:{commandId:createUlid(),schemaVersion:schema.version,values:initial}})
 let record=created.result.value.rows[0]
 const ref={appId,entityId,recordId:record.id},history=async()=>(await h.request('/api/v1/history?'+new URLSearchParams(ref))).data
 const read=async()=>(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/records/${record.id}`)).data.record
 const baseline=await history(),writes=[]
 const transitions=[
  {before:{[flagId]:false,[hiddenId]:initial[hiddenId]},after:{[flagId]:true,[hiddenId]:'synthetic-cradle-222 reviewed note'}},
  {before:{[flagId]:true,[hiddenId]:'synthetic-cradle-222 reviewed note'},after:{[flagId]:false,[hiddenId]:'synthetic-cradle-223 final note'}},
 ]
 const ordered=changes=>[...changes].sort((a,b)=>a.fieldId.localeCompare(b.fieldId))
 for(const transition of transitions){
  const body={commandId:createUlid(),version:record.version,changes:transition.after},started=Date.now()
  const result=await call('update',{id:record.id,body}),finished=Date.now()
  assert.equal(result.result.state,'committed');record=result.result.value.rows[0]
  const current=await read()
  for(const [fieldId,value]of Object.entries(transition.after))assert.deepEqual(current.fields[fieldId],{state:'value',value})
  writes.push({...transition,body,started,finished})
 }
 const page=await history(),entries=page.items.filter(entry=>writes.some(write=>write.body.commandId===entry.commandId))
 assert.equal(page.items.length,baseline.items.length+2,'Each real update adds exactly one history entry')
 assert.equal(entries.length,2)
 for(const write of writes){
  const matching=entries.filter(entry=>entry.commandId===write.body.commandId)
  assert.equal(matching.length,1,'History retains the original write command identity exactly once')
  const entry=matching[0]
  assert.deepEqual(entry.actor,actor,'The connector, rather than its issuing human, is the writer')
  assert.equal(entry.action,'record.patch');assert.deepEqual(entry.subject,ref)
  assert.deepEqual(ordered(entry.changes),ordered(Object.keys(write.after).map(fieldId=>({fieldId,before:{state:'value',value:write.before[fieldId]},after:{state:'value',value:write.after[fieldId]}}))))
  const timestamp=Date.parse(entry.createdAt)
  assert.ok(timestamp>=write.started&&timestamp<=write.finished,'History time falls within independently observed request bounds')
 }
 const beforeReplay=await read(),replay=await call('update',{id:record.id,body:writes[0].body})
 assert.equal(replay.result.state,'committed');assert.equal(replay.result.value.rows[0].version,record.version-1)
 assert.deepEqual(await read(),beforeReplay,'An earlier write replay leaves the later record intact')
 assert.deepEqual((await history()).items,page.items,'Replay adds no duplicate history or altered timestamps')
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId,h.operator).first()
 try{
  const rules=JSON.parse(policy.rules_json).map(rule=>rule.entityId===entityId?{...rule,readableFields:rule.readableFields.filter(id=>id!==hiddenId)}:rule)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
  const narrowed=await history(),visible=await read()
  assert.ok(!JSON.stringify(narrowed).includes(hiddenId),'Current field policy removes the restricted change identity')
  for(const value of [initial[hiddenId],...writes.map(write=>write.after[hiddenId])])assert.ok(!JSON.stringify(narrowed).includes(value),'Current field policy removes every restricted historical value')
  assert.ok(!Object.hasOwn(visible.fields,hiddenId)||visible.fields[hiddenId].state==='redacted')
  for(const write of writes){
   const entry=narrowed.items.find(entry=>entry.commandId===write.body.commandId)
   assert.ok(entry,'Permitted changes remain visible under the narrowed policy')
   assert.deepEqual(entry.actor,actor)
   assert.deepEqual(entry.changes,[{fieldId:flagId,before:{state:'value',value:write.before[flagId]},after:{state:'value',value:write.after[flagId]}}])
  }
 }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()}
 await h.request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId}})
 const beforeRefusal=await read(),historyBeforeRefusal=await history()
 await call('update',{id:record.id,status:401,body:{commandId:createUlid(),version:record.version,changes:{[flagId]:true,[hiddenId]:'synthetic-cradle-224 refused note'}}})
 await call('update',{id:record.id,status:401,body:writes[1].body})
 assert.deepEqual(await read(),beforeRefusal,'Revoked writes and replays leave current values and version intact')
 assert.deepEqual((await history()).items,historyBeforeRefusal.items,'Revoked writes and replays add no history')
 console.log('PROBE COLLAB-002 API-key history: bounded issued key, two REST updates, human HTTP read -> exact connector, commands, values and bounded times; replay unchanged; restricted changes hidden; revoked writes refused without history')
}
