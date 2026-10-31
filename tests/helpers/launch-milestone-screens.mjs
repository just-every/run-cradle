import assert from 'node:assert/strict'

// MILE-002 and MILE-006: a late-quarter start must still use calendar quarters,
// and the same actual records and overdue labels survive both responsive views.
export async function verifyMilestoneScreens({h,page,command,capture}) {
 const expected=(kind,row)=>[{ref:{appId:'00000000000000000000000700',entityId:kind==='campaign'?'00000000000000000000000701':'00000000000000000000000703',recordId:row.id},version:row.version}]
 const create=async(action,input,revisions=[])=>{
  const result=await command(action,input,revisions)
  return result.data.value
 }
 const width=page.viewportSize().width
 const makeCampaign=(suffix,name)=>create('campaign.create',{fields:{code:`MILE-SCREEN-${suffix}-${width}`,name,ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-01-12',objective:'Prepare a reliable winter release',statusSummary:'Reviewing release evidence',phase:'Planning',status:'On track',health:75,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const campaign=await makeCampaign('Z','Winter release readiness')
 const earlierCampaign=await makeCampaign('A','Packaging readiness')
 let archivedCampaign=await makeCampaign('0','Archived readiness')
 const milestone=async(title,startDate,endDate=null,parent=campaign)=>create('milestone.create',{fields:{campaignId:parent.id,title,ownerId:h.owner,type:'Review',status:'Not started',startDate,endDate,conflictReason:null}})
 // Insert late dates first, including the later campaign code on the tied day.
 // The long range belongs first by its start, although its end follows the points.
 const range=await milestone('Cross-quarter release review','2026-12-29','2027-01-05')
 const point=await milestone('November packaging approval','2026-11-12')
 const tiedPoint=await milestone('Earlier campaign approval','2026-11-12',null,earlierCampaign)
 const longRange=await milestone('Long release preparation','2026-11-05','2027-01-05')
 await milestone('Archived checkpoint','2026-11-01',null,archivedCampaign)
 archivedCampaign=await create('campaign.archive',{id:archivedCampaign.id},expected('campaign',archivedCampaign))
 const expectedItems=[
  {id:longRange.id,campaignId:campaign.id,startDate:'2026-11-05',endDate:'2027-01-05',startLabel:'Nov 5, 2026',endLabel:'Jan 5, 2027'},
  {id:tiedPoint.id,campaignId:earlierCampaign.id,startDate:'2026-11-12',endDate:null,startLabel:'Nov 12, 2026',endLabel:null},
  {id:point.id,campaignId:campaign.id,startDate:'2026-11-12',endDate:null,startLabel:'Nov 12, 2026',endLabel:null},
  {id:range.id,campaignId:campaign.id,startDate:'2026-12-29',endDate:'2027-01-05',startLabel:'Dec 29, 2026',endLabel:'Jan 5, 2027'},
 ]
 const expectedOrder=expectedItems.map(item=>item.id)
 const response=await h.request(h.ownerSession,'/api/milestones/timeline')
 assert.equal(response.status,200,await response.clone().text())
 const timeline=await response.json()
 const httpOrder=timeline.milestones.map(item=>item.id)
 assert.deepEqual(httpOrder,expectedOrder,'Shipped timeline orders by start date then campaign code and excludes archived campaigns')
 assert.equal(timeline.timezone,'Australia/Brisbane')
 assert.deepEqual(timeline.milestones.map(({id,campaign,startDate,endDate})=>({id,campaignId:campaign.id,startDate,endDate})),expectedItems.map(({startLabel,endLabel,...item})=>item),'The ordered HTTP result retains each point or range and its own campaign')
 await page.goto(`${h.origin}/app/lenses/timeline`);await page.locator('#timeline-title').waitFor()
 // Read each visible title link, excluding desktop calendar marks. Both layouts
 // must present exactly one title per record in the authored order, without sorting.
 const links=()=>page.locator('a.cr-link[href^="/app/milestones/"]').filter({visible:true}).evaluateAll(items=>items.map(item=>item.getAttribute('href')))
 const expectedLinks=expectedOrder.map(id=>`/app/milestones/${id}`)
 const checkItems=async()=>{
  for(const item of expectedItems){
   const title=page.locator(`a.cr-link[href="/app/milestones/${item.id}"]`).filter({visible:true})
   assert.equal(await title.count(),1,'Each milestone has one visible title link')
   const row=title.locator(width>=768?'xpath=../..':'xpath=ancestor::article')
   assert.equal(await row.locator(`a[href="/app/campaigns/${item.campaignId}"]`).count(),1,'Each milestone links to its own campaign')
   if(width>=768){
    const dates=row.getByRole('group').locator('p')
    assert.equal((await dates.innerText()).replace('Overdue','').trim(),item.endLabel?`${item.startLabel} – ${item.endLabel}`:item.startLabel,'A range shows both dates and a point shows only its date')
   }else{
    assert.equal(await row.locator('time').getAttribute('datetime'),item.startDate)
    assert.equal(await row.locator('time').innerText(),item.startLabel)
    const ownerAndEnd=await row.locator('div > span').first().innerText()
    assert.equal(ownerAndEnd,item.endLabel?`Mira Example · ends ${item.endLabel}`:'Mira Example','Only ranges have an end date in the phone agenda')
   }
  }
 }
 const month=await links()
 assert.deepEqual(month,expectedLinks,'Month displays the independently authored timeline order')
 await checkItems()
 for(const [parent,count] of [[campaign,3],[earlierCampaign,1]])assert.equal(await page.locator(`a[href="/app/campaigns/${parent.id}"]`).filter({visible:true}).count(),count)
 assert.equal(await page.locator(`a[href="/app/campaigns/${archivedCampaign.id}"]`).filter({visible:true}).count(),0)
 await page.getByRole('button',{name:'Quarter',exact:true}).click()
 const quarter=await links()
 assert.deepEqual(quarter,expectedLinks,'Quarter preserves timeline order and membership')
 await checkItems()
 if(width===1440){
  assert.deepEqual(await page.locator('small[aria-label^="Dates in"]').filter({visible:true}).evaluateAll(items=>items.map(item=>item.getAttribute('aria-label'))),['Dates in Q4 2026','Dates in Q1 2027'])
 }
 await capture('clause-timeline-calendar-quarters')
 await page.getByRole('button',{name:'Month',exact:true}).click()
 assert.deepEqual(await links(),expectedLinks,'Returning to Month preserves timeline order and membership')
 if(width===1440)assert.deepEqual(await page.locator('small[aria-label^="Dates in"]').filter({visible:true}).evaluateAll(items=>items.map(item=>item.getAttribute('aria-label'))),['Dates in Nov 2026','Dates in Dec 2026','Dates in Jan 2027'])
 await capture('clause-timeline-calendar-months')
 // Once the axis check is isolated, add actual overdue and inclusive-today
 // boundaries using the configured zone rather than the browser's local day.
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10)
 const overdue=await milestone('Overdue evidence review',yesterday)
 const due=await milestone('Evidence due today',yesterday,today)
 await page.reload();await page.locator('#timeline-title').waitFor()
 for(const [row,isOverdue]of [[overdue,true],[due,false]]){
  const item=width===1440?page.getByRole('group',{name:new RegExp('^'+row.title+',')}):page.getByRole('article').filter({has:page.getByRole('link',{name:row.title,exact:true})})
  assert.equal(await item.getByText('Overdue',{exact:true}).count(),isOverdue?1:0)
 }
 await capture('clause-timeline-overdue')
 await page.goto(`${h.origin}/app/milestones/${overdue.id}`);await page.getByRole('heading',{name:overdue.title,exact:true}).waitFor()
 await page.getByText('Not started · Overdue',{exact:true}).waitFor()
 await capture('clause-milestone-overdue')
 const deliverable=await create('deliverable.create',{fields:{campaignId:campaign.id,title:'Evidence publishing checklist',ownerId:h.owner,dueDate:yesterday}})
 await page.goto(`${h.origin}/app/search`);await page.waitForLoadState('networkidle')
 await page.getByLabel('Search all bases',{exact:true}).fill('Evidence')
 const searching=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/search')
 await page.getByRole('button',{name:'Search',exact:true}).click()
 const searched=await searching;assert.equal(searched.status(),200,await searched.text())
 const overdueResult=page.getByRole('article').filter({has:page.getByRole('link',{name:overdue.title,exact:true})})
 await overdueResult.waitFor();assert.equal(await overdueResult.getByText('Overdue',{exact:true}).count(),1)
 const dueResult=page.getByRole('article').filter({has:page.getByRole('link',{name:due.title,exact:true})});assert.equal(await dueResult.getByText('Overdue',{exact:true}).count(),0)
 const deliverableResult=page.getByRole('article').filter({has:page.getByRole('link',{name:deliverable.title,exact:true})});assert.equal(await deliverableResult.getByText('Overdue',{exact:true}).count(),1)
 await capture('clause-search-overdue')
 await create('milestone.patch',{id:overdue.id,changes:{status:'Complete'}},expected('milestone',overdue))
 await page.goto(`${h.origin}/app/milestones/${overdue.id}`);await page.getByText('Complete',{exact:true}).waitFor()
 assert.equal(await page.getByText('Complete · Overdue',{exact:true}).count(),0)
 await capture('clause-milestone-complete')
 await create('campaign.delete',{id:campaign.id,confirmationCode:campaign.code},expected('campaign',campaign))
 for(const parent of [earlierCampaign,archivedCampaign])await create('campaign.delete',{id:parent.id,confirmationCode:parent.code},expected('campaign',parent))
 return {width,expectedOrder,httpOrder,month,quarter}
}
