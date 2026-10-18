import assert from 'node:assert/strict'
import { mutationSnapshot } from './launch-write-context.mjs'

export async function verifyCommentClauses(h) {
 const campaign=await h.campaign('COMMENT-CLAUSES')
 const current=await h.addPerson({name:'Current reviewer'}),removed=await h.addPerson({name:'Former reviewer'}),erased=await h.addPerson({name:'Erased reviewer'})
 // Actual removal/erasure public doors are independently covered by operator journeys;
 // these fixture identities model their resulting inactive/erased state.
 await h.db.prepare('UPDATE operators SET active=0 WHERE id=?').bind(removed.id).run()
 await h.db.prepare("UPDATE operators SET active=0,name='Erased operator' WHERE id=?").bind(erased.id).run()
 const request=async(action,input,revisions=h.expected('campaign',campaign),session=h.ownerSession)=>h.request(session,`/api/v1/commands/launch.${action}`,{method:'POST',body:JSON.stringify({commandId:h.r.createUlid(),input,expected:revisions})})
 const snapshot=async()=>mutationSnapshot(h.db,{omitSessionReadTimestamp:true})
 const before=await snapshot()
 const body='Plain text <b>current</b> @Current reviewer @Former reviewer @Erased reviewer'
 const response=await request('comment.create',{campaignId:campaign.id,body,mentions:[current.id,removed.id,erased.id]})
 assert.equal(response.status,200,await response.clone().text())
 const comment=(await response.json()).data.value
 const after=await snapshot()
 const allowed=new Set(['comments','notifications','channel_events','channel_notifications','channel_deliveries','activity_entries','command_admissions','admission_audit','runtime_queue_publications'])
 for(const table of Object.keys(before))if(!allowed.has(table))assert.deepEqual(after[table],before[table],`ACT-002/004 comment leaves ${table} unchanged`)
 const notices=(await h.db.prepare("SELECT operator_id FROM notifications WHERE subject_id=? AND kind='comment-mentioned'").bind(comment.id).all()).results
 assert.deepEqual(notices.map(row=>row.operator_id),[current.id],'ACT-004 only the current mentioned operator receives a notice')
 let detail=await (await h.request(h.ownerSession,`/api/campaigns/${campaign.id}`)).json()
 assert.equal(detail.comments.find(row=>row.id===comment.id).body,body)
 assert.ok(detail.activity.some(row=>row.subjectId===comment.id&&row.type==='comment.created'))
 const settled=await snapshot()
 for(const [input,expected] of [[{id:comment.id,version:comment.version+1},h.expected('campaign',campaign)],[{id:comment.id,version:comment.version},[{...h.expected('campaign',campaign)[0],version:campaign.version+1}]]]){
  const stale=await request('comment.delete',input,expected)
  assert.equal(stale.status,409,await stale.clone().text())
  assert.match((await stale.json()).error.message,/current version 1/)
  assert.deepEqual(await snapshot(),settled,'ACT-002 stale deletion has no effects')
 }
 const denied=await h.addPerson({change:rules=>rules.map(rule=>rule.entityId===h.r.launchEntities.campaign?{...rule,writableFields:[]}:rule)})
 const deniedBefore=await snapshot(),denial=await request('comment.delete',{id:comment.id,version:comment.version},h.expected('campaign',campaign),denied.session)
 assert.equal(denial.status,403,await denial.clone().text())
 assert.deepEqual(await snapshot(),deniedBefore)
 const beforeDelete=await snapshot(),deleted=await request('comment.delete',{id:comment.id,version:comment.version},h.expected('campaign',campaign),current.session)
 assert.equal(deleted.status,200,await deleted.clone().text())
 const afterDelete=await snapshot(),deleteAllowed=new Set(['comments','activity_entries','command_admissions','admission_audit','runtime_queue_publications'])
 for(const table of Object.keys(beforeDelete))if(!deleteAllowed.has(table))assert.deepEqual(afterDelete[table],beforeDelete[table],`ACT-002 deletion leaves ${table} unchanged`)
 detail=await (await h.request(h.ownerSession,`/api/campaigns/${campaign.id}`)).json()
 assert.equal(detail.comments.some(row=>row.id===comment.id),false)
 assert.ok(detail.activity.some(row=>row.subjectId===comment.id&&row.type==='comment.deleted'&&row.actor.id===current.id))
 const stored=await h.db.prepare('SELECT body,version,deleted_at FROM comments WHERE id=?').bind(comment.id).first()
 assert.equal(stored.body,'');assert.equal(stored.version,2);assert.ok(stored.deleted_at)
 const staleBefore=await snapshot(),staleDeleted=await request('comment.delete',{id:comment.id,version:comment.version})
 assert.equal(staleDeleted.status,409);assert.match((await staleDeleted.json()).error.message,/current version 2/)
 assert.deepEqual(await snapshot(),staleBefore)
 const racingResponse=await request('comment.create',{campaignId:campaign.id,body:'Concurrent removal',mentions:[]})
 assert.equal(racingResponse.status,200);const racing=(await racingResponse.json()).data.value
 const pending=await h.prepare('comment.delete',{id:racing.id,version:racing.version},h.expected('campaign',campaign))
 assert.equal((await request('comment.delete',{id:racing.id,version:racing.version})).status,200)
 const raceBefore=await snapshot()
 await assert.rejects(h.admission.commit(h.ctx,pending),error=>error.code==='version_conflict'&&error.currentVersion===2&&error.message.includes('current version 2'))
 assert.deepEqual(await snapshot(),raceBefore)
}
