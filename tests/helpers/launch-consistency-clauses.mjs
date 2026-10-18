import assert from 'node:assert/strict'

export async function verifyConsistencyClauses(h) {
 const read=async path=>{const response=await h.request(h.ownerSession,path);assert.equal(response.status,200,await response.clone().text());return response.json()}
 const write=async(action,input,expected=[])=>{const response=await h.request(h.ownerSession,`/api/v1/commands/launch.${action}`,{method:'POST',body:JSON.stringify({commandId:h.r.createUlid(),input,expected})});assert.equal(response.status,200,await response.clone().text());return (await response.json()).data.value}
 const before=await read('/api/portfolio')
 const today=new Date().toISOString().slice(0,10)
 const campaign=await write('campaign.create',{fields:{code:'CONSISTENCY',name:'Current release',ownerId:h.actor,startDate:'2026-01-01',launchDate:today,objective:'Read committed work',statusSummary:'Ready',phase:'Planning',status:'At risk',health:50,budgetMinor:100,spendMinor:0,tags:[],customFields:{}}})
 const portfolio=await read('/api/portfolio')
 assert.equal(portfolio.metrics.liveCampaigns,before.metrics.liveCampaigns+1,'VIEW-003 Home and Overview use committed campaign counts')
 assert.ok(portfolio.attention.some(row=>row.id===campaign.id&&row.status==='At risk'))
 const deliverable=await write('deliverable.create',{fields:{campaignId:campaign.id,title:'Consistency package',ownerId:h.actor,dueDate:today}})
 await write('deliverable.complete',{id:deliverable.id},h.expected('deliverable',deliverable))
 const risk=await write('risk.create',{fields:{campaignId:campaign.id,title:'Consistency supplier',ownerId:h.actor,severity:'High',dueDate:today,signal:'Current signal',mitigation:'Review'}})
 const milestone=await write('milestone.create',{fields:{campaignId:campaign.id,title:'Consistency review',ownerId:h.actor,type:'Review',status:'Not started',startDate:today,endDate:null,conflictReason:null}})
 const decision=await write('decision.create',{fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Consistency decision',requesterId:h.actor,assigneeId:null,priority:'High',dueAt:new Date(Date.now()+86400000).toISOString(),recommendation:'Proceed',impact:'Release'}})
 const detail=await read(`/api/campaigns/${campaign.id}`),grid=await read('/api/campaigns?limit=200')
 for(const row of [detail.campaign,grid.items.find(row=>row.id===campaign.id)]){
  assert.equal(row.deliverableTotal,1);assert.equal(row.deliverableComplete,1);assert.equal(row.unresolvedDecisionCount,1);assert.equal(row.riskRating,'High')
 }
 assert.ok(detail.deliverables.some(row=>row.id===deliverable.id&&row.state==='Complete'))
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
