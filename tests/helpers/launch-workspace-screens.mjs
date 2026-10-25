import assert from 'node:assert/strict'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

export async function verifyWorkspaceScreens({h,page,command,capture}){
 const width=page.viewportSize().width,created=[]
 const read=async path=>{const response=await h.request(h.ownerSession,path);assert.equal(response.status,200);return response.json()}
 const original=(await read('/api/settings')).settings.workspace
 const saveWorkspace=async(currency,timezone)=>{
  await page.goto(`${h.origin}/app/settings`)
  await page.getByLabel('Currency',{exact:true}).selectOption(currency)
  await page.getByLabel('Timezone',{exact:true}).selectOption(timezone)
  const response=page.waitForResponse(response=>response.url().endsWith('/api/settings')&&response.request().method()==='PATCH')
  await page.getByRole('button',{name:'Save workspace',exact:true}).click()
  const saved=await response;assert.equal(saved.status(),200)
  await page.waitForLoadState('networkidle')
  assert.equal((await read('/api/settings')).settings.workspace.currency,currency)
  await capture(`clause-workspace-${currency.toLowerCase()}-${timezone==='Europe/London'?'london':'brisbane'}`)
  assert.equal(await page.getByLabel('Currency',{exact:true}).inputValue(),currency,'OPS-006 saved currency remains visible')
  assert.equal(await page.getByLabel('Timezone',{exact:true}).inputValue(),timezone,'OPS-003 saved timezone remains visible')
 }
 try{
  for(const [currency,budget,spend]of [['AUD','1234.56','345.67'],['JPY','123456','34567'],['KWD','123.456','34.567']]){
   await saveWorkspace(currency,'Europe/London')
   await page.goto(`${h.origin}/app/campaigns`)
   await page.getByRole('button',{name:'New campaign',exact:true}).click()
   await page.getByLabel('Campaign name',{exact:true}).fill(`Currency precision ${currency}`)
   await page.getByLabel('Campaign code',{exact:true}).fill(`CURRENCY-${currency}-${width}`)
   await page.getByLabel('Owner',{exact:true}).selectOption(h.owner)
   await page.getByLabel('Start date',{exact:true}).fill('2026-01-01')
   await page.getByLabel('Launch date',{exact:true}).fill('2027-01-01')
   await page.getByLabel('Phase',{exact:true}).selectOption('Planning')
   await page.getByLabel('Status',{exact:true}).selectOption('At risk')
   await page.getByLabel('Manually reported health (%)',{exact:true}).fill('65')
   await page.getByLabel(`Budget (${currency})`,{exact:true}).fill(budget)
   await page.getByLabel(`Spend so far (${currency})`,{exact:true}).fill(spend)
   await capture(`clause-money-${currency.toLowerCase()}-form`)
   const submitted=page.waitForResponse(response=>response.url().endsWith('/api/v1/commands/launch.campaign.create')&&response.request().method()==='POST')
   await page.getByRole('button',{name:'Create campaign',exact:true}).click()
   const response=await submitted;assert.equal(response.status(),200,await response.text())
   const campaign=(await response.json()).data.value;created.push(campaign)
   const stored=await h.db.prepare('SELECT budget_minor,spend_minor FROM campaigns WHERE id=?').bind(campaign.id).first()
   assert.deepEqual(stored,{budget_minor:123456,spend_minor:34567},'OPS-006 native form converts according to ISO minor units')
   await page.goto(`${h.origin}/app/campaigns/${campaign.id}`)
   await page.getByRole('heading',{name:campaign.name,exact:true}).waitFor()
   await page.locator('details.portfolio-priority-details > summary').click()
   const formatter=new Intl.NumberFormat('en-US',{style:'currency',currency})
   const divisor=10**formatter.resolvedOptions().maximumFractionDigits
   const expected=`${formatter.format(34567/divisor)} spent of ${formatter.format(123456/divisor)}`
   assert.equal(await page.locator('.portfolio-detail-facts div').filter({has:page.getByText('Budget',{exact:true})}).locator('dd').innerText(),expected,'OPS-006 display preserves minor units')
   await capture(`clause-money-${currency.toLowerCase()}-detail`)
  }
  await page.goto(`${h.origin}/app/campaigns`)
  await page.getByRole('heading',{name:'Campaign Grid',exact:true}).waitFor()
  const totals=page.locator('section[aria-labelledby="campaign-money-totals-title"]')
  await totals.getByRole('heading',{name:'Totals for 3 shown campaigns',exact:true}).waitFor()
  const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'KWD'})
  assert.deepEqual(await totals.locator('strong').allInnerTexts(),[money.format(370.368),money.format(103.701)],'OPS-006 product totals sum shown budgets and spend exactly in the workspace currency')
  await capture('clause-money-grid-totals')
  await page.locator('.portfolio-campaign-table tbody tr, .portfolio-campaign-cards > li').filter({has:page.getByText('Currency precision AUD',{exact:true})}).getByRole('button',{name:/^Inspect/}).click()
  await page.locator('.portfolio-inspector').waitFor()
  assert.ok((await page.locator('.portfolio-inspector').innerText()).includes(money.format(123.456)))
  await capture('clause-money-inspector')
  await page.goto(`${h.origin}/app/overview`)
  await page.getByRole('heading',{name:'Portfolio Overview',exact:true}).waitFor()
  assert.equal(await page.getByText(money.format(123.456),{exact:true}).count(),3,'OPS-006 overview uses the workspace currency')
  await capture('clause-money-overview')
  const campaign=created[0],before=await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(campaign.id).first()
  await saveWorkspace('KWD','Europe/London')
  await page.goto(`${h.origin}/app/campaigns/${campaign.id}`)
  await page.locator('details.portfolio-priority-details > summary').click()
  await page.getByText('KWD 34.567 spent of KWD 123.456',{exact:true}).waitFor()
  assert.deepEqual(await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(campaign.id).first(),before,'OPS-006 currency relabel preserves persisted amounts and timestamps')
  const decision=(await command('decision.create',{fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Review timezone-sensitive deadline',requesterId:h.owner,assigneeId:h.owner,priority:'High',dueAt:'2026-11-01T12:00:00.000Z',recommendation:'Review before launch',impact:'Launch readiness'}})).data.value
  const storedDecision=await h.db.prepare('SELECT * FROM decisions WHERE id=?').bind(decision.id).first()
  for(const zone of ['Europe/London','Australia/Brisbane']){
   await saveWorkspace('KWD',zone)
   await page.goto(`${h.origin}/app/decisions/${decision.id}`)
   const expected=new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date('2026-11-01T12:00:00.000Z'))
   await page.getByText(expected,{exact:false}).first().waitFor()
   await capture(`clause-timezone-deadline-${zone==='Europe/London'?'london':'brisbane'}`)
   assert.deepEqual(await h.db.prepare('SELECT * FROM decisions WHERE id=?').bind(decision.id).first(),storedDecision,'OPS-003 timezone redisplay leaves UTC bytes unchanged')
  }
 }catch(error){
  console.log('Workspace journey failed at',new URL(page.url()).pathname)
  console.log((await page.locator('body').innerText()).slice(0,2500))
  await page.screenshot({path:`${process.env.CRADLE_LAUNCH_EVIDENCE??'../ui-proof'}/failed-workspace-${width}.png`,fullPage:true})
  throw error
 }finally{
  const current=(await read('/api/v1/settings')).data
  const restored=await h.request(h.ownerSession,'/api/v1/commands/settings.update',{method:'POST',body:JSON.stringify({commandId:createUlid(),expected:[],input:{version:current.version,changes:{currency:original.currency,timezone:original.timezone}}})})
  assert.equal(restored.status,200,await restored.clone().text())
  for(const campaign of created){const row=await h.db.prepare('SELECT id,code,version FROM campaigns WHERE id=?').bind(campaign.id).first();await command('campaign.delete',{id:row.id,confirmationCode:row.code},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:row.id},version:row.version}])}
 }
}
