import {displayAction,tableAction} from './records-table-tools.mjs'
import {baseAction,baseMenu} from './records-base-menu.mjs'
import {recordsBrowserWidths} from './records-browser-widths.mjs'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {creatorRollups} from './records-creator-rollups.mjs'
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
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic','--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of recordsBrowserWidths()){
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),creatorContext=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),creatorPage=await creatorContext.newPage(),j=recordsJourney(page,h.origin,output,width),cj=recordsJourney(creatorPage,h.origin,output,width)
   try{
    async function cookie(context,value){await context.addCookies([{name:value.split('=')[0],value:value.slice(value.indexOf('=')+1),url:h.origin}])}
    await cookie(context,h.cookie);await cookie(creatorContext,people.creator.cookie)
    const title=newField('Order'),notes=newField('Notes'),appId=createUlid(),entityId=createUlid(),base=`/api/v1/apps/${appId}/entities/${entityId}`,tablePath=`${h.origin}/app/records/${appId}/${entityId}`
    const linesId=createUlid(),lineName=newField('Line'),amount=newField('Amount','number'),included=newField('Included','boolean'),items=newField('Order lines','relation')
    items.relation={ownerAppId:appId,entityId:linesId,cardinality:'many',onDelete:'restrict'}
    const preview=await call(h.cookie,'/api/v1/records/schema-preview',{appId,name:`Purchasing ${width}`,tables:[{id:entityId,label:'Orders',primaryFieldId:title.id,fields:[title,notes,items]},{id:linesId,label:'Lines',primaryFieldId:lineName.id,fields:[lineName,amount,included]}]})
    await call(h.cookie,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}})
    await page.goto(tablePath);const original=await j.record({Order:'Grove Equipment replenishment',Notes:'Confirm dock appointment before dispatch'})
    const lines=[]
    for(const [label,value,active]of [['Dock handling','10',true],['Liftgate','20',false],['Pallet exchange','5',true]])lines.push((await call(h.cookie,'/api/v1/commands/record.create',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:linesId},version:1}],input:{appId,entityId:linesId,values:{[lineName.id]:label,[amount.id]:value,[included.id]:active}}})).value)
    await call(h.cookie,'/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref:original.ref,version:original.version}],input:{ref:original.ref,changes:{[items.id]:lines.map(line=>line.ref)}}})
    await baseAction(page,'People');await page.getByRole('heading',{name:'Base collaborators',exact:true}).waitFor()
    for(const [key,role]of [['creator','creator'],['editor','editor'],['reader','read-only'],['owner','owner']]){
     const form=page.getByRole('form',{name:`Role for ${people[key].name}`,exact:true});await form.getByLabel('Base role',{exact:true}).selectOption(role)
     const saved=page.waitForResponse(r=>r.url().endsWith('/collaborators')&&r.request().method()==='POST');await form.getByRole('button',{name:'Add to this base',exact:true}).click();const savedResponse=await saved;assert.equal(savedResponse.status(),200,await savedResponse.text())
     await page.getByRole('form',{name:`Role for ${people[key].name}`,exact:true}).getByRole('button',{name:'Save base role',exact:true}).waitFor()
    }
    await j.capture('base-collaborators')
    await creatorPage.goto(tablePath);await baseAction(creatorPage,'Edit fields');await creatorPage.getByRole('heading',{name:'Edit base schema',exact:true}).waitFor()
    await cj.field('PO number');await cj.adopt();await creatorPage.getByRole('columnheader',{name:/PO number/}).waitFor();await cj.capture('creator-adopted-field')
    const live=await call(people.editor.cookie,base);assert.ok(live.fields.some(field=>field.label==='PO number'))
    const ownership=await h.db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first();assert.equal(ownership.owner_id,'00000000000000000000000981')
    const calculations=await creatorRollups({h,people,appId,entityId,linesId,original,lines,amount,included,page:creatorPage,j:cj,call,request})
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
    // A retained creator preview loses adoption rights immediately on demotion.
    await creatorPage.goto(tablePath);await baseAction(creatorPage,'Edit fields');await cj.field('Approval reference')
    const retained=await calculations.prepare('Pending amount','Pending count')
    const beforeRefusal=await call(people.editor.cookie,base),recordBefore=(await call(people.editor.cookie,base+'/records/'+original.id)).record,releasesBefore=await h.db.prepare('SELECT COUNT(*) AS count FROM manual_record_releases WHERE app_id=?').bind(appId).first()
    const members=await call(h.cookie,`/api/v1/records/bases/${appId}/collaborators`),creator=members.items.find(person=>person.id===people.creator.id)
    await call(h.cookie,`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:creator.id,role:'editor',destructive:false,version:creator.version})
    await creatorPage.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    const refusal=creatorPage.waitForResponse(response=>response.url().endsWith('/release.adopt')&&response.request().method()==='POST')
    await creatorPage.getByRole('button',{name:'Adopt schema',exact:true}).click()
    const refused=await refusal;assert.equal(refused.status(),403,await refused.text())
    assert.equal(refused.request().postDataJSON().input.previewId,retained.id)
    await creatorPage.getByRole('status').filter({hasText:/Your access changed/}).waitFor();await cj.capture('demoted-creator-calculation-refused')
    assert.equal((await request(people.creator.cookie,'/api/v1/commands/release.adopt',refused.request().postDataJSON())).status,403)
    assert.deepEqual(await call(people.editor.cookie,base),beforeRefusal)
    assert.deepEqual((await call(people.editor.cookie,base+'/records/'+original.id)).record,recordBefore)
    assert.deepEqual(await h.db.prepare('SELECT COUNT(*) AS count FROM manual_record_releases WHERE app_id=?').bind(appId).first(),releasesBefore)
    assert.equal((await h.db.prepare('SELECT state FROM manual_record_previews WHERE id=?').bind(retained.id).first()).state,'prepared')
    assert.equal((await call(people.editor.cookie,base)).fields.some(field=>field.label==='Approval reference'),false)
    assert.equal((await call(people.editor.cookie,base+'/records/'+original.id)).record.fields[title.id].value,'Grove Equipment replenishment')
    await calculations.values('40','3')
   }finally{await context.close();await creatorContext.close()}
  }
 }finally{await browser?.close();await h?.close()}
}
