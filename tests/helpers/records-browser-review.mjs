import {recordsBrowserWidths} from './records-browser-widths.mjs'
import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {accessibilityContextOptions,accessibilityWidths} from './accessibility-evidence.mjs'
import {retainedLaunch} from './records-browser-retained.mjs'
import {LAUNCH_APP_ID,launchEntities} from '../../src/apps/launch/contracts.ts'
import {campaignLifecycle} from '../../src/apps/launch/lifecycle.ts'
import {createUlid} from '../../src/core/shared/ids.ts'

async function chooserHidden(page){
 assert.equal(await page.getByRole('navigation',{name:'Application records',exact:true}).count(),0)
 assert.equal(await page.getByRole('navigation',{name:'Record types',exact:true}).count(),0)
 assert.equal(await page.getByRole('heading',{name:'Choose an application',exact:true}).count(),0)
}
async function checkboxGeometry(label){
 const geometry=await label.evaluate(element=>{const box=element.getBoundingClientRect(),input=element.querySelector('input').getBoundingClientRect();return {height:box.height,width:input.width,inputHeight:input.height,center:Math.abs(input.y+input.height/2-box.y-box.height/2)}})
 assert.ok(geometry.height>=44,JSON.stringify(geometry));assert.equal(geometry.width,20);assert.equal(geometry.inputHeight,20);assert.ok(geometry.center<=1,JSON.stringify(geometry))
}
async function templateChoices(page,j,origin){
 const region=()=>page.getByRole('region',{name:'Start from a template',exact:true})
 const readApps=async()=>{const response=await page.request.get(origin+'/api/v1/apps');assert.equal(response.status(),200);return(await response.json()).data.items}
 const before=await readApps()
 for(const name of ['Customer relationships','Project tracker']){
  await j.action(region().getByRole('button',{name:`Use ${name}`,exact:true}))
  await chooserHidden(page)
  assert.equal(await page.getByLabel('Base name',{exact:true}).inputValue(),name,'A manual template must open its named schema draft')
  await page.getByRole('navigation',{name:'Schema tables',exact:true}).waitFor()
  await j.action(page.getByRole('button',{name:'Cancel schema changes',exact:true}))
  await region().waitFor()
 }
 const included=region().getByRole('link',{name:'Use Launch readiness',exact:true}),href=await included.getAttribute('href')
 const existing=before.find(app=>app.entryUrl===href)
 assert.ok(existing,'The included template must target an existing authorized base')
 await j.action(included)
 await page.waitForURL(new URL(href,origin).href)
 const selected=page.getByRole('navigation',{name:'Application records',exact:true}).getByRole('link',{name:existing.name,exact:true})
 await selected.waitFor();assert.equal(await selected.getAttribute('aria-current'),'page')
 await page.getByRole('navigation',{name:'Record types',exact:true}).waitFor()
 assert.deepEqual((await readApps()).map(app=>app.id),before.map(app=>app.id),'Using or cancelling a template must preserve the existing bases')
 await page.goto(origin+'/app/records');await region().waitFor()
}
export async function homeBases(page,origin){
 const response=await page.request.get(origin+'/api/v1/apps');assert.equal(response.status(),200)
 const apps=(await response.json()).data.items,bases=page.getByRole('region',{name:'Your bases',exact:true})
 await bases.waitFor()
 for(const base of apps){const link=bases.getByRole('link',{name:base.name,exact:true});await link.waitFor();assert.equal(await link.getAttribute('href'),base.entryUrl)}
 assert.equal(await bases.getByRole('listitem').count(),apps.length,'Home lists every authorized base once')
 await page.getByRole('region',{name:'Recent activity',exact:true}).waitFor()
 return apps
}
async function openRecords(page,j){
 let link=page.getByRole('navigation',{name:'Operator navigation',exact:true}).getByRole('link',{name:'Records',exact:true}).filter({visible:true})
 if(!await link.count()){await j.action(page.getByRole('button',{name:'Open navigation',exact:true}));link=page.getByRole('dialog',{name:'Navigation',exact:true}).getByRole('link',{name:'Records',exact:true})}
 await j.action(link)
}
export async function homeReview(output){
 let h,browser
 const receipts=[]
 try{
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of recordsBrowserWidths(accessibilityWidths)){
   h=await recordsBrowserRuntime(Number(process.env.CRADLE_RECORDS_PORT ?? 0))
   const context=await browser.newContext(accessibilityContextOptions({viewport:{width,height:width===390?844:900}})),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   await context.addCookies([{name: h.cookie.split('=')[0], value: h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}]);await page.goto(h.origin+'/app');const initialBases=await homeBases(page,h.origin);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM manual_record_bases').first()).n,0)
   const membership=await h.db.prepare('SELECT principal_id,state FROM authority_memberships WHERE app_id=?').bind(LAUNCH_APP_ID).first();assert.ok(membership)
   await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=? AND app_id=?").bind(membership.principal_id,LAUNCH_APP_ID).run()
   try{
    await page.goto(h.origin+'/app');assert.deepEqual(await homeBases(page,h.origin),[],'Removing the only base membership leaves real discovery empty')
    const empty=page.getByRole('region',{name:'Your bases',exact:true}),create=empty.getByRole('button',{name:'New base',exact:true})
    await create.waitFor();assert.equal(await empty.locator('a,button').count(),1,'The empty base list has one way to start');await j.capture('empty-home')
    await j.action(create);await page.getByLabel('Base name',{exact:true}).waitFor();await j.capture('empty-home-builder');await j.action(page.getByRole('button',{name:'Cancel schema changes',exact:true}));await create.waitFor()
    assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM manual_record_bases').first()).n,0,'Cancelling a new base leaves the empty installation intact')
   }finally{
    await h.db.prepare('UPDATE authority_memberships SET state=?,version=version+1 WHERE principal_id=? AND app_id=?').bind(membership.state,membership.principal_id,LAUNCH_APP_ID).run()
   }
   await page.goto(h.origin+'/app');assert.deepEqual((await homeBases(page,h.origin)).map(base=>base.id),initialBases.map(base=>base.id),'Restoring membership restores the original authorized bases')
   assert.equal(await page.getByRole('region',{name:'Your bases',exact:true}).getByRole('link',{name:'App studio',exact:true}).count(),0,'App studio is not mixed into the base list')
   await j.capture('fresh-home');await openRecords(page,j);await page.getByRole('button',{name:'Create base',exact:true}).waitFor()
   const choose=await page.getByRole('heading',{name:'Choose an application',exact:true}).boundingBox(),templates=page.getByRole('region',{name:'Start from a template',exact:true}),t=await templates.boundingBox()
   assert.ok(t.y>=choose.y+choose.height,JSON.stringify({choose,t}));await templateChoices(page,j,h.origin)
   await j.action(page.getByRole('button',{name:'Create base',exact:true}));await chooserHidden(page);await j.action(page.getByRole('button',{name:'Cancel schema changes',exact:true}));await page.getByRole('navigation',{name:'Application records',exact:true}).waitFor();await j.capture('base-actions')
   await j.action(page.getByRole('button',{name:'Create base',exact:true}));await page.getByLabel('Base name',{exact:true}).fill(`Home records ${width}`);await page.getByLabel('Table name',{exact:true}).fill('Notes');await page.getByLabel('Field name',{exact:true}).fill('Note')
   const base=await j.adopt(),record=await j.record({Note:`Existing record ${width}`})
   await page.goto(h.origin+'/app');const native=(await homeBases(page,h.origin)).find(app=>app.id===base.appId);assert.ok(native);assert.equal(native.tableCount,1);assert.equal(native.recordCount,1);assert.equal(native.latestChange.name,`Existing record ${width}`)
   const entitiesReply=await page.request.get(`${h.origin}/api/v1/apps/${base.appId}/entities`);assert.equal(entitiesReply.status(),200);const entity=(await entitiesReply.json()).data.items.find(entity=>entity.id===record.ref.entityId);assert.ok(entity,'The created record identifies its own table')
   const csrfReply=await page.request.get(h.origin+'/auth/csrf');assert.equal(csrfReply.status(),200);const {csrfToken}=await csrfReply.json()
   const queryReply=await page.request.post(`${h.origin}/api/v1/apps/${base.appId}/entities/${entity.id}/query`,{headers:{origin:h.origin,'x-csrf-token':csrfToken},data:{}});assert.equal(queryReply.status(),200)
   const visible=(await queryReply.json()).data;assert.equal(native.recordCount,visible.total.value,'Discovery counts exactly the records available through the current query door');assert.equal(native.latestChange.id,visible.items[0].id);assert.equal(native.latestChange.href,`/app/records/${base.appId}/${entity.id}/${visible.items[0].id}`)
   await page.getByRole('region',{name:'Recent activity',exact:true}).getByText(native.latestChange.name,{exact:true}).waitFor();await j.capture('records-only-home')
   await j.action(page.getByRole('region',{name:'Your bases',exact:true}).getByRole('link',{name:`Home records ${width}`,exact:true}));await j.table('Notes');await page.getByRole('link',{name:`Existing record ${width}`,exact:true}).waitFor()
   const verifyLaunch=await retainedLaunch(page,j,h,width);await verifyLaunch();await page.goto(h.origin+'/app');const current=await homeBases(page,h.origin);assert.ok(current.some(app=>app.id===base.appId));assert.ok(current.some(app=>app.name==='Launch readiness'));assert.equal(await page.getByRole('region',{name:'Your bases',exact:true}).getByRole('link',{name:`Home records ${width}`,exact:true}).getAttribute('href'),base.entryUrl??`/app/records/${base.appId}`);await j.capture('records-and-launch-home')
   if(width===1440){
    const sessionReply=await page.request.get(h.origin+'/api/session');assert.equal(sessionReply.status(),200);const owner=(await sessionReply.json()).operator.id
    const command=async(action,input,expected=[])=>{
     const response=await page.request.post(h.origin+'/api/v1/commands/'+action,{headers:{origin:h.origin,'x-csrf-token':csrfToken},data:{commandId:createUlid(),input,expected}})
     const reply=await response.json();assert.equal(response.status(),200,JSON.stringify(reply));assert.equal(reply.data.state,'committed',JSON.stringify(reply));return reply.data.value
    }
    const campaigns=[]
    for(let index=0;index<11;index++)campaigns.push(await command('launch.campaign.create',{fields:{code:`HOME-MERGE-${width}-${index}`,name:`Home activity campaign ${index+1}`,ownerId:owner,startDate:'2026-01-01',launchDate:'2027-01-01',objective:'Before activity merge review',statusSummary:'Current',phase:campaignLifecycle.phases[0],status:campaignLifecycle.statuses[0],health:50,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}}))
    // Creates emit a fact per field. One-field edits produce eleven distinct
    // recent events, so the portfolio read includes more changes than Home shows.
    const writes=[]
    for(const [index,campaign]of campaigns.entries()){
     const changed=await command('launch.campaign.patch',{id:campaign.id,changes:{objective:`Reviewed activity merge ${index+1}`}},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:campaign.id},version:campaign.version}])
     writes.push({name:campaign.name,occurredAt:changed.updatedAt})
     if(index===5){
      const title=`Merged native change ${width}`,changed=await command('record.patch',{ref:visible.items[0].ref,changes:{[entity.fields[0].id]:title}},[{ref:visible.items[0].ref,version:visible.items[0].version}])
      writes.push({name:title,occurredAt:changed.updatedAt})
     }
    }
    await page.goto(h.origin+'/app');await homeBases(page,h.origin);await page.waitForLoadState('networkidle')
    const shown=await page.getByRole('region',{name:'Recent activity',exact:true}).getByRole('listitem').evaluateAll(rows=>rows.map(row=>({name:row.querySelector('strong')?.textContent,occurredAt:row.querySelector('time')?.getAttribute('datetime')})))
    assert.deepEqual(shown,writes.slice(-10).reverse(),'Home merges native and launch changes by recency and shows only the newest ten')
    await j.capture('home-newest-ten')
   }
   receipts.push({width,baseId:base.appId,recordId:record.id,emptyHomeExercised:true,homeSummaryMatchesQuery:true,newestTenMergeExercised:width===1440,checkpoints:j.checkpoints});await context.close();await h.close();h=null
  }
  return receipts
 }finally{await browser?.close();await h?.close()}
}
export async function builderReview(page,j){
 await chooserHidden(page)
 const selected=page.getByRole('navigation',{name:'Schema tables'}).getByRole('button',{name:'Deals',exact:true});assert.equal(await selected.getAttribute('aria-pressed'),'true');assert.equal(await selected.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(215, 242, 91)')
 const choice=page.getByRole('group',{name:'Deal',exact:true}).locator('label.cr-choice').filter({has:page.getByRole('checkbox',{name:'Required',exact:true})});await checkboxGeometry(choice);await j.setChecked(choice.getByRole('checkbox'),true);assert.equal(await choice.getByRole('checkbox').isChecked(),true);await j.setChecked(choice.getByRole('checkbox'),false);assert.equal(await choice.getByRole('checkbox').isChecked(),false)
}
export async function impactReview(page,j){
 await chooserHidden(page)
 const label=page.locator('label.cr-choice').filter({hasText:'I reviewed the data changes and owner access.'});await checkboxGeometry(label)
 await j.setChecked(label.getByRole('checkbox'),true);assert.equal(await label.getByRole('checkbox').isChecked(),true);await j.setChecked(label.getByRole('checkbox'),false);assert.equal(await label.getByRole('checkbox').isChecked(),false)
 const impact=await page.getByRole('article').allTextContents();assert.doesNotMatch(impact.join('\n'),/\((relation|boolean|url)\)/)
 assert.match(await page.locator('.cr-records-page').innerText(),/owner access/)
}
export async function gridReview(page,j){
 const grid=page.locator('table.cr-table');await grid.getByRole('columnheader',{name:'Deal',exact:true}).waitFor();assert.equal(await grid.getByRole('columnheader',{name:'Record',exact:true}).count(),0);assert.equal(await grid.getByRole('columnheader',{name:'Deal',exact:true}).count(),1)
 const row=grid.getByRole('row').filter({has:page.getByRole('link',{name:'First deal',exact:true})});assert.equal((await row.innerText()).split('First deal').length-1,1)
 const selected=page.getByRole('navigation',{name:'Record types'}).getByRole('link',{name:'Deals',exact:true});assert.equal(await selected.getAttribute('aria-current'),'page');assert.equal(await selected.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(215, 242, 91)')
 const active=page.getByRole('navigation',{name:'Application records'}).locator('[aria-current="page"]');assert.equal(await active.count(),1);assert.equal(await active.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(215, 242, 91)')
 await j.setChecked(row.getByRole('checkbox'),true);await page.getByRole('button',{name:'Edit 1 selected',exact:true}).waitFor();await j.setChecked(row.getByRole('checkbox'),false)
}
export async function detailReview(page){
 const back=await page.getByRole('link',{name:'← Back to records',exact:true}).boundingBox(),heading=await page.getByRole('heading',{level:1}).boundingBox();assert.ok(heading.y-(back.y+back.height)>=24,JSON.stringify({back,heading}))
 const labels=await page.locator('dl dt').allTextContents(),relations=await page.locator('section.cr-section h2').allTextContents();assert.equal(labels.some(label=>relations.includes(label)),false)
}
export async function boardReview(page){
 const result=page.locator('.cr-saved-view-result'),heading=await result.getByRole('heading',{name:'Sales pipeline',exact:true}).boundingBox(),edit=await page.getByRole('button',{name:'Edit view',exact:true}).boundingBox();assert.ok(heading.y-(edit.y+edit.height)>=20,JSON.stringify({heading,edit}))
}
export async function gridEdgeReview(page,j,origin,width){
 await page.goto(origin+'/app/records');await j.action(page.getByRole('button',{name:'Create base',exact:true}));await page.getByLabel('Base name',{exact:true}).fill(`Title presentation ${width}`);await page.getByLabel('Table name',{exact:true}).fill('Titles');await page.getByLabel('Field name',{exact:true}).fill('Title');await j.field('Other text');const columnTitles=['A long board column title with enough words to wrap within its own column', 'UnbrokenColumnTitle'.repeat(10)];await j.field('Stage','select',async e=>e.getByLabel('Options (one per line)').fill(['Open','Done',...columnTitles].join('\n')))
 await j.action(page.getByRole('button',{name:'Add table',exact:true}));await page.getByLabel('Table name',{exact:true}).fill('Numbers');await page.getByLabel('Field name',{exact:true}).fill('Amount');await page.getByLabel('Field type',{exact:true}).selectOption('number');await j.adopt();await j.table('Titles')
 await j.record({'Other text':'Secondary value',Stage:{select:'Open'}});await page.getByRole('link',{name:'Record without a title',exact:true}).waitFor();assert.equal(await page.locator('table').getByRole('columnheader',{name:'Record',exact:true}).count(),0)
 const titles=['A long record title with enough words to wrap across several lines within a board card', 'UnbrokenTitle'.repeat(18)]
 for(const title of titles)await j.record({Title:title,Stage:{select:'Open'}})
 await page.waitForLoadState('networkidle');await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'))
 await j.action(page.getByText('Visible columns',{exact:true}));const columns=page.getByRole('group',{name:'Visible columns',exact:true});await j.setChecked(columns.getByLabel('Title',{exact:true}),false)
 assert.equal(await page.locator('table').getByRole('columnheader',{name:'Title',exact:true}).count(),0);assert.equal(await page.locator('table').getByRole('link',{name:'Open record',exact:true}).count(),3);assert.doesNotMatch(await page.locator('table').innerText(),/UnbrokenTitle/)
 const download=page.waitForEvent('download');await j.action(page.getByRole('button',{name:'Export CSV',exact:true}));const file=await download;const {readFile}=await import('node:fs/promises'),{parseCsv}=await import('../../src/domains/portability/csv.ts');const csv=parseCsv(new Uint8Array(await readFile(await file.path())));assert.deepEqual(csv.headers,['Other text','Stage']);assert.equal(csv.rows.length,3)
 await j.setChecked(columns.getByLabel('Title',{exact:true}),true);for(const title of titles){const cell=page.locator('table').getByRole('row').filter({has:page.getByRole('link',{name:title,exact:true})}).locator('td').nth(1);const geometry=await cell.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry))}await j.action(page.getByRole('button',{name:'Save view',exact:true}));const editor=page.locator('form.cr-card').filter({has:page.getByRole('heading',{name:'Save this work view'})});await editor.getByLabel('Name',{exact:true}).fill('Long titles');await editor.getByLabel('Display',{exact:true}).selectOption('board');await editor.getByLabel('Columns',{exact:true}).selectOption({label:'Stage'});const board=await j.command(editor.getByRole('button',{name:'Save view',exact:true}),'view.save')
 await page.reload();await j.action(page.getByRole('navigation',{name:'Saved views',exact:true}).getByRole('button',{name:board.name,exact:true}));const region=page.getByRole('region',{name:'Long titles board; scroll for columns'});await region.waitFor()
 for(const title of titles){const heading=region.getByRole('heading',{name:title,exact:true});const geometry=await heading.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,height:e.getBoundingClientRect().height,lineHeight:Number.parseFloat(getComputedStyle(e).lineHeight)}));assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));assert.ok(geometry.height>geometry.lineHeight*1.5,JSON.stringify(geometry))}
 await j.capture('kanban-long-card-titles');for(const title of columnTitles){const heading=region.getByRole('heading',{name:title,exact:true});await heading.scrollIntoViewIfNeeded();const geometry=await heading.evaluate(e=>{const column=e.parentElement.getBoundingClientRect(),box=e.getBoundingClientRect(),region=e.closest('.cr-board').getBoundingClientRect();return {width:e.clientWidth,scroll:e.scrollWidth,height:box.height,lineHeight:Number.parseFloat(getComputedStyle(e).lineHeight),left:box.left,right:box.right,columnLeft:column.left,columnRight:column.right,regionLeft:region.left,regionRight:region.right}});assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));assert.ok(geometry.height>geometry.lineHeight*1.5,JSON.stringify(geometry));assert.ok(geometry.left>=geometry.columnLeft-1&&geometry.right<=geometry.columnRight+1,JSON.stringify(geometry));assert.ok(geometry.columnLeft>=geometry.regionLeft-1&&geometry.columnRight<=geometry.regionRight+1,JSON.stringify(geometry));await j.capture(`kanban-long-column-${columnTitles.indexOf(title)}`)}await j.capture('kanban-long-titles');await j.action(page.getByRole('navigation',{name:'Record display',exact:true}).getByRole('button',{name:'Grid',exact:true}));await j.table('Numbers');await j.record({Amount:'7'});await page.getByRole('link',{name:'Open record',exact:true}).waitFor();assert.equal(await page.locator('table').getByRole('columnheader',{name:'Record',exact:true}).count(),1);await j.action(page.getByRole('link',{name:'Open record',exact:true}));await page.getByRole('heading',{name:'Record without a title',exact:true}).waitFor();await detailReview(page);await j.capture('record-no-text')
}
