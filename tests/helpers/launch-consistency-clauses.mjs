import assert from 'node:assert/strict'

export async function verifyConsistencyClauses(h) {
 const read=async path=>{const response=await h.request(h.ownerSession,path);assert.equal(response.status,200,await response.clone().text());return response.json()}
 const write=async(action,input,expected=[],session=h.ownerSession,commandId=h.r.createUlid())=>{const response=await h.request(session,`/api/v1/commands/launch.${action}`,{method:'POST',body:JSON.stringify({commandId,input,expected})});assert.equal(response.status,200,await response.clone().text());const receipt=await response.json();assert.equal(receipt.data.state,'committed');return receipt.data.value}
 const before=await read('/api/portfolio')
 const today=new Date().toISOString().slice(0,10)
 const campaign=await write('campaign.create',{fields:{code:'CONSISTENCY',name:'Current release',ownerId:h.actor,startDate:'2026-01-01',launchDate:today,objective:'Read committed work',statusSummary:'Ready',phase:'Planning',status:'At risk',health:50,budgetMinor:100,spendMinor:0,tags:[],customFields:{}}})
 const portfolio=await read('/api/portfolio')
 assert.equal(portfolio.metrics.liveCampaigns,before.metrics.liveCampaigns+1,'VIEW-003 Home and Overview use committed campaign counts')
 assert.ok(portfolio.attention.some(row=>row.id===campaign.id&&row.status==='At risk'))
 const deliverable=await write('deliverable.create',{fields:{campaignId:campaign.id,title:'Consistency package',ownerId:h.actor,dueDate:today}})
 const operator=await h.addPerson({name:'Completion operator'})
 const sessionResponse=await h.request(operator.session,'/api/session')
 assert.equal(sessionResponse.status,200)
 assert.equal((await sessionResponse.json()).operator.id,operator.id)
 assert.notEqual(operator.id,h.actor,'Completion is attributed to the acting colleague, not the deliverable owner')
 const campaignDetail=()=>read(`/api/campaigns/${campaign.id}`)
 const currentDeliverable=detail=>{
  const row=detail.deliverables.find(row=>row.id===deliverable.id)
  assert.ok(row,'The public campaign detail contains the created deliverable')
  assert.equal(row.title,'Consistency package');assert.equal(row.owner.id,h.actor)
  assert.equal(detail.campaign.deliverableTotal,1)
  return row
 }
 const transitionActivity=(detail,commandId,previousValue,nextValue,started,finished)=>{
  const entries=detail.activity.filter(row=>row.actionId===commandId&&row.subjectId===deliverable.id&&row.fieldName==='state')
  assert.equal(entries.length,1,'Each committed transition has one command-correlated state activity entry')
  const entry=entries[0]
  assert.equal(entry.type,'deliverable.updated');assert.equal(entry.subjectTitle,'Consistency package')
  assert.equal(entry.previousValue,previousValue);assert.equal(entry.nextValue,nextValue)
  assert.equal(entry.actor.id,operator.id);assert.equal(entry.actor.name,'Completion operator')
  const occurred=Date.parse(entry.occurredAt)
  assert.ok(occurred>=started&&occurred<=finished,'Activity time is bounded independently around the HTTP command')
  return entry
 }
 const openDetail=await campaignDetail(),open=currentDeliverable(openDetail)
 assert.equal(open.state,'Open');assert.equal(open.completedAt,null);assert.equal(open.completedById,null)
 assert.equal(openDetail.campaign.deliverableComplete,0)
 const completeId=h.r.createUlid(),completeStarted=Date.now()
 const completedResponse=await write('deliverable.complete',{id:deliverable.id},h.expected('deliverable',open),operator.session,completeId)
 const completeFinished=Date.now(),completedDetail=await campaignDetail(),completed=currentDeliverable(completedDetail)
 assert.equal(completedResponse.state,'Complete');assert.equal(completedResponse.completedById,operator.id)
 assert.equal(completed.state,'Complete');assert.equal(completed.version,open.version+1)
 assert.equal(completed.completedById,operator.id)
 assert.ok(Date.parse(completed.completedAt)>=completeStarted&&Date.parse(completed.completedAt)<=completeFinished,'Stored completion time is bounded by the command, not copied from its response')
 assert.equal(completedDetail.campaign.deliverableComplete,1)
 const completionActivity=transitionActivity(completedDetail,completeId,'Open','Complete',completeStarted,completeFinished)
 assert.equal(completed.completedAt,completionActivity.occurredAt,'Completion metadata and attributed activity share the committed time')
 const risk=await write('risk.create',{fields:{campaignId:campaign.id,title:'Consistency supplier',ownerId:h.actor,severity:'High',dueDate:today,signal:'Current signal',mitigation:'Review'}})
 const milestone=await write('milestone.create',{fields:{campaignId:campaign.id,title:'Consistency review',ownerId:h.actor,type:'Review',status:'Not started',startDate:today,endDate:null,conflictReason:null}})
 const decision=await write('decision.create',{fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Consistency decision',requesterId:h.actor,assigneeId:null,priority:'High',dueAt:new Date(Date.now()+86400000).toISOString(),recommendation:'Proceed',impact:'Release'}})
 const detail=await read(`/api/campaigns/${campaign.id}`),grid=await read('/api/campaigns?limit=200')
 for(const row of [detail.campaign,grid.items.find(row=>row.id===campaign.id)]){
  assert.equal(row.deliverableTotal,1);assert.equal(row.deliverableComplete,1);assert.equal(row.unresolvedDecisionCount,1);assert.equal(row.riskRating,'High')
 }
 assert.ok(detail.deliverables.some(row=>row.id===deliverable.id&&row.state==='Complete'))
 const beforeReopen=await campaignDetail(),persisted=currentDeliverable(beforeReopen)
 assert.deepEqual(persisted,completed,'Independent reads after other committed work retain completion attribution')
 assert.equal(beforeReopen.campaign.deliverableComplete,1)
 const reopenId=h.r.createUlid(),reopenStarted=Date.now()
 const reopenedResponse=await write('deliverable.reopen',{id:deliverable.id},h.expected('deliverable',persisted),operator.session,reopenId)
 const reopenFinished=Date.now(),reopenedDetail=await campaignDetail(),reopened=currentDeliverable(reopenedDetail)
 assert.equal(reopenedResponse.state,'Open');assert.equal(reopenedResponse.completedAt,null);assert.equal(reopenedResponse.completedById,null)
 assert.equal(reopened.state,'Open');assert.equal(reopened.version,persisted.version+1)
 assert.equal(reopened.completedAt,null);assert.equal(reopened.completedById,null)
 assert.equal(reopenedDetail.campaign.deliverableComplete,0)
 transitionActivity(reopenedDetail,reopenId,'Complete','Open',reopenStarted,reopenFinished)
 assert.deepEqual(reopenedDetail.activity.find(row=>row.id===completionActivity.id),completionActivity,'Reopening keeps the original attributed completion activity readable')
 assert.equal((await read('/api/portfolio')).metrics.openDecisions,before.metrics.openDecisions+1)
 assert.ok((await read('/api/decisions')).items.some(row=>row.id===decision.id))
 const lenses=[]
 for(const [recordType,display,field,id] of [['Campaign','Grid','code',campaign.id],['Risk','Cards','title',risk.id],['Milestone','Timeline','title',milestone.id],['Decision','Cards','title',decision.id]]){
  const lens=await write('lens.save',{definition:{name:`Current ${recordType}`,description:'Committed state',recordType,display,conditions:[{field,operator:'contains',value:recordType==='Campaign'?'CONSISTENCY':'Consistency'}],sort:{field,direction:'asc'},fields:[field]}})
  lenses.push(lens)
  const evaluated=await read(`/api/lenses/${lens.id}?view=results`)
  assert.deepEqual(evaluated.items.map(row=>row.id),[id]);assert.equal(evaluated.total.value,1)
  assert.deepEqual(evaluated.selectedDetail,evaluated.items[0])
 }
 // Shipped lens routes use their own public collection doors.
 const riskLens=await read('/api/risks/lens')
 assert.ok(riskLens.items.some(row=>row.id===risk.id))
 assert.ok((await read('/api/milestones/timeline')).items.some(row=>row.id===milestone.id))
 await write('decision.outcome',{id:decision.id,outcome:'Approved',rationale:''},h.expected('decision',decision))
 assert.equal((await read('/api/decisions')).items.some(row=>row.id===decision.id),false)
 assert.equal((await read('/api/portfolio')).metrics.openDecisions,before.metrics.openDecisions)
 assert.equal((await read(`/api/campaigns/${campaign.id}`)).campaign.unresolvedDecisionCount,0)
 const decisionLens=await read(`/api/lenses/${lenses[3].id}?view=results`)
 assert.equal(decisionLens.items[0].state,'Approved');assert.equal(decisionLens.selectedDetail.state,'Approved')
 await write('milestone.patch',{id:milestone.id,changes:{status:'Complete'}},h.expected('milestone',milestone))
 assert.equal((await read(`/api/lenses/${lenses[2].id}?view=results`)).items[0].status,'Complete')
 const definition={name:'Consistency monitor',enabled:false,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'add-activity',input:{campaignId:campaign.id,message:'Recorded after commit'}}]}
 let automation=await write('automation.save',{definition})
 assert.equal((await read('/api/automations')).items.find(row=>row.id===automation.id).enabled,false)
 automation=await write('automation.enable',{id:automation.id},h.expected('automation',automation))
 assert.equal((await read('/api/automations')).items.find(row=>row.id===automation.id).enabled,true)
 automation=await write('automation.disable',{id:automation.id},h.expected('automation',automation))
 assert.equal((await read('/api/automations')).items.find(row=>row.id===automation.id).enabled,false)
 await write('campaign.archive',{id:campaign.id},h.expected('campaign',campaign))
 for(const lens of lenses){const result=await read(`/api/lenses/${lens.id}?view=results`);assert.equal(result.total.value,0);assert.deepEqual(result.items,[]);assert.equal(result.selectedDetail,null)}
 assert.equal((await read('/api/portfolio')).metrics.liveCampaigns,before.metrics.liveCampaigns)
 assert.equal((await read('/api/campaigns?limit=200')).items.some(row=>row.id===campaign.id),false)
 assert.equal((await read('/api/risks/lens')).items.some(row=>row.id===risk.id),false)
 assert.equal((await read('/api/milestones/timeline')).items.some(row=>row.id===milestone.id),false)
 for(const lens of lenses)await write('lens.delete',{id:lens.id},h.expected('lens',lens))
}
