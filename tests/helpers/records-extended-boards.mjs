import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {galleryFixture} from './records-gallery-journey.mjs'
import {browserCall,liveCommand} from './records-live-fixture.mjs'
import {freePort} from './free-port.mjs'
import {repairFieldId,REPAIR_ENTITIES} from '../../src/apps/repairs/model.ts'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'

// One public-door journey covers native rules and the two responsive product surfaces.
export async function extendedBoardJourney(){
 const output=path.resolve('.private/boards');await mkdir(output,{recursive:true})
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{for(const width of [1440,390]){
  const h=await recordsBrowserRuntime(await freePort()),context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
  try{
   page.setDefaultTimeout(15000)
   await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
   const f=await galleryFixture(h),table=`${h.origin}/app/records/${f.appId}/${f.entityId}`,base=`/api/v1/apps/${f.appId}/entities/${f.entityId}`,group=repairFieldId('assets','store_id')
   await page.goto(`${table}/${f.ids[0]}`);await page.getByRole('button',{name:'Edit record',exact:true}).click()
   await page.getByLabel('Add repair evidence',{exact:true}).setInputFiles(path.resolve('tests/fixtures/gallery/cooler.png'))
   await page.getByRole('button',{name:'Upload file',exact:true}).click();await page.getByRole('button',{name:'File verified',exact:true}).waitFor()
   await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch')
   const storeBase=`/api/v1/apps/${f.appId}/entities/${REPAIR_ENTITIES.stores}`,storeSchema=await browserCall(page,storeBase)
   const store=(await browserCall(page,'/api/v1/commands/record.create',liveCommand({appId:f.appId,entityId:REPAIR_ENTITIES.stores,values:{[repairFieldId('stores','name')]:'East depot',[repairFieldId('stores','location')]:'Dallas',[repairFieldId('stores','contact_id')]:'00000000000000000000000981',[repairFieldId('stores','active')]:true}},[{ref:{appId:f.appId,entityId:'00000000000000000000000001',recordId:REPAIR_ENTITIES.stores},version:storeSchema.version}]))).value
   await page.goto(table);await page.getByRole('navigation',{name:'Record display'}).getByRole('button',{name:'Board',exact:true}).click()
   await page.getByLabel('Board columns',{exact:true}).selectOption(group)
   await page.getByRole('heading',{name:/West depot/}).first().waitFor()
   const board=page.getByRole('region',{name:/board; scroll for columns$/}),card=id=>board.locator(`article[data-record-id="${id}"]`)
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('.cr-gallery-cover')).some(img=>img.complete&&img.naturalWidth>0))
   assert.equal(await board.locator('.cr-gallery-cover').count(),1)
   await j.capture('board-link-covers')
   const first=await card(f.ids[0]).locator('..').locator('article').evaluateAll(nodes=>nodes.map(node=>node.dataset.recordId))
   await card(first[1]).getByRole('button',{name:'Move earlier',exact:true}).click()
   assert.equal(await card(first[0]).locator('..').locator('article').first().getAttribute('data-record-id'),first[1])
   await j.capture('board-link-reordered')
   const patch=()=>page.waitForResponse(r=>r.url().endsWith('/commands/record.patch')&&r.request().method()==='POST')
   if(width===1440){const pending=patch();await card(f.ids[0]).getByRole('heading').first().dragTo(board.locator(`[data-board-column="${store.id}"]`));assert.equal((await pending).status(),200)}
   else{await card(f.ids[0]).getByRole('combobox',{name:'Move to Cold room A',exact:true}).selectOption(store.id);await j.command(card(f.ids[0]).getByRole('button',{name:'Move Cold room A',exact:true}),'record.patch')}
   await board.locator(`[data-board-column="${store.id}"] article[data-record-id="${f.ids[0]}"]`).waitFor()
   assert.equal((await browserCall(page,base+'/records/'+f.ids[0])).record.fields[group].value.recordId,store.id)
   await card(f.ids[0]).scrollIntoViewIfNeeded()
   await j.capture('board-link-moved')
   await page.getByRole('button',{name:'Save view',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Equipment by depot');await page.getByLabel('Board cover',{exact:true}).selectOption(f.cover);await page.getByLabel('Image fit',{exact:true}).selectOption('contain')
   await j.capture('board-settings')
   await j.command(page.locator('form').filter({has:page.getByLabel('Name',{exact:true})}).getByRole('button',{name:'Save view',exact:true}),'view.save')
   await page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:'Equipment by depot',exact:true}).click()
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('.cr-gallery-cover')).some(img=>img.complete&&img.naturalWidth>0))
   assert.equal(await board.locator('.cr-gallery-cover').first().evaluate(img=>getComputedStyle(img).objectFit),'contain')
   await j.capture('board-saved-fit')
   const rules=f.rules.map(rule=>rule.entityId===f.entityId?{...rule,readableFields:rule.readableFields.filter(id=>id!==f.cover),writableFields:[],actions:rule.actions.filter(a=>a!=='record.patch')}:rule)
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),f.policyId).run()
   await page.waitForFunction(()=>document.querySelectorAll('.cr-board-card').length===3&&document.querySelectorAll('.cr-gallery-cover').length===0&&document.querySelectorAll('.cr-board-card[draggable="true"]').length===0)
   assert.equal(await board.getByRole('combobox').count(),0)
   const row=(await browserCall(page,base+'/records/'+f.ids[0])).record
   const refused=await context.request.post(h.origin+'/api/v1/commands/record.patch',{headers:{origin:h.origin,'x-csrf-token':(await(await context.request.get(h.origin+'/auth/csrf')).json()).csrfToken},data:liveCommand({appId:f.appId,entityId:f.entityId,rows:[{recordId:row.id,changes:{[group]:null}}]},[{ref:row.ref,version:row.version}])});assert.equal(refused.status(),403)
   await j.capture('board-readonly-private-cover')
   // General-base person fields use active authorized members as columns.
   const appId=createUlid(),entityId=createUlid(),title=newField('Task'),person=newField('Assignee','person'),draft={appId,name:'Warehouse work',tables:[{id:entityId,label:'Tasks',fields:[title,person]}]}
   const preview=await browserCall(page,'/api/v1/records/schema-preview',draft);await browserCall(page,'/api/v1/commands/release.adopt',liveCommand({kind:'manual_schema',previewId:preview.id}))
   const schema=await browserCall(page,`/api/v1/apps/${appId}/entities/${entityId}`)
   const task=(await browserCall(page,'/api/v1/commands/record.create',liveCommand({appId,entityId,values:{[title.id]:'Receive supplier delivery',[person.id]:null}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}]))).value
   await page.goto(`${h.origin}/app/records/${appId}/${entityId}`);await page.getByRole('navigation',{name:'Record display'}).getByRole('button',{name:'Board',exact:true}).click();await page.getByLabel('Board columns',{exact:true}).selectOption(person.id)
   await board.getByRole('heading',{name:/Records Owner/}).waitFor();await card(task.id).getByRole('combobox').selectOption('00000000000000000000000981');await j.command(card(task.id).getByRole('button',{name:'Move Receive supplier delivery',exact:true}),'record.patch')
   await board.locator('[data-board-column="00000000000000000000000981"] article').waitFor()
   assert.equal((await browserCall(page,`/api/v1/apps/${appId}/entities/${entityId}/records/${task.id}`)).record.fields[person.id].value,'00000000000000000000000981')
   await card(task.id).scrollIntoViewIfNeeded()
   await j.capture('board-person-assigned')
  }catch(error){await page.screenshot({path:path.join(output,`failure-${width}.png`),fullPage:true});throw error}finally{await context.close();await h.close()}
 }}finally{await browser.close()}
}
