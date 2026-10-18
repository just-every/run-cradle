import assert from 'node:assert/strict'
import { mutationSnapshot } from './launch-write-context.mjs'

export async function verifyCampaignClauses(h) {
 const {db,commit,prepare,expected,actor,r,ctx}=h
 const reader=r.createLaunchReader(db,h.policy)
 let campaign=await h.campaign('CLAUSE-CAMPAIGN')
 const unchanged=async(action,input,revisions,field)=>{
  const before=await mutationSnapshot(db)
  await assert.rejects(async()=>commit(action,input,revisions),error=>{
   if(error.issues)assert.ok(error.issues.some(issue=>issue.path.includes(field)),`${field} must be named in validation`)
   else assert.match(error.message,new RegExp(field,'i'))
   return true
  })
  assert.deepEqual(await mutationSnapshot(db),before,`${field} validation changes nothing`)
 }
 for(const [changes,field] of [
  [{launchDate:'2025-12-31'},'launchDate'],[{health:-1},'health'],[{health:101},'health'],[{health:1.5},'health'],
  [{budgetMinor:-1},'budgetMinor'],[{spendMinor:-1},'spendMinor'],[{ownerId:null},'ownerId'],
  [{startDate:null},'startDate'],[{launchDate:null},'launchDate'],
 ])await unchanged('campaign.patch',{id:campaign.id,changes},expected('campaign',campaign),field)
 for(const health of [0,100])campaign=await commit('campaign.patch',{id:campaign.id,changes:{health,budgetMinor:0,spendMinor:0}},expected('campaign',campaign))
 campaign=await commit('campaign.patch',{id:campaign.id,changes:{code:'  Clause-Campaign  '}},expected('campaign',campaign))
 assert.equal(campaign.code,'Clause-Campaign')
 const other=await h.campaign('CLAUSE-OTHER')
 await unchanged('campaign.patch',{id:other.id,changes:{code:'  cLaUsE-cAmPaIgN  '}},expected('campaign',other),'code')
 await unchanged('campaign.create',{fields:{...Object.fromEntries(Object.keys(r.campaignFields.shape).map(key=>[key,key==='tags'?[]:key==='customFields'?{}:campaign[key]]))}},[],'code')

 let deliverable=await commit('deliverable.create',{fields:{campaignId:campaign.id,title:'Prepare release notes',ownerId:actor,dueDate:null}})
 assert.equal(deliverable.state,'Open');assert.equal(deliverable.campaignId,campaign.id);assert.equal(deliverable.dueDate,null)
 for(const [changes,field] of [[{title:'  '},'title'],[{ownerId:null},'ownerId'],[{campaignId:null},'campaignId']])await unchanged('deliverable.patch',{id:deliverable.id,changes},expected('deliverable',deliverable),field)
 deliverable=await commit('deliverable.patch',{id:deliverable.id,changes:{title:'Publish release notes',dueDate:'2026-10-21'}},expected('deliverable',deliverable))
 assert.equal(deliverable.title,'Publish release notes');assert.equal(deliverable.dueDate,'2026-10-21')
 const rollup=async(complete,total)=>{const value=await reader.get(ctx,'campaign',campaign.id);assert.equal(value.deliverableComplete,complete);assert.equal(value.deliverableTotal,total)}
 await rollup(0,1)
 for(const [action,state,complete]of [['complete','Complete',1],['reopen','Open',0]]){
  const plan=await prepare(`deliverable.${action}`,{id:deliverable.id},expected('deliverable',deliverable))
  await rollup(action==='complete'?0:1,1)
  deliverable=(await h.admission.commit(ctx,plan)).result.value
  assert.equal(deliverable.state,state)
  await rollup(complete,1)
  const activity=(await db.prepare("SELECT * FROM activity_entries WHERE subject_id=? AND field_name='state' ORDER BY rowid DESC LIMIT 1").bind(deliverable.id).first())
  assert.equal(activity.actor_id,actor);assert.equal(activity.created_at,Date.parse(ctx.now));assert.equal(activity.next_value,state)
  if(action==='complete'){assert.equal(deliverable.completedById,actor);assert.equal(deliverable.completedAt,ctx.now)}
 }
 const milestone=await commit('milestone.create',{fields:{campaignId:campaign.id,title:'Review launch notes',ownerId:actor,type:'Review',status:'Not started',startDate:'2026-10-21',endDate:null,conflictReason:null}})
 const risk=await commit('risk.create',{fields:{campaignId:campaign.id,title:'Translation delay',ownerId:actor,severity:'High',dueDate:null,signal:'Review pending',mitigation:'Book a reviewer'}})
 const decision=await commit('decision.create',{fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Choose launch language',requesterId:actor,assigneeId:null,priority:'High',dueAt:'2026-10-21T12:00:00.000Z',recommendation:'English first',impact:'Release scope'}})
 await commit('comment.create',{campaignId:campaign.id,body:'Reviewer booked',mentions:[]},expected('campaign',campaign))
 const response=await h.request(h.ownerSession,`/api/campaigns/${campaign.id}`)
 assert.equal(response.status,200)
 const detail=await response.json()
 assert.equal(detail.campaign.code,campaign.code)
 assert.equal(detail.campaign.deliverableComplete,0);assert.equal(detail.campaign.deliverableTotal,1)
 assert.ok(JSON.stringify(detail).includes(milestone.id));assert.ok(JSON.stringify(detail).includes(risk.id));assert.ok(JSON.stringify(detail).includes(decision.id))
 assert.ok(JSON.stringify(detail).includes('Reviewer booked'));assert.ok(JSON.stringify(detail).includes(deliverable.id))
 const activities=await db.prepare('SELECT id FROM activity_entries WHERE campaign_id=?').bind(campaign.id).all()
 for(const activity of activities.results)assert.ok(JSON.stringify(detail).includes(activity.id),'Detail contains committed campaign activity')
 await commit('deliverable.delete',{id:deliverable.id},expected('deliverable',deliverable))
 await rollup(0,0)
 assert.equal(await db.prepare('SELECT id FROM deliverables WHERE id=?').bind(deliverable.id).first(),null)
}
