import {impactReview} from './records-browser-review.mjs'
import {displayAction,tableAction} from './records-table-tools.mjs'
import {baseAction,baseMenu} from './records-base-menu.mjs'
import {recordsBrowserWidths} from './records-browser-widths.mjs'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium,expect} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
export async function baseRolesJourney(){
 const output=path.resolve('.private/base-roles');await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await recordsBrowserRuntime(0)
  const people={creator:{id:createUlid(),name:'Jordan Chen'},editor:{id:createUlid(),name:'Sam Rivera'},reader:{id:createUlid(),name:'Taylor Morgan'},owner:{id:createUlid(),name:'Avery Blake'}}
  for(const [key,person]of Object.entries(people)){
   const now=Date.now();await h.db.prepare('INSERT INTO operators(id,created_at,updated_at,name,email,active) VALUES(?,?,?,?,?,1)').bind(person.id,now,now,person.name,`${key}@procurement.example.test`).run()
   await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',0,?,?)").bind(person.id,person.id,now,now).run()
  }
  const auth=await createFixtureAuth(h.db,{appOrigin:h.origin,sessionSecret:'test-only-records-session-secret-at-least-32-characters',mode:'development'},people.creator.id)
  for(const person of Object.values(people)){person.cookie=(await auth.signIn(person.id)).cookie}
  async function request(cookie,url,input){
   const csrf=await (await fetch(h.origin+'/auth/csrf',{headers:{cookie}})).json()
   const response=await fetch(h.origin+url,{method:input===undefined?'GET':'POST',headers:{cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrf.csrfToken},...(input===undefined?{}:{body:JSON.stringify(input)})})
   const body=await response.json();return {status:response.status,data:body.data,error:body.error}
  }
  async function call(cookie,url,input){const response=await request(cookie,url,input);assert.equal(response.status,200,JSON.stringify(response));return response.data}
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',...(process.platform==='linux'?['--no-sandbox']:[])],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of recordsBrowserWidths()){
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),creatorContext=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),creatorPage=await creatorContext.newPage(),j=recordsJourney(page,h.origin,output,width),cj=recordsJourney(creatorPage,h.origin,output,width)
   try{
    async function cookie(context,value){await context.addCookies([{name:value.split('=')[0],value:value.slice(value.indexOf('=')+1),url:h.origin}])}
    await cookie(context,h.cookie);await cookie(creatorContext,people.creator.cookie)
    const title=newField('Order'),notes=newField('Notes'),units=newField('Units','number'),status=newField('Status','select');status.options=[{id:createUlid(),label:'Queued'},{id:createUlid(),label:'Received'}];const appId=createUlid(),entityId=createUlid(),base=`/api/v1/apps/${appId}/entities/${entityId}`,tablePath=`${h.origin}/app/records/${appId}/${entityId}`
    const preview=await call(h.cookie,'/api/v1/records/schema-preview',{appId,name:`Purchasing ${width}`,tables:[{id:entityId,label:'Orders',primaryFieldId:title.id,fields:[title,notes,units,status]}]})
    await call(h.cookie,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}})
    await page.goto(tablePath);const original=await j.record({Order:'Grove Equipment replenishment',Notes:'Confirm dock appointment before dispatch',Units:'7',Status:{select:'Queued'}})
    await baseAction(page,'People');await page.getByRole('heading',{name:'Base collaborators',exact:true}).waitFor()
    for(const [key,role]of [['creator','creator'],['editor','editor'],['reader','read-only'],['owner','owner']]){
     const form=page.getByRole('form',{name:`Role for ${people[key].name}`,exact:true});await form.getByLabel('Base role',{exact:true}).selectOption(role)
     const saved=page.waitForResponse(r=>r.url().endsWith('/collaborators')&&r.request().method()==='POST');await form.getByRole('button',{name:'Add to this base',exact:true}).click();const savedResponse=await saved;assert.equal(savedResponse.status(),200,await savedResponse.text())
     await page.getByRole('form',{name:`Role for ${people[key].name}`,exact:true}).getByRole('button',{name:'Save base role',exact:true}).waitFor()
    }
    await j.capture('base-collaborators')
    await creatorPage.goto(tablePath);await baseAction(creatorPage,'Edit fields');await creatorPage.getByRole('heading',{name:'Edit base schema',exact:true}).waitFor()
    await cj.field('PO number')
    await cj.field('Restock quantity','formula',async field=>{
     const input=field.getByLabel('Formula for Restock quantity',{exact:true})
     await field.getByText('Fields and functions',{exact:true}).click();await input.fill('I')
     await field.getByLabel('Function suggestions',{exact:true}).getByRole('button',{name:'IF',exact:true}).click();await expect(input).toBeFocused();assert.equal(await input.inputValue(),'IF(')
     await field.getByRole('button',{name:'{Units}',exact:true}).click();await expect(input).toBeFocused();assert.equal(await input.inputValue(),'IF({Units}')
     await input.fill('IF({Units} > 0,');await field.getByRole('alert').filter({hasText:/Restock quantity:.*position 16/}).waitFor();assert.equal(await input.getAttribute('aria-invalid'),'true');assert.match(await field.getByRole('alert').innerText(),/Restock quantity:.*position 16/)
     await cj.capture('creator-formula-error')
     await input.fill('IF({Units} > 0, {Units} * 2, 0)');await field.getByText('Result type: number',{exact:true}).waitFor();assert.equal(await input.getAttribute('aria-invalid'),'false')
    })
    await cj.field('Absolute units','formula',async field=>{
     const input=field.getByLabel('Formula for Absolute units',{exact:true})
     await field.getByText('Fields and functions',{exact:true}).click();await input.fill('AB')
     await field.getByLabel('Function suggestions',{exact:true}).getByRole('button',{name:'ABS',exact:true}).click();await expect(input).toBeFocused();assert.equal(await input.inputValue(),'ABS(')
     await field.getByRole('button',{name:'{Units}',exact:true}).click();await input.press('End');await input.type(')')
     assert.equal(await input.inputValue(),'ABS({Units})');await field.getByText('Result type: number',{exact:true}).waitFor()
     await input.fill('ABS({Order})');await field.getByRole('alert').filter({hasText:'ABS expects a numeric operand'}).waitFor();assert.equal(await input.getAttribute('aria-invalid'),'true')
     await input.fill('ABS({Units})');await field.getByText('Result type: number',{exact:true}).waitFor()

    })
    await cj.field('Unavailable units','formula',async field=>field.getByLabel('Formula for Unavailable units',{exact:true}).fill('ABS(1 / 0)'))
    await cj.capture('creator-formula-editor')
    const formulaPreview=creatorPage.waitForResponse(response=>response.url().endsWith('/schema-preview')&&response.request().method()==='POST')
    await creatorPage.getByRole('button',{name:'Preview schema changes',exact:true}).click();const formulaResponse=await formulaPreview;assert.equal(formulaResponse.status(),200,await formulaResponse.text());const formula=(await formulaResponse.json()).data
    await creatorPage.getByRole('heading',{name:'Review schema changes',exact:true}).waitFor();await impactReview(creatorPage,{setChecked:cj.setChecked});await cj.capture('impact-preview')
    assert.equal(formula.requiresOwnerReview,false)
    const calculation=formula.calculations.find(field=>field.label==='Restock quantity');assert.equal(calculation.resultType,'number');assert.equal(calculation.totalRecords,1);assert.equal(calculation.samples[0].recordId,original.id);assert.deepEqual(calculation.samples[0].after,{state:'value',value:'14'})
    const absolute=formula.calculations.find(field=>field.label==='Absolute units');assert.equal(absolute.resultType,'number');assert.deepEqual(absolute.samples[0].after,{state:'value',value:'7'})
    const absoluteReview=creatorPage.locator('.cr-calculation-review article').filter({has:creatorPage.getByRole('heading',{name:'Orders · Absolute units',exact:true})})
    assert.deepEqual(await absoluteReview.locator('tbody td').allTextContents(),['New calculation','7'])
    const unavailableReview=creatorPage.locator('.cr-calculation-review article').filter({has:creatorPage.getByRole('heading',{name:'Orders · Unavailable units',exact:true})})
    await expect(unavailableReview.getByText('Unavailable · Division by zero',{exact:true})).toBeVisible()
    const calculationReview=creatorPage.locator('.cr-calculation-review article').filter({has:creatorPage.getByRole('heading',{name:'Orders · Restock quantity',exact:true})})
    await calculationReview.getByRole('row').filter({hasText:'Grove Equipment replenishment'}).waitFor();assert.deepEqual(await calculationReview.locator('tbody td').allTextContents(),['New calculation','14'])
    assert.equal((await call(people.editor.cookie,base)).fields.some(field=>field.id===calculation.fieldId),false)
    await cj.capture('creator-formula-preview');await creatorPage.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    const formulaRelease=await cj.command(creatorPage.getByRole('button',{name:'Adopt schema',exact:true}),'release.adopt')
    assert.equal((await h.db.prepare('SELECT owner_id FROM manual_record_releases WHERE id=?').bind(formulaRelease.releaseId).first()).owner_id,people.creator.id)
    await creatorPage.getByRole('heading',{name:'Base ready',exact:true}).waitFor();await cj.capture('adoption');await creatorPage.getByRole('link',{name:`Open Purchasing ${width}`,exact:true}).click();await creatorPage.getByRole('columnheader',{name:/PO number/}).waitFor();await creatorPage.getByRole('button',{name:'New record',exact:true}).waitFor()
    assert.equal((await call(people.creator.cookie,base+'/records/'+original.id)).record.fields[calculation.fieldId].value,'14')
    assert.match(await creatorPage.getByRole('row').filter({has:creatorPage.getByRole('link',{name:'Grove Equipment replenishment',exact:true})}).innerText(),/14/)
    await cj.capture('creator-adopted-field')
    assert.deepEqual((await call(people.creator.cookie,base+'/records/'+original.id)).record.fields[absolute.fieldId],{state:'value',value:'7'})
    await creatorPage.getByRole('link',{name:'Grove Equipment replenishment',exact:true}).first().click()
    await creatorPage.getByRole('button',{name:'Edit record',exact:true}).click();await creatorPage.getByLabel('Units',{exact:true}).fill('-0.125')
    await cj.command(creatorPage.getByRole('button',{name:'Save record',exact:true}),'record.patch')
    await expect(creatorPage.locator('dl').getByText('0.125',{exact:true})).toBeVisible()
    await expect(creatorPage.locator('dl').getByText('Unavailable · Division by zero',{exact:true})).toBeVisible()
    assert.deepEqual((await call(people.creator.cookie,base+'/records/'+original.id)).record.fields[absolute.fieldId],{state:'value',value:'0.125'})
    await cj.capture('absolute-next-read')
    await creatorPage.getByRole('button',{name:'Edit record',exact:true}).click();await creatorPage.getByLabel('Units',{exact:true}).fill('7')
    await cj.command(creatorPage.getByRole('button',{name:'Save record',exact:true}),'record.patch')
    await creatorPage.goto(tablePath);await baseAction(creatorPage,'Edit fields')
    assert.equal(await creatorPage.getByLabel('Formula for Absolute units',{exact:true}).inputValue(),'ABS({Units})')
    await cj.capture('absolute-editable-return')
    await creatorPage.getByRole('button',{name:'Cancel schema changes',exact:true}).click();await creatorPage.getByRole('button',{name:'New record',exact:true}).waitFor()

    const live=await call(people.editor.cookie,base);assert.ok(live.fields.some(field=>field.label==='PO number'))
    const help='Use the supplier reference <strong>exactly</strong>.'
    await baseAction(creatorPage,'Edit fields')
    const statusEditor=creatorPage.getByRole('group',{name:'Status',exact:true}),orderEditor=creatorPage.getByRole('group',{name:'Order',exact:true})
    assert.equal(await statusEditor.getByLabel('Options (one per line)',{exact:true}).isDisabled(),true)
    await statusEditor.getByLabel('Add options (one per line)',{exact:true}).fill('Awaiting pickup')
    await orderEditor.getByLabel('Help text',{exact:true}).fill(help)
    await cj.capture('creator-additive-editor')
    const preparing=creatorPage.waitForResponse(response=>response.url().endsWith('/schema-preview')&&response.request().method()==='POST')
    await creatorPage.getByRole('button',{name:'Preview schema changes',exact:true}).click()
    const preparedAdditions=await preparing;assert.equal(preparedAdditions.status(),200);const additions=(await preparedAdditions.json()).data
    assert.equal(additions.requiresOwnerReview,false)
    assert.deepEqual(additions.impacts[0].recordIds,[original.id]);assert.equal(additions.impacts[0].conversions.length,0)
    await creatorPage.getByText(/Add options to Status: Awaiting pickup/).waitFor()
    await creatorPage.getByText(/Help for Order:/).waitFor();await cj.capture('creator-additive-preview')
    await creatorPage.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    await cj.command(creatorPage.getByRole('button',{name:'Adopt schema',exact:true}),'release.adopt')
    await creatorPage.getByRole('heading',{name:'Base ready',exact:true}).waitFor()
    await creatorPage.getByRole('link',{name:/^Open /}).last().click()
    const updated=await call(people.editor.cookie,base),choices=updated.fields.find(field=>field.id===status.id).options
    assert.deepEqual(choices.slice(0,status.options.length),status.options);assert.equal(choices.at(-1).label,'Awaiting pickup')
    assert.equal(updated.fields.find(field=>field.id===title.id).help,help)
    assert.equal((await call(people.editor.cookie,base+'/records/'+original.id)).record.fields[status.id].value,status.options[0].id)
    await cookie(context,people.editor.cookie);await page.goto(tablePath)
    await page.getByRole('button',{name:'New record',exact:true}).click();await page.getByText(help,{exact:true}).waitFor()
    assert.equal(await page.locator('strong').filter({hasText:'exactly'}).count(),0)
    await j.capture('editor-plain-help-and-choice')
    await page.getByLabel('Order',{exact:true}).fill('Synthetic cradle pickup');await page.getByLabel('Status',{exact:true}).selectOption({label:'Awaiting pickup'})
    const added=await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.create')
    assert.equal((await call(people.editor.cookie,base+'/records/'+added.id)).record.fields[status.id].value,choices.at(-1).id)
    await cj.capture('creator-additive-adopted')
    const ownership=await h.db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first();assert.equal(ownership.owner_id,'00000000000000000000000981')
    await baseAction(creatorPage,'Edit fields');await creatorPage.getByRole('group',{name:'Notes',exact:true}).getByRole('button',{name:'Remove field',exact:true}).click()
    const prepared=creatorPage.waitForResponse(response=>response.url().endsWith('/schema-preview')&&response.request().method()==='POST');await creatorPage.getByRole('button',{name:'Preview schema changes',exact:true}).click();const preparedResponse=await prepared;assert.equal(preparedResponse.status(),200);const destructive=(await preparedResponse.json()).data;assert.equal(destructive.requiresOwnerReview,true);await creatorPage.getByText(/Saved for a base owner to review/).waitFor();await cj.capture('creator-awaiting-owner')
    const adopt={commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:destructive.id}}
    assert.equal((await request(people.creator.cookie,'/api/v1/commands/release.adopt',adopt)).status,403)
    // A base owner who is not the installation owner reviews and adopts the creator's exact preview.
    await cookie(context,people.owner.cookie);await page.goto(tablePath);await baseAction(page,/^Review changes/);await page.getByRole('heading',{name:'Schema changes awaiting an owner',exact:true}).waitFor()
    await page.getByLabel('I reviewed this schema change and its recovery data.',{exact:true}).check();await j.capture('owner-review')
    await j.command(page.getByRole('button',{name:'Adopt reviewed schema',exact:true}),'release.adopt')
    const after=await call(people.editor.cookie,base);assert.equal(after.fields.some(field=>field.id===notes.id),false)
    const release=(await h.db.prepare('SELECT id FROM manual_record_releases WHERE app_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(appId).first()).id
    const recovery=await call(people.owner.cookie,`/api/v1/records/releases/${release}/recovery`);assert.match(recovery.tables[0].csv,/Confirm dock appointment/)
    assert.equal((await h.db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first()).owner_id,ownership.owner_id)
    const denied=await request(people.editor.cookie,'/api/v1/records/schema-preview',await call(people.creator.cookie,`/api/v1/records/bases/${appId}`));assert.equal(denied.status,403)
    await cookie(context,people.editor.cookie);await page.goto(tablePath);const editorMenu=await baseMenu(page);assert.equal(await editorMenu.getByRole('button',{name:'Edit fields',exact:true}).count(),0);await editorMenu.getByRole('button',{name:'Close',exact:true}).click()
    await tableAction(page,'Save view');await page.getByLabel('Name',{exact:true}).fill('Warehouse orders');await page.getByLabel('Who can use this view',{exact:true}).selectOption('app')
    const savedView=await j.command(page.locator('form').filter({has:page.getByLabel('Name',{exact:true})}).getByRole('button',{name:'Save view',exact:true}),'view.save')
    await displayAction(page,'Warehouse orders');await page.getByRole('button',{name:'View history',exact:true}).click();await page.getByRole('heading',{name:'Recent view changes',exact:true}).waitFor();await j.capture('editor-collaborative-view')
    const views=await call(people.reader.cookie,`/api/v1/apps/${appId}/views`);assert.ok(views.items.some(view=>view.id===savedView.id));assert.equal(views.items.find(view=>view.id===savedView.id).access.canEdit,false)
    const history=await call(people.reader.cookie,`/api/v1/views/${savedView.id}/history`);assert.equal(history.items.length,1);assert.equal(history.items[0].actor_name,people.editor.name)
    const schema=await call(people.reader.cookie,base),definition={appId,entityId,name:'My receiving list',display:'grid',fields:schema.fields.map(field=>field.id),filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:title.id},visibility:'app',shipped:false}
    const saveView=visibility=>({commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{view:{...definition,visibility}}})
    assert.equal((await request(people.reader.cookie,'/api/v1/commands/view.save',saveView('app'))).status,403)
    const privateView=await call(people.reader.cookie,'/api/v1/commands/view.save',saveView('private'));assert.equal(privateView.state,'committed')
    assert.equal((await call(people.editor.cookie,`/api/v1/apps/${appId}/views`)).items.some(view=>view.id===privateView.value.id),false)
    // A retained formula preview loses adoption rights immediately on creator demotion.
    await creatorPage.goto(tablePath);await baseAction(creatorPage,'Edit fields');await cj.field('Approval reference','formula',async field=>field.getByLabel('Formula for Approval reference',{exact:true}).fill('{Units} * 3'))
    await creatorPage.getByRole('group',{name:'Status',exact:true}).getByLabel('Add options (one per line)',{exact:true}).fill('Held choice')
    await creatorPage.getByRole('group',{name:'Order',exact:true}).getByLabel('Help text',{exact:true}).fill('Not adopted')
    const retainedPreview=creatorPage.waitForResponse(response=>response.url().endsWith('/schema-preview')&&response.request().method()==='POST');await creatorPage.getByRole('button',{name:'Preview schema changes',exact:true}).click();const retainedResponse=await retainedPreview;assert.equal(retainedResponse.status(),200);const retained=(await retainedResponse.json()).data
    const approval=retained.calculations.find(field=>field.label==='Approval reference');assert.deepEqual(approval.samples[0].after,{state:'value',value:'21'})
    await creatorPage.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check();await cj.capture('creator-retained-formula-preview')
    const members=await call(h.cookie,`/api/v1/records/bases/${appId}/collaborators`),creator=members.items.find(person=>person.id===people.creator.id)
    await call(h.cookie,`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:creator.id,role:'editor',destructive:false,version:creator.version})
    const unchangedSchema=await call(people.editor.cookie,base),unchangedRecord=(await call(people.editor.cookie,base+'/records/'+original.id)).record
    const refused=creatorPage.waitForResponse(response=>response.url().endsWith('/release.adopt')&&response.request().method()==='POST');await creatorPage.getByRole('button',{name:'Adopt schema',exact:true}).click();const refusedResponse=await refused;assert.equal(refusedResponse.status(),403);await creatorPage.locator('.cr-notice--unknown[role="status"]').waitFor();await cj.capture('demoted-creator-formula-refused')
    assert.equal((await request(people.creator.cookie,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:retained.id}})).status,403)
    const demotedSchema=await call(people.editor.cookie,base)
    assert.equal(demotedSchema.fields.some(field=>field.label==='Approval reference'),false)
    assert.deepEqual(demotedSchema.fields.find(field=>field.id===status.id).options,choices)
    assert.equal(demotedSchema.fields.find(field=>field.id===title.id).help,help)
    assert.deepEqual(await call(people.editor.cookie,base),unchangedSchema);assert.deepEqual((await call(people.editor.cookie,base+'/records/'+original.id)).record,unchangedRecord)
    assert.equal((await h.db.prepare('SELECT state FROM manual_record_previews WHERE id=?').bind(retained.id).first()).state,'prepared')
    assert.equal((await call(people.editor.cookie,base+'/records/'+original.id)).record.fields[title.id].value,'Grove Equipment replenishment')
   }finally{await context.close();await creatorContext.close()}
  }
 }finally{await browser?.close();await h?.close()}
}
