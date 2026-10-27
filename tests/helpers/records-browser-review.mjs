import {displayAction,tableAction} from './records-table-tools.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {baseAction,baseMenu,chooseBase} from './records-base-menu.mjs'
import {recordsBrowserWidths} from './records-browser-widths.mjs'
import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {accessibilityContextOptions,accessibilityWidths} from './accessibility-evidence.mjs'
import {retainedLaunch} from './records-browser-retained.mjs'

async function chooserHidden(page){
 assert.equal(await page.getByRole('navigation',{name:'Application records',exact:true}).count(),0)
 assert.equal(await page.locator('.cr-view-bar__pills').count(),0)
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
  await baseAction(page,'New base',j.action);await region().waitFor()
 }
 const included=region().getByRole('link',{name:'Use Launch readiness',exact:true}),href=await included.getAttribute('href')
 const existing=before.find(app=>app.entryUrl===href)
 assert.ok(existing,'The included template must target an existing authorized base')
 await j.action(included)
 await page.waitForURL(url=>url.pathname.startsWith(new URL(href,origin).pathname+'/'))
 const menu=await baseMenu(page,j.action),selected=menu.getByRole('link',{name:existing.name,exact:true})
 await selected.waitFor();assert.equal(await selected.getAttribute('aria-current'),'page')
 await j.action(menu.getByRole('button',{name:'Edit fields',exact:true}));const fields=page.getByRole('dialog',{name:'Edit fields',exact:true});await fields.getByLabel('Field name',{exact:true}).waitFor();await page.waitForLoadState('networkidle');assert.equal(await fields.getByLabel('Field name',{exact:true}).isEditable(),true);assert.equal(await fields.locator('.cr-state[aria-busy=false]').count(),0);await j.capture('launch-edit-fields');await j.action(fields.getByRole('button',{name:'Close',exact:true}));await page.locator('.cr-view-bar').waitFor()
 await baseAction(page,'People',j.action);const people=page.getByRole('dialog',{name:'People',exact:true});await people.getByLabel('Application',{exact:true}).selectOption(existing.id);await people.getByRole('region',{name:'Workspace members',exact:true}).locator('tbody tr').first().waitFor();assert.ok(await people.locator('tbody tr').count()>0);await j.capture('launch-people');await j.action(people.getByRole('button',{name:'Close',exact:true}))
 assert.deepEqual((await readApps()).map(app=>app.id),before.map(app=>app.id),'Using or cancelling a template must preserve the existing bases')
 await page.goto(origin+'/app/records');await page.getByRole('button',{name:/^Base ▾/}).waitFor()
}
export async function homeReview(output){
 let h,browser
 const receipts=[]
 try{
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of recordsBrowserWidths(accessibilityWidths)){
   h=await recordsBrowserRuntime(Number(process.env.CRADLE_RECORDS_PORT ?? 0))
   const context=await browser.newContext(accessibilityContextOptions({viewport:{width,height:width===390?844:900}})),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   await context.addCookies([{name: h.cookie.split('=')[0], value: h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}]);await page.goto(h.origin+'/app');await page.getByRole('heading',{name:'Your business, organised your way.',exact:true}).waitFor();assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM manual_record_bases').first()).n,0)
   assert.doesNotMatch(await page.locator('main').innerText(),/NO RECORDS|Start with your first base|Launch readiness|campaign activity|milestones|decisions/i)
   assert.equal(await page.locator('.cr-home-records .cr-eyebrow').evaluate(e=>getComputedStyle(e).color),'rgb(63, 107, 54)')
   await j.capture('fresh-home');await j.action(page.getByRole('link',{name:'Open records',exact:true}));await page.getByRole('button',{name:/^Base ▾/}).waitFor()
   assert.equal(await page.getByRole('heading',{name:'Choose an application',exact:true}).count(),0);await baseAction(page,'New base',j.action);await templateChoices(page,j,h.origin)
   await baseAction(page,'New base',j.action);await chooserHidden(page);await j.action(page.getByRole('button',{name:'Cancel schema changes',exact:true}));await page.getByRole('button',{name:/^Base ▾/}).waitFor();await j.capture('base-actions')
   await baseAction(page,'New base',j.action);await page.getByLabel('Base name',{exact:true}).fill(`Home records ${width}`);await page.getByLabel('Table name',{exact:true}).fill('Notes');await page.getByLabel('Field name',{exact:true}).fill('Note')
   const base=await j.adopt(),record=await j.record({Note:`Existing record ${width}`})
   await page.goto(h.origin+'/app');await page.getByRole('heading',{name:'Your business, organised your way.',exact:true}).waitFor();assert.doesNotMatch(await page.locator('main').innerText(),/NO RECORDS|Start with your first base|Launch readiness|campaign activity|milestones|decisions/i);await j.capture('records-only-home')
   await j.action(page.getByRole('link',{name:'Open records',exact:true}));await chooseBase(page,`Home records ${width}`,j.action);await j.table('Notes');await page.getByRole('link',{name:`Existing record ${width}`,exact:true}).waitFor()
   await entryCases(page,j,h,browser,base.appId,width,output)
   const verifyLaunch=await retainedLaunch(page,j,h,width);await verifyLaunch();await page.goto(h.origin+'/app');await page.getByText('Launch readiness template',{exact:true}).waitFor();assert.equal(await page.locator('.portfolio-metric-grid .portfolio-metric').count(),4);assert.equal(await page.getByRole('link',{name:'Open records',exact:true}).count(),1);await j.capture('records-and-launch-home')
   receipts.push({width,baseId:base.appId,recordId:record.id,checkpoints:j.checkpoints});await context.close();await h.close();h=null
  }
  return receipts
 }finally{await browser?.close();await h?.close()}
}
async function entryCases(page,j,h,browser,lastBase,width,output) {
 await page.goto(h.origin+'/app/records');await page.waitForURL(url=>url.pathname.startsWith(`/app/records/${lastBase}/`));await page.getByRole('button',{name:'New record',exact:true}).waitFor()
 const menu=await baseMenu(page,j.action);await j.action(menu.getByRole('button',{name:'Close',exact:true}))
 const apps=await(await page.request.get(h.origin+'/api/v1/apps')).json()
 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('cradle.lastBase.'))localStorage.removeItem(key);location.assign('/app/records')})
 await page.waitForURL(url=>url.pathname.startsWith(`/app/records/${apps.data.items[0].id}/`));await page.getByRole('button',{name:'New record',exact:true}).waitFor()
 assert.equal(await page.getByRole('heading',{name:'Choose an application',exact:true}).count(),0)
 await chooseBase(page,`Home records ${width}`,j.action)
 const id=createUlid(),now=Date.now()
 await h.db.prepare('INSERT INTO operators(id,created_at,updated_at,name,email,active) VALUES(?,?,?,?,?,1)').bind(id,now,now,'New teammate',`empty-${width}@records.example.test`).run()
 await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',0,?,?)").bind(id,id,now,now).run()
 const auth=await createFixtureAuth(h.db,{appOrigin:h.origin,sessionSecret:'test-only-records-session-secret-at-least-32-characters',mode:'development'},id),{cookie}=await auth.signIn(id)
 const emptyContext=await browser.newContext({viewport:{width,height:width===390?844:900}})
 try {
  await emptyContext.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:h.origin}])
  const empty=await emptyContext.newPage(),ej=recordsJourney(empty,h.origin,output,width)
  await empty.goto(h.origin+'/app/records');await empty.getByLabel('Base name',{exact:true}).waitFor()
  assert.deepEqual((await(await empty.request.get(h.origin+'/api/v1/apps')).json()).data.items,[])
  assert.equal(await empty.getByRole('heading',{name:'Choose an application',exact:true}).count(),0)
  await ej.capture('records-with-no-bases');await baseAction(empty,'Import a base',ej.action);await empty.getByRole('button',{name:'Preview import',exact:true}).waitFor()
 } finally {await emptyContext.close()}
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
 const selected=page.locator('.cr-view-bar__pills a').filter({hasText:/^Deals$/});assert.equal(await selected.getAttribute('aria-current'),'page');assert.equal(await selected.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(215, 242, 91)')
 const menu=await baseMenu(page,j.action),active=menu.locator('[aria-current="page"]');assert.equal(await active.count(),1);assert.equal(await active.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(215, 242, 91)');await j.action(menu.getByRole('button',{name:'Close',exact:true}))
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
 await page.goto(origin+'/app/records');await baseAction(page,'New base',j.action);await page.getByLabel('Base name',{exact:true}).fill(`Title presentation ${width}`);await page.getByLabel('Table name',{exact:true}).fill('Titles');await page.getByLabel('Field name',{exact:true}).fill('Title');await j.field('Other text');const columnTitles=['A long board column title with enough words to wrap within its own column', 'UnbrokenColumnTitle'.repeat(10)];await j.field('Stage','select',async e=>e.getByLabel('Options (one per line)').fill(['Open','Done',...columnTitles].join('\n')))
 await j.action(page.getByRole('button',{name:'Add table',exact:true}));await page.getByLabel('Table name',{exact:true}).fill('Numbers');await page.getByLabel('Field name',{exact:true}).fill('Amount');await page.getByLabel('Field type',{exact:true}).selectOption('number');await j.adopt();await j.table('Titles')
 await j.record({'Other text':'Secondary value',Stage:{select:'Open'}});await page.getByRole('link',{name:'Record without a title',exact:true}).waitFor();assert.equal(await page.locator('table').getByRole('columnheader',{name:'Record',exact:true}).count(),0)
 const titles=['A long record title with enough words to wrap across several lines within a board card', 'UnbrokenTitle'.repeat(18)]
 for(const title of titles)await j.record({Title:title,Stage:{select:'Open'}})
 await page.waitForLoadState('networkidle');await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'))
 await tableAction(page,'Visible columns',j.action);const columns=page.getByRole('group',{name:'Visible columns',exact:true});await j.setChecked(columns.getByLabel('Title',{exact:true}),false)
 assert.equal(await page.locator('table').getByRole('columnheader',{name:'Title',exact:true}).count(),0);assert.equal(await page.locator('table').getByRole('link',{name:'Open record',exact:true}).count(),3);assert.doesNotMatch(await page.locator('table').innerText(),/UnbrokenTitle/)
 const download=page.waitForEvent('download');await tableAction(page,'Export CSV',j.action);const file=await download;const {readFile}=await import('node:fs/promises'),{parseCsv}=await import('../../src/domains/portability/csv.ts');const csv=parseCsv(new Uint8Array(await readFile(await file.path())));assert.deepEqual(csv.headers,['Other text','Stage']);assert.equal(csv.rows.length,3)
 await tableAction(page,'Visible columns',j.action);await j.setChecked(columns.getByLabel('Title',{exact:true}),true);for(const title of titles){const cell=page.locator('table').getByRole('row').filter({has:page.getByRole('link',{name:title,exact:true})}).locator('td').nth(1);const geometry=await cell.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry))}await tableAction(page,'Save view',j.action);const editor=page.locator('form.cr-card').filter({has:page.getByRole('heading',{name:'Save this work view'})});await editor.getByLabel('Name',{exact:true}).fill('Long titles');await editor.getByLabel('Display',{exact:true}).selectOption('board');await editor.getByLabel('Columns',{exact:true}).selectOption({label:'Stage'});const board=await j.command(editor.getByRole('button',{name:'Save view',exact:true}),'view.save')
 await page.reload();await displayAction(page,board.name,j.action);const region=page.getByRole('region',{name:'Long titles board; scroll for columns'});await region.waitFor()
 for(const title of titles){const heading=region.getByRole('heading',{name:title,exact:true});const geometry=await heading.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,height:e.getBoundingClientRect().height,lineHeight:Number.parseFloat(getComputedStyle(e).lineHeight)}));assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));assert.ok(geometry.height>geometry.lineHeight*1.5,JSON.stringify(geometry))}
 await j.capture('kanban-long-card-titles');for(const title of columnTitles){const heading=region.getByRole('heading',{name:title,exact:true});await heading.scrollIntoViewIfNeeded();const geometry=await heading.evaluate(e=>{const column=e.parentElement.getBoundingClientRect(),box=e.getBoundingClientRect(),region=e.closest('.cr-board').getBoundingClientRect();return {width:e.clientWidth,scroll:e.scrollWidth,height:box.height,lineHeight:Number.parseFloat(getComputedStyle(e).lineHeight),left:box.left,right:box.right,columnLeft:column.left,columnRight:column.right,regionLeft:region.left,regionRight:region.right}});assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));assert.ok(geometry.height>geometry.lineHeight*1.5,JSON.stringify(geometry));assert.ok(geometry.left>=geometry.columnLeft-1&&geometry.right<=geometry.columnRight+1,JSON.stringify(geometry));assert.ok(geometry.columnLeft>=geometry.regionLeft-1&&geometry.columnRight<=geometry.regionRight+1,JSON.stringify(geometry));await j.capture(`kanban-long-column-${columnTitles.indexOf(title)}`)}await j.capture('kanban-long-titles');await displayAction(page,'Grid',j.action);await j.table('Numbers');await j.record({Amount:'7'});await page.getByRole('link',{name:'Open record',exact:true}).waitFor();assert.equal(await page.locator('table').getByRole('columnheader',{name:'Record',exact:true}).count(),1);await j.action(page.getByRole('link',{name:'Open record',exact:true}));await page.getByRole('heading',{name:'Record without a title',exact:true}).waitFor();await detailReview(page);await j.capture('record-no-text')
}
