import assert from 'node:assert/strict'

// MILE-002/MILE-006: a late-quarter start must still use calendar quarters,
// and the same actual records and overdue labels survive both responsive views.
export async function verifyMilestoneScreens({h,page,command,capture}) {
 const expected=(kind,row)=>[{ref:{appId:'00000000000000000000000700',entityId:kind==='campaign'?'00000000000000000000000701':'00000000000000000000000703',recordId:row.id},version:row.version}]
 const create=async(action,input,revisions=[])=>{
  const result=await command(action,input,revisions)
  return result.data.value
 }
 const width=page.viewportSize().width
 const campaign=await create('campaign.create',{fields:{code:`MILE-SCREEN-${width}`,name:'Winter release readiness',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-01-12',objective:'Prepare a reliable winter release',statusSummary:'Reviewing release evidence',phase:'Planning',status:'On track',health:75,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const milestone=async(title,startDate,endDate=null)=>create('milestone.create',{fields:{campaignId:campaign.id,title,ownerId:h.owner,type:'Review',status:'Not started',startDate,endDate,conflictReason:null}})
 const point=await milestone('November packaging approval','2026-11-12')
 const range=await milestone('Cross-quarter release review','2026-12-29','2027-01-05')
 await page.goto(`${h.origin}/app/lenses/timeline`);await page.locator('#timeline-title').waitFor()
 const links=()=>page.locator('a[href^="/app/milestones/"]').filter({visible:true}).evaluateAll(items=>[...new Set(items.map(item=>item.getAttribute('href')))].sort())
 const month=await links()
 assert.deepEqual(month,[`/app/milestones/${point.id}`,`/app/milestones/${range.id}`].sort())
 assert.equal(await page.locator(`a[href="/app/campaigns/${campaign.id}"]`).filter({visible:true}).count(),2)
 await page.getByRole('button',{name:'Quarter',exact:true}).click()
 assert.deepEqual(await links(),month)
 if(width===1440){
  assert.deepEqual(await page.locator('small[aria-label^="Dates in"]').filter({visible:true}).evaluateAll(items=>items.map(item=>item.getAttribute('aria-label'))),['Dates in Q4 2026','Dates in Q1 2027'])
 }
 await capture('clause-timeline-calendar-quarters')
 await page.getByRole('button',{name:'Month',exact:true}).click()
 assert.deepEqual(await links(),month)
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
}
