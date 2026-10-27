import assert from 'node:assert/strict'
import { mutationSnapshot } from './launch-write-context.mjs'
import {recordInput,recordThread,commentNotices} from './record-comment-command.mjs'

export async function verifyCommentClauses(h) {
 const campaign=await h.campaign('COMMENT-CLAUSES'),subject=h.expected('campaign',campaign)[0].ref
 const current=await h.addPerson({name:'Current reviewer'}),removed=await h.addPerson({name:'Former reviewer'}),erased=await h.addPerson({name:'Erased reviewer'})
 await h.db.prepare('UPDATE operators SET active=0 WHERE id=?').bind(removed.id).run()
 await h.db.prepare("UPDATE operators SET active=0,name='Erased operator' WHERE id=?").bind(erased.id).run()
 const request=async(action,input,revisions=h.expected('campaign',campaign),session=h.ownerSession)=>h.request(session,`/api/v1/commands/${action}`,{method:'POST',body:JSON.stringify({commandId:h.r.createUlid(),input:recordInput(action,input,revisions),expected:revisions})})
 const snapshot=async()=>mutationSnapshot(h.db,{omitSessionReadTimestamp:true})
 const candidates=await h.request(h.ownerSession,'/api/v1/comments/mentions?'+new URLSearchParams(subject))
 assert.equal(candidates.status,200);const people=(await candidates.json()).data.items
 assert.ok(people.some(person=>person.id===current.id));assert.ok(!people.some(person=>[removed.id,erased.id].includes(person.id)))
 const before=await snapshot(),body='Plain text <b>current</b> @Current reviewer @Former reviewer @Erased reviewer'
 const response=await request('comment.add',{subject,body,mentions:[current.id]})
 assert.equal(response.status,200,await response.clone().text());const comment=(await response.json()).data.value
 const after=await snapshot(),allowed=new Set(['evidence_comments','notifications','channel_events','channel_notifications','channel_deliveries','command_admissions','admission_audit','runtime_queue_publications'])
 for(const table of Object.keys(before))if(!allowed.has(table))assert.deepEqual(after[table],before[table],`ACT-002/004 comment leaves ${table} unchanged`)
 assert.deepEqual((await commentNotices(h.db,comment.id)).map(row=>row.operator_id),[current.id])
 for(const unavailable of [removed.id,erased.id,h.r.createUlid()]){const invalidBefore=await snapshot(),invalid=await request('comment.add',{subject,body,mentions:[unavailable]});assert.equal(invalid.status,403);assert.deepEqual(await snapshot(),invalidBefore,'Inactive or missing structured mention references cannot publish effects')}
 let thread=await recordThread(h,subject);assert.equal(thread.items.find(row=>row.id===comment.id).body,body);assert.equal(thread.canAdd,true)
 assert.ok((await h.db.prepare("SELECT actor_id FROM admission_audit WHERE action='comment.add' AND personal_refs_json=?").bind(JSON.stringify([comment.id])).first()).actor_id===h.ctx.principal.id)
 let detailResponse=await h.request(h.ownerSession,`/api/campaigns/${campaign.id}`);assert.equal(detailResponse.status,200,await detailResponse.clone().text());let detail=await detailResponse.json();assert.ok(detail.activity.some(row=>row.subjectId===comment.id&&row.type==='comment.created'&&row.actor.id===h.ctx.principal.id))
 const settled=await snapshot()
 for(const [input,expected] of [[{id:comment.id,version:comment.version+1},h.expected('campaign',campaign)],[{id:comment.id,version:comment.version},[{...h.expected('campaign',campaign)[0],version:campaign.version+1}]]]){
  const stale=await request('comment.delete',input,expected);assert.equal(stale.status,409,await stale.clone().text());assert.equal((await stale.json()).error.code,'version_conflict');assert.deepEqual(await snapshot(),settled,'ACT-002 stale deletion has no effects')
 }
 const denied=await h.addPerson({change:rules=>rules.map(rule=>rule.entityId===subject.entityId?{...rule,actions:rule.actions.filter(action=>action!=='comment.delete')}:rule)})
 for(const session of [denied.session,current.session]){const prior=await snapshot(),denial=await request('comment.delete',{id:comment.id,version:comment.version},h.expected('campaign',campaign),session);assert.equal(denial.status,403,await denial.clone().text());assert.deepEqual(await snapshot(),prior,'Only the authorized author can delete')}
 const beforeDelete=await snapshot(),deleted=await request('comment.delete',{id:comment.id,version:comment.version});assert.equal(deleted.status,200,await deleted.clone().text())
 const afterDelete=await snapshot(),deleteAllowed=new Set(['evidence_comments','command_admissions','admission_audit','runtime_queue_publications'])
 for(const table of Object.keys(beforeDelete))if(!deleteAllowed.has(table))assert.deepEqual(afterDelete[table],beforeDelete[table],`ACT-002 deletion leaves ${table} unchanged`)
 thread=await recordThread(h,subject);assert.equal(thread.items.find(row=>row.id===comment.id).body,null);assert.ok(thread.items.find(row=>row.id===comment.id).deletedAt)
 detail=await(await h.request(h.ownerSession,`/api/campaigns/${campaign.id}`)).json();assert.ok(detail.activity.some(row=>row.subjectId===comment.id&&row.type==='comment.deleted'&&row.actor.id===h.ctx.principal.id))
 const stored=await h.db.prepare('SELECT body,version,deleted_at FROM evidence_comments WHERE id=?').bind(comment.id).first();assert.equal(stored.body,null);assert.equal(stored.version,2);assert.ok(stored.deleted_at)
 const staleBefore=await snapshot(),staleDeleted=await request('comment.delete',{id:comment.id,version:comment.version});assert.equal(staleDeleted.status,404);assert.deepEqual(await snapshot(),staleBefore)
 const racingResponse=await request('comment.add',{subject,body:'Concurrent removal',mentions:[]});assert.equal(racingResponse.status,200);const racing=(await racingResponse.json()).data.value
 const raceBefore=await snapshot()
 const results=await Promise.all([request('comment.delete',{id:racing.id,version:racing.version}),request('comment.delete',{id:racing.id,version:racing.version})]);assert.equal(results.filter(result=>result.status===200).length,1);assert.ok(results.filter(result=>result.status!==200).every(result=>[404,409].includes(result.status)))
 const raceAfter=await snapshot()
 for(const table of Object.keys(raceBefore))if(!deleteAllowed.has(table))assert.deepEqual(raceAfter[table],raceBefore[table],`A racing deletion leaves ${table} unchanged`)
 assert.equal(raceAfter.command_admissions.length,raceBefore.command_admissions.length+1,'Only one racing command is admitted')
 assert.equal(raceAfter.admission_audit.length,raceBefore.admission_audit.length+1,'Only one racing action is audited')
 assert.equal((await h.db.prepare('SELECT version FROM evidence_comments WHERE id=?').bind(racing.id).first()).version,2,'Concurrent removals commit once')
}
