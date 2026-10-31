import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'

// CAMP-006: invoked by the existing walkthrough with an empty campaign fixture.
export async function verifyPortfolioScreens({h,page,command,capture}) {
 const appId='00000000000000000000000700'
 const entities={campaign:'00000000000000000000000701',decision:'00000000000000000000000705'}
 const expected=(kind,row)=>[{ref:{appId,entityId:entities[kind],recordId:row.id},version:row.version}]
 const write=async(action,input,revisions=[])=>{
  const envelope=await command(action,input,revisions)
  assert.equal(envelope.data.state,'committed',`CAMP-006 ${action} commits`)
  return envelope.data.value
 }
 const read=async()=>{
  const response=await h.request(h.ownerSession,'/api/portfolio')
  assert.equal(response.status,200,await response.clone().text())
  return response.json()
 }
 const show=async(metrics,name)=>{
  assert.deepEqual((await read()).metrics,metrics,`CAMP-006 ${name} public portfolio projection`)
  await page.goto(`${h.origin}/app/overview`)
  await page.getByRole('heading',{name:'Portfolio Overview',exact:true}).waitFor()
  const grid=page.getByRole('region',{name:'Portfolio overview metrics',exact:true})
  // The section has an accessible name and is exposed as a region.
  for(const [label,value] of [
   ['Live campaigns',String(metrics.liveCampaigns)],
   ['Needs attention',String(metrics.needsAttention)],
   ['Open decisions',String(metrics.openDecisions)],
   ['Portfolio health',metrics.portfolioHealth===null?'No data':`${metrics.portfolioHealth}%`],
  ]){
   const card=grid.locator('article').filter({has:page.getByText(label,{exact:true})})
   await card.getByText(value,{exact:true}).waitFor()
   assert.equal(await card.locator('strong').innerText(),value,`CAMP-006 rendered ${label}`)
  }
  const staleCopy=metrics.staleHealthCount
   ?`${metrics.staleHealthCount} campaign health values are stale.`
   :'All visible health values are current.'
  await page.locator('.portfolio-overview-hero').getByText(staleCopy,{exact:true}).waitFor()
  if(metrics.staleHealthCount)assert.equal(await grid.locator('article').filter({has:page.getByText('Portfolio health',{exact:true})}).locator('small').innerText(),`${metrics.staleHealthCount} stale values`)
  await capture(`clause-portfolio-${name}`)
 }
 const empty={liveCampaigns:0,needsAttention:0,openDecisions:0,portfolioHealth:null,staleHealthCount:0}
 const campaigns=[]
 const width=page.viewportSize().width
 const createCampaign=async(suffix,status,health)=>{
  const campaign=await write('campaign.create',{fields:{code:`PORTFOLIO-${width}-${suffix}`,name:({'at-risk':'Supplier readiness','blocked':'Packaging launch','archive':'Archived catalogue launch'})[suffix],ownerId:h.owner,startDate:'2026-01-01',launchDate:'2026-12-01',objective:'Verify the current portfolio rollup',statusSummary:'Current operator evidence',phase:'Planning',status,health,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
  campaigns.push(campaign)
  return campaign
 }
 const createDecision=async(campaign,title)=>write('decision.create',{fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title,requesterId:h.owner,assigneeId:h.owner,priority:'High',dueAt:'2026-12-01T12:00:00.000Z',recommendation:'Review launch evidence',impact:'Launch scope'}})
 try {
  await show(empty,'empty')
  const atRisk=await createCampaign('at-risk','At risk',50)
  let blocked=await createCampaign('blocked','Blocked',51)
  let archived=await createCampaign('archive','Blocked',0)
  const awaiting=await createDecision(atRisk,'Awaiting portfolio approval')
  assert.equal(awaiting.state,'Awaiting approval')
  const review=await createDecision(blocked,'Portfolio changes requested')
  const inReview=await write('decision.request-change',{id:review.id,rationale:'Confirm current evidence'},expected('decision',review))
  assert.equal(inReview.state,'In review')
  for(const outcome of ['Approved','Rejected','Cancelled']){
   const decision=await createDecision(atRisk,`${outcome} portfolio decision`)
   const resolved=await write('decision.outcome',{id:decision.id,outcome,rationale:'Recorded operator outcome'},expected('decision',decision))
   assert.equal(resolved.state,outcome)
  }
  await createDecision(archived,'Archived awaiting approval')
  const archivedReview=await createDecision(archived,'Archived review')
  await write('decision.request-change',{id:archivedReview.id,rationale:'Review before archive'},expected('decision',archivedReview))
  await show({liveCampaigns:3,needsAttention:3,openDecisions:4,portfolioHealth:34,staleHealthCount:0},'before-archive')

  // Only historical health timestamps bypass commands; all domain changes use HTTP.
  const historicalHealth=Date.now()-15*24*60*60*1000
  await h.db.batch([
   h.db.prepare('UPDATE campaigns SET health_updated_at=? WHERE id=?').bind(historicalHealth,atRisk.id),
   h.db.prepare('UPDATE campaigns SET health_updated_at=? WHERE id=?').bind(historicalHealth,archived.id),
  ])
  archived=await write('campaign.archive',{id:archived.id},expected('campaign',archived))
  const activeMetrics={liveCampaigns:2,needsAttention:2,openDecisions:2,portfolioHealth:51,staleHealthCount:1}
  // (50 + 51) / 2 = 50.5, rounded half up. The archived zero and its
  // two unresolved decisions and stale health must leave every metric.
  await show(activeMetrics,'half-up-and-stale')
  const stored=(await h.db.prepare('SELECT state FROM decisions WHERE campaign_id=? ORDER BY state').bind(archived.id).all()).results
  assert.deepEqual(stored.map(row=>row.state),['Awaiting approval','In review'],'Archive excludes unresolved decisions without resolving them')
  blocked=await write('campaign.patch',{id:blocked.id,changes:{status:'On track'}},expected('campaign',blocked))
  await show({...activeMetrics,needsAttention:1},'attention-status-change')
 } finally {
  // Read current revisions for cleanup so even a failed intermediate assertion
  // leaves no synthetic campaigns in the enclosing walkthrough.
  for(const fixture of campaigns.reverse()){
   const current=await h.db.prepare('SELECT id,code,version FROM campaigns WHERE id=?').bind(fixture.id).first()
   if(current)await write('campaign.delete',{id:current.id,confirmationCode:current.code},expected('campaign',current))
  }
 }
 assert.deepEqual((await read()).metrics,empty,'CAMP-006 fixture cleanup restores the empty portfolio')
}

// CAMP-012: reuse the walkthrough registration and its real command transport.
export async function verifyCampaignRatingScreens({h,page,command,capture,receipt}) {
 const width=page.viewportSize().width
 const expected=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]
 const write=async(action,input,revisions=[])=>{
  const envelope=await command(action,input,revisions)
  assert.equal(envelope.data.state,'committed',`CAMP-012 ${action} commits`)
  return envelope.data.value
 }
 const read=async route=>{
  const response=await h.request(h.ownerSession,route)
  assert.equal(response.status,200,await response.clone().text())
  return response.json()
 }
 const campaign=await write('campaign.create',{fields:{code:`RATING-${width}`,name:'Multi-risk launch',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2026-12-01',objective:'Review independent risk maxima',statusSummary:'Current evidence',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const show=async(rating,step,proof=false)=>{
  const detail=(await read(`/api/campaigns/${campaign.id}`)).campaign
  const grid=(await read('/api/campaigns?limit=200')).items.find(row=>row.id===campaign.id)
  assert.equal(detail.riskRating,rating,`${step} public detail`)
  assert.equal(grid?.riskRating,rating,`${step} public grid`)
  await page.goto(`${h.origin}/app/campaigns/${campaign.id}`)
  await expect(page.locator('.portfolio-detail-hero .portfolio-pill')).toHaveText(rating==='None'?['On track']:['On track',`${rating} risk`])
  if(proof)await capture(`campaign-rating-${step}-detail`)
  await page.goto(`${h.origin}/app/campaigns`)
  await page.getByRole('heading',{name:'Campaign Grid',exact:true}).waitFor()
  await page.locator('.portfolio-campaign-table:visible, .portfolio-campaign-cards:visible').waitFor()
  const table=page.locator('.portfolio-campaign-table').filter({visible:true})
  const row=(await table.count())
   ?table.locator('tbody tr').filter({has:page.locator(`a[href="/app/campaigns/${campaign.id}"]`)})
   :page.locator('.portfolio-campaign-cards > li').filter({has:page.locator(`a[href="/app/campaigns/${campaign.id}"]`)})
  await expect(row).toBeVisible()
  if(await table.count()){
   const column=(await table.locator('thead th').allTextContents()).indexOf('Risk')
   assert.ok(column>=0,'Grid includes the risk column')
   await expect(row.locator('th,td').nth(column)).toHaveText(rating)
  }else{
   await expect(row.getByText(rating,{exact:true})).toBeVisible()
  }
  if(proof)await capture(`campaign-rating-${step}-grid`)
  await row.getByRole('button',{name:/^Inspect/}).click()
  const inspector=page.locator('.portfolio-inspector')
  await expect(inspector.getByRole('heading',{name:campaign.name,exact:true})).toBeVisible()
  const status=inspector.locator('.portfolio-inspector-status')
  await expect(status.getByText(rating==='None'?'None':`${rating} risk`,{exact:true})).toBeVisible()
  if(width===390)await page.locator('dialog.portfolio-inspector:modal').waitFor()
  if(proof)await capture(`campaign-rating-${step}-inspector`)
  await inspector.getByRole('button',{name:'Close campaign inspector',exact:true}).click()
  receipt.campaignRatings??=[]
  receipt.campaignRatings.push({width,step,expected:rating,detail:detail.riskRating,grid:grid.riskRating,presentation:await table.count()?'grid':'card',inspector:rating})
 }
 try{
  await show('None','empty')
  const risks=[]
  for(const [severity,rating] of [['Low','Low'],['Medium','Medium'],['High','High'],['Critical','Critical']]){
   risks.push(await write('risk.create',{fields:{campaignId:campaign.id,title:`${severity} launch evidence`,ownerId:h.owner,severity,dueDate:null,signal:'Current supplier evidence',mitigation:'Review the evidence'}}))
   await show(rating,`created-${severity.toLowerCase()}`,severity==='Critical')
  }
  risks[3]=await write('risk.patch',{id:risks[3].id,changes:{severity:'Medium'}},expected('risk',risks[3]))
  await show('High','highest-lowered')
  for(const [index,rating,step] of [[2,'Medium','high-resolved'],[1,'Medium','medium-tie-resolved'],[3,'Low','lowered-critical-resolved'],[0,'None','all-resolved']]){
   risks[index]=await write('risk.resolve',{id:risks[index].id,resolutionNote:'Evidence addressed'},expected('risk',risks[index]))
   await show(rating,step,step==='all-resolved')
  }
  const reopened=await write('risk.reopen',{id:risks[0].id},expected('risk',risks[0]))
  await show('Low','reopened',true)
  await write('risk.patch',{id:reopened.id,changes:{severity:'High'}},expected('risk',reopened))
  await show('High','reopened-raised')
 }finally{
  await write('campaign.delete',{id:campaign.id,confirmationCode:campaign.code},expected('campaign',campaign))
 }
}
