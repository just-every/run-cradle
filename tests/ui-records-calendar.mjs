import {viewSettingsJourney} from './helpers/records-view-settings-journey.mjs'
import {extendedBoardJourney} from './helpers/records-extended-boards.mjs'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {contract} from './contract.mjs'
import {galleryBrowserJourney} from './helpers/records-gallery-journey.mjs'
import {calendarFeedJourney} from './helpers/records-calendar-feed.mjs'
import {recordsBrowserRuntime} from './helpers/records-browser-runtime.mjs'
import {recordsJourney} from './helpers/records-browser-journey.mjs'
import {freePort} from './helpers/free-port.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {newField} from '../src/ui/records/schema/templates.ts'

contract('VIEW-009] [VIEW-010] [VIEW-011] [VIEW-013] [VIEW-015','record calendars, boards, private covers and saved view presentation at desktop and phone widths',async()=>{
 await calendarFeedJourney()
 const output=path.resolve('.private/calendar');await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await recordsBrowserRuntime(await freePort())
  await h.db.prepare("UPDATE workspace_settings SET timezone='America/New_York'").run()
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000},timezoneId:'Australia/Brisbane'}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   try{
    await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
    async function call(url,input){return page.evaluate(async({url,input})=>{const csrf=await (await fetch('/auth/csrf')).json();const response=await fetch(url,{method:input===undefined?'GET':'POST',headers:{'content-type':'application/json','x-csrf-token':csrf.csrfToken},...(input===undefined?{}:{body:JSON.stringify(input)})});if(!response.ok)throw Error(`${response.status}: ${await response.text()}`);return (await response.json()).data},{url,input})}
    await page.goto(h.origin+'/app/records')
    const title=newField('Event'),start=newField('Starts','date'),end=newField('Ends','date'),appId=createUlid(),entityId=createUlid(),instantId=createUlid(),instantTitle=newField('Appointment'),instantStart=newField('Start time','instant'),instantEnd=newField('End time','instant')
    const preview=await call('/api/v1/records/schema-preview',{appId,name:`Operations calendar ${width}`,tables:[{id:entityId,label:'Visits',primaryFieldId:title.id,fields:[title,start,end]},{id:instantId,label:'Appointments',primaryFieldId:instantTitle.id,fields:[instantTitle,instantStart,instantEnd]}]})
    await call('/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}})
    const base=`/api/v1/apps/${appId}/entities/${entityId}`,tablePath=`${h.origin}/app/records/${appId}/${entityId}`
    await page.goto(tablePath)
    const created=await j.record({Event:'Acme site visit',Starts:'2026-10-19',Ends:'2026-10-21'})
    // Author the saved calendar through the product rather than constructing its metadata.
    await page.getByRole('button',{name:'Save view',exact:true}).click()
    await page.getByLabel('Name',{exact:true}).fill('Site schedule')
    await page.getByLabel('Display',{exact:true}).selectOption('calendar')
    await page.getByLabel('Date',{exact:true}).selectOption(start.id)
    await page.getByLabel('End date',{exact:true}).selectOption(end.id)
    await j.command(page.locator('form').filter({has:page.getByLabel('Name',{exact:true})}).getByRole('button',{name:'Save view',exact:true}),'view.save')
    const open=async()=>{await page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Site schedule',exact:true}).click();await page.getByRole('region',{name:'month calendar'}).waitFor();await page.getByRole('status').filter({hasText:'1 records in this period'}).waitFor()}
    await open()
    assert.equal(await page.locator(`[data-calendar-record="${created.id}"]`).count(),3)
    await j.capture('calendar-month')
    for(const layout of ['Week','Day']){await page.getByRole('group',{name:'Calendar layout'}).getByRole('button',{name:layout,exact:true}).click();await page.getByRole('region',{name:`${layout.toLowerCase()} calendar`}).waitFor();await j.capture(`calendar-${layout.toLowerCase()}`)}
    await page.getByRole('group',{name:'Calendar layout'}).getByRole('button',{name:'Month',exact:true}).click()
    const patch=()=>page.waitForResponse(r=>r.url().endsWith('/commands/record.patch')&&r.request().method()==='POST')
    let response
    if(width===1440){const pending=patch();await page.locator(`[data-calendar-date="2026-10-19"] [data-calendar-record="${created.id}"]`).dragTo(page.locator('[data-calendar-date="2026-10-23"]'));response=await pending}
    else{await page.getByRole('button',{name:`Move record ${created.id}`,exact:true}).first().click();await page.getByLabel('New start date',{exact:true}).fill('2026-10-23');const pending=patch();await page.getByRole('button',{name:'Move record',exact:true}).click();response=await pending}
    assert.equal(response.status(),200,await response.text())
    const get=async()=> (await call(base+'/records/'+created.id)).record
    assert.equal((await get()).fields[start.id].value,'2026-10-23');assert.equal((await get()).fields[end.id].value,'2026-10-25')
    await page.locator(`[data-calendar-date="2026-10-23"] [data-calendar-record="${created.id}"]`).waitFor()
    await j.capture('calendar-moved')
    const editing=page.getByRole('group',{name:'Record editing',exact:true})
    const undo=patch();await editing.getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await undo).status(),200)
    assert.equal((await get()).fields[start.id].value,'2026-10-19');assert.equal((await get()).fields[end.id].value,'2026-10-21')
    const redo=patch();await editing.getByRole('button',{name:'Redo',exact:true}).click();assert.equal((await redo).status(),200)
    assert.equal((await get()).fields[start.id].value,'2026-10-23');assert.equal((await get()).fields[end.id].value,'2026-10-25')
    await page.locator(`[data-calendar-date="2026-10-23"] [data-calendar-record="${created.id}"]`).waitFor()
    await page.locator(`[data-calendar-date="2026-10-23"] [data-calendar-record="${created.id}"]`).getByRole('link',{name:'Acme site visit',exact:true}).click()
    await page.getByRole('heading',{name:'Acme site visit',exact:true}).waitFor()
    await page.goto(tablePath);await open()
    await page.getByRole('button',{name:'Calendar subscription',exact:true}).click()
    const issued=page.waitForResponse(r=>r.url().endsWith('/calendar-feed')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create subscription link',exact:true}).click();assert.equal((await issued).status(),200)
    const url=await page.getByLabel('Subscription URL (shown once)',{exact:true}).inputValue()
    const feed=await fetch(url);assert.equal(feed.status,200);assert.match(await feed.text(),/Acme site visit/)
    await page.getByRole('button',{name:'Revoke subscription',exact:true}).click();await page.getByText('Revoked',{exact:false}).waitFor();assert.equal((await fetch(url)).status,404)
    await j.capture('calendar-subscription-revoked')
    await page.getByRole('button',{name:'Calendar subscription',exact:true}).click()
    // Retain a move draft while another writer changes its source version.
    await page.getByRole('button',{name:`Move record ${created.id}`,exact:true}).first().click()
    const current=await get()
    await call('/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref:current.ref,version:current.version}],input:{appId,entityId,rows:[{recordId:current.id,changes:{[start.id]:'2026-10-24',[end.id]:'2026-10-26'}}]}})
    await page.getByLabel('New start date',{exact:true}).fill('2026-10-27')
    const refused=patch();await page.getByRole('button',{name:'Move record',exact:true}).click();assert.equal((await refused).status(),409)
    assert.equal((await get()).fields[start.id].value,'2026-10-24')
    await page.getByRole('button',{name:'Cancel move',exact:true}).click()
    await j.capture('calendar-conflict')
    const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),rules=JSON.parse(policy.rules_json)
    for(const rule of rules)if(rule.entityId===entityId){rule.writableFields=[];rule.actions=rule.actions.filter(action=>action!=='record.patch')}
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
    await page.goto(tablePath);await open()
    assert.equal(await page.locator('[data-calendar-record][draggable="true"]').count(),0)
    assert.equal(await page.getByRole('button',{name:'Move date',exact:true}).count(),0)
    await j.capture('calendar-readonly')
    const instantBase=`/api/v1/apps/${appId}/entities/${instantId}`,instantSchema=await call(instantBase)
    const appointment=(await call('/api/v1/commands/record.create',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:instantId},version:instantSchema.version}],input:{appId,entityId:instantId,values:{[instantTitle.id]:'Morning inspection',[instantStart.id]:'2026-03-07T14:00:00.000Z',[instantEnd.id]:'2026-03-07T15:00:00.000Z'}}})).value
    await call('/api/v1/commands/record.create',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:instantId},version:instantSchema.version}],input:{appId,entityId:instantId,values:{[instantTitle.id]:'Following month inspection',[instantStart.id]:'2026-04-06T13:00:00.000Z',[instantEnd.id]:'2026-04-06T14:00:00.000Z'}}})
    await call('/api/v1/commands/view.save',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:instantId},version:instantSchema.version}],input:{view:{appId,entityId:instantId,name:'Appointments calendar',display:'calendar',fields:[instantTitle.id,instantStart.id,instantEnd.id],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:instantTitle.id,startFieldId:instantStart.id,endFieldId:instantEnd.id},visibility:'private',shipped:false}}})
    await page.goto(`${h.origin}/app/records/${appId}/${instantId}`)
    await page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Appointments calendar',exact:true}).click()
    await page.locator(`[data-calendar-date="2026-03-07"] [data-calendar-record="${appointment.id}"]`).waitFor()
    await page.getByRole('button',{name:`Move record ${appointment.id}`,exact:true}).click();await page.getByLabel('New start date',{exact:true}).fill('2026-03-09')
    const moved=patch();await page.getByRole('button',{name:'Move record',exact:true}).click();assert.equal((await moved).status(),200)
    const after=(await call(instantBase+'/records/'+appointment.id)).record
    assert.equal(after.fields[instantStart.id].value,'2026-03-09T13:00:00.000Z');assert.equal(after.fields[instantEnd.id].value,'2026-03-09T14:00:00.000Z')
    await page.locator(`[data-calendar-date="2026-03-09"] [data-calendar-record="${appointment.id}"]`).waitFor()
    await page.getByRole('status').filter({hasText:'1 records in this period'}).waitFor()
    assert.equal(await page.locator('[data-calendar-record]').count(),1)
    await j.capture('calendar-instant-dst')
   }finally{await context.close()}
  }
 }finally{await browser?.close();await h?.close()}
 await galleryBrowserJourney()
 await extendedBoardJourney()
 await viewSettingsJourney()
})
