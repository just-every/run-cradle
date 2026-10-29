import {measureAccessibilityLayout} from './accessibility-axe.mjs'
import {baseAction} from './records-base-menu.mjs'
import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {userInfo} from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {chromium} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {createUlid} from '../../src/core/shared/ids.ts'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {baseHttpSession} from './base-http-session.mjs'
import {recordsBrowserWidths} from './records-browser-widths.mjs'

const schemaEntity='00000000000000000000000001'
const text=(id,label,extra={})=>({id,label,type:'text',required:false,unique:false,...extra})

/** Native operator sessions, emitted Worker HTTP and actual React controls.
 * Reuses the existing browser registration; no application transport is mocked. */
export async function fieldBrowser(outputDirectory=process.env.CRADLE_FIELD_OUTPUT??'.private/field-browser'){
 assert.equal(process.env.HOME,userInfo().homedir,'Browser uses the execution host real HOME')
 const output=path.resolve(outputDirectory);await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await userAutomationRuntime(0)
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  console.log('FIELD_BROWSER_OWNED_PIDS '+JSON.stringify(ownedProcesses()))
  for(const width of recordsBrowserWidths()){
   const fixture=await fieldFixture(h,width),contexts=[],checkpoints=[]
   try{
    const owner=await screen(h,browser,width,h.cookie,output,'owner',checkpoints);contexts.push(owner.context)
    const creator=await screen(h,browser,width,fixture.creatorCookie,output,'creator',checkpoints);contexts.push(creator.context)
    const page=owner.page,tile=name=>page.getByRole('group',{name,exact:true}),table=name=>page.getByRole('navigation',{name:'Schema tables',exact:true}).getByRole('button',{name,exact:true})
    async function edit(){await page.goto(fixture.url);await baseAction(page,'Edit fields');await table('Orders').click();await tile('Amount').waitFor()}
    async function preview(active=page){
     const pending=active.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/schema-preview'))
     await active.getByRole('button',{name:'Preview schema changes',exact:true}).click()
     const response=await pending;assert.equal(response.status(),200,'Real schema preview succeeds')
     const value=(await response.json()).data;await active.getByRole('heading',{name:'Review schema changes',exact:true}).waitFor();return value
    }
    await edit()
    await tile('Contact phone').getByLabel('Field type',{exact:true}).selectOption('phone')
    await owner.capture('phone-type-authoring',tile('Contact phone'))
    for(const [label,type]of [['Email','email'],['Rating','rating'],['Duration','duration']]){
     await page.getByRole('button',{name:'Add field',exact:true}).click()
     await tile('New field').getByLabel('Field name',{exact:true}).fill(label)
     await tile(label).getByLabel('Field type',{exact:true}).selectOption(type)
     if(type==='rating'){assert.equal(await tile(label).getByLabel('Rating maximum',{exact:true}).inputValue(),'5');await tile(label).getByLabel('Rating maximum',{exact:true}).fill('10')}
     await owner.capture(type+'-type-authoring',tile(label))
    }
    const phonePreview=await preview(),phoneConversion=phonePreview.impacts.find(item=>item.entityId===fixture.orders).conversions.find(item=>item.fieldId===fixture.phone)
    assert.equal(phoneConversion.losses.length,0);assert.ok(phoneConversion.converted.some(item=>item.after==='+15551234567'))
    await owner.capture('phone-conversion-preview',page.getByRole('region',{name:'Conversion of Contact phone',exact:true}))
    await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    const phoneAdoption=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/release.adopt'))
    await page.getByRole('button',{name:'Adopt schema',exact:true}).click();assert.equal((await phoneAdoption).status(),200)
    await page.goto(fixture.url);await page.getByText('(555) 123-4567',{exact:true}).first().waitFor()
    await owner.capture('phone-display',page.getByText('(555) 123-4567',{exact:true}).first())
    await page.getByRole('button',{name:'New record',exact:true}).click()
    const phoneInput=page.getByLabel('Contact phone',{exact:true});assert.equal(await phoneInput.getAttribute('type'),'tel')
    await page.getByLabel('Order *',{exact:true}).fill('Phone validation')
    await phoneInput.fill('invalid telephone')
    const invalidPhone=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/record.create'))
    await page.getByRole('button',{name:'Save record',exact:true}).click();assert.equal((await invalidPhone).status(),400)
    await page.getByText(/Contact phone:.*Phone must use E.164/).waitFor()
    await owner.capture('phone-invalid',phoneInput)
    await phoneInput.fill('(555) 123-4588')
    for(const [label,value]of [['Email','two@example.test,three@example.test'],['Rating','1.5'],['Duration','1:70']]){
     const input=page.getByLabel(label,{exact:true});await input.fill(value)
     await page.getByRole('button',{name:'Save record',exact:true}).click()
     assert.equal(await input.evaluate(node=>node.checkValidity()),label==='Duration','Email and whole-rating constraints refuse invalid browser input')
     if(label==='Duration')await page.getByText(/Duration:.*whole nonnegative seconds/).waitFor()
     await owner.capture(label.toLowerCase()+'-invalid',input)
     await input.fill(label==='Email'?'synthetic-cradle-402@example.test':label==='Rating'?'10':'1:01:01')
    }
    const validPhone=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/record.create'))
    await page.getByRole('button',{name:'Save record',exact:true}).click()
    const validPhoneResponse=await validPhone;assert.equal(validPhoneResponse.status(),200)
    const savedPhone=(await validPhoneResponse.json()).data.value;assert.equal(savedPhone.fields[fixture.phone].value,'+15551234588');const typedSchema=(await fixture.draft()).tables.find(table=>table.id===fixture.orders);for(const [label,value]of [['Email','synthetic-cradle-402@example.test'],['Rating','10'],['Duration','3661']])assert.equal(savedPhone.fields[typedSchema.fields.find(field=>field.label===label).id].value,value)
    await page.getByRole('button',{name:'New record',exact:true}).waitFor()
    await page.getByText('(555) 123-4588',{exact:true}).first().waitFor()
    for(const text of ['synthetic-cradle-402@example.test','10','1:01:01'])await page.getByText(text,{exact:true}).first().waitFor()
    await owner.capture('typed-fields-valid-save',page.getByText('1:01:01',{exact:true}).first())
    await owner.capture('phone-valid-save',page.getByText('(555) 123-4588',{exact:true}).first())
    await edit()
    await tile('Order').getByLabel('Field type',{exact:true}).selectOption('number')
    assert.equal(await tile('Order').getByLabel('Required',{exact:true}).isChecked(),true,'Changing stored type preserves the existing required constraint')
    await tile('Order').getByLabel('Field type',{exact:true}).selectOption('text')
    assert.equal(await tile('Amount').getByLabel('Field type',{exact:true}).isEnabled(),true)
    assert.equal(await tile('Carrier').getByLabel('Options (one per line)',{exact:true}).isDisabled(),true)
    assert.equal(await tile('Vendor link').getByLabel('Linked table',{exact:true}).isDisabled(),true)
    assert.equal(await tile('Vendor link').getByLabel('Link cardinality',{exact:true}).isDisabled(),true)
    await owner.capture('existing-field-controls',tile('Amount'))
    await tile('Vendor link').getByLabel('Field type',{exact:true}).selectOption('select')
    const linkedReview=await preview(),linkedImpact=linkedReview.impacts.find(item=>item.entityId===fixture.orders),linkedConversion=linkedImpact.conversions.find(item=>item.fieldId===fixture.link)
    assert.equal(linkedConversion.losses.length,0);assert.ok(linkedConversion.converted.some(item=>item.afterLabel==='Northline Freight'),'Linked primary labels become reviewed select options')
    await page.getByRole('region',{name:'Conversion of Vendor link',exact:true}).getByText('Northline Freight',{exact:false}).first().waitFor()
    await owner.capture('linked-label-select-preview',page.getByRole('region',{name:'Conversion of Vendor link',exact:true}))
    await page.getByRole('button',{name:'Cancel schema changes',exact:true}).click();await edit()

    await tile('Amount').getByLabel('Field type',{exact:true}).selectOption('select')
    const options=tile('Amount').getByLabel('Options (one per line)',{exact:true});assert.equal(await options.isEnabled(),true)
    await options.fill('1250.50\nAwaiting quote');await owner.capture('conversion-options',options)
    await tile('Carrier').getByLabel('Field type',{exact:true}).selectOption('relation')
    const linked=tile('Carrier').getByLabel('Linked table',{exact:true});assert.equal(await linked.isEnabled(),true)
    await linked.selectOption(fixture.vendors);assert.equal(await tile('Carrier').getByLabel('Link cardinality',{exact:true}).isEnabled(),true)
    await tile('Carrier').getByLabel('Link cardinality',{exact:true}).selectOption('one');await owner.capture('conversion-link-controls',linked)
    await page.getByRole('button',{name:'Cancel schema changes',exact:true}).click()
    await edit();await tile('Amount').getByLabel('Field type',{exact:true}).selectOption('boolean')
    const refused=await preview(),refusals=refused.impacts.flatMap(impact=>impact.refusals??[]);assert.ok(refusals.length)
    for(const refusal of refusals)await page.getByText(refusal,{exact:true}).first().waitFor()
    await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    assert.equal(await page.getByRole('button',{name:'Adopt schema',exact:true}).isDisabled(),true)
    await owner.capture('conversion-refused',page.getByRole('button',{name:'Adopt schema',exact:true}))
    await page.getByRole('button',{name:'Cancel schema changes',exact:true}).click()
    await edit();await table('Legacy orders').click();await page.getByRole('button',{name:'Move table to Trash',exact:true}).click()
    await table('Vendors').click();await page.getByRole('button',{name:'Move table to Trash',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:'Move table to Trash',exact:true}).isDisabled(),true)
    await owner.capture('last-table-guard',page.getByRole('button',{name:'Move table to Trash',exact:true}))
    await page.getByRole('button',{name:'Cancel schema changes',exact:true}).click()
    assert.equal((await fixture.draft()).tables.length,3,'Discarded draft removal changes no live tables')

    // A creator prepares the lossy conversion and both schema Trash objects;
    // the owner adopts that exact preview through BaseSchemaReviews.
    const cp=creator.page
    await cp.goto(fixture.url);await baseAction(cp,'Edit fields')
    await cp.getByRole('navigation',{name:'Schema tables',exact:true}).getByRole('button',{name:'Orders',exact:true}).click()
    await cp.getByRole('group',{name:'Amount',exact:true}).getByLabel('Field type',{exact:true}).selectOption('number')
    await cp.getByRole('group',{name:'Memo',exact:true}).getByRole('button',{name:'Remove field',exact:true}).click()
    await cp.getByRole('navigation',{name:'Schema tables',exact:true}).getByRole('button',{name:'Legacy orders',exact:true}).click()
    await cp.getByRole('button',{name:'Move table to Trash',exact:true}).click()
    const reviewed=await preview(cp),impact=reviewed.impacts.find(item=>item.entityId===fixture.orders),conversion=impact.conversions.find(item=>item.fieldId===fixture.amount)
    assert.equal(reviewed.requiresOwnerReview,true);assert.equal(conversion.converted.length,2);assert.equal(conversion.converted.filter(item=>item.before===null&&item.after===null).length,1);assert.equal(conversion.losses.length,1)
    assert.ok(reviewed.impacts.some(item=>item.entityId===fixture.legacy&&item.deletedTable))
    assert.ok(impact.dependencies.some(item=>item.name==='Invoice review'),'Preview names the real saved-view dependent')
    for(const value of conversion.converted){await cp.getByText(value.beforeLabel+' → '+value.afterLabel,{exact:false}).waitFor()}
    for(const value of conversion.losses){await cp.getByText(value.valueLabel+' — '+value.reason,{exact:false}).waitFor()}
    for(const dependency of impact.dependencies){await cp.getByText(dependency.name,{exact:true}).first().waitFor();for(const detail of dependency.details)await cp.getByText(detail,{exact:true}).first().waitFor()}
    await creator.capture('creator-loss-preview',cp.getByRole('region',{name:'Conversion of Amount',exact:true}))
    await cp.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    assert.equal(await cp.getByRole('button',{name:'Adopt schema',exact:true}).isDisabled(),true)
    await creator.capture('creator-awaiting-owner',cp.getByRole('button',{name:'Adopt schema',exact:true}))
    await page.goto(fixture.url);await baseAction(page,/^Review changes/)
    await page.getByRole('heading',{name:'Schema changes awaiting an owner',exact:true}).waitFor()
    const review=page.locator('article.cr-records-panel').filter({has:page.getByRole('heading',{name:fixture.name,exact:true})})
    await review.getByRole('region',{name:'Conversion of Amount',exact:true}).waitFor()
    assert.equal(await review.getByRole('button',{name:'Adopt reviewed schema',exact:true}).isDisabled(),true)
    await owner.capture('owner-review-unconfirmed',review)
    await review.getByLabel('I reviewed this schema change and its recovery data.',{exact:true}).check()
    assert.equal(await review.getByRole('button',{name:'Adopt reviewed schema',exact:true}).isEnabled(),true)
    await owner.capture('owner-review-confirmed',review)
    const adoption=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/release.adopt'))
    await review.getByRole('button',{name:'Adopt reviewed schema',exact:true}).click();assert.equal((await adoption).status(),200)
    const recovery=review.getByRole('link',{name:'Download recovery data — Orders',exact:true});await recovery.waitFor()
    await owner.capture('owner-adopted-recovery',review)
    for(const label of ['Orders','Legacy orders']){
     const download=page.waitForEvent('download');await review.getByRole('link',{name:'Download recovery data — '+label,exact:true}).click()
     const received=await download,csv=await readFile(await received.path(),'utf8')
     if(label==='Orders'){assert.ok(csv.includes('Awaiting quote'));assert.ok(csv.includes('Keep dock appointment'))}else assert.ok(csv.includes('Legacy order 1042'))
    }
    const live=await fixture.draft();assert.equal(live.tables.some(item=>item.id===fixture.legacy),false)
    assert.equal(live.tables.find(item=>item.id===fixture.orders).fields.some(field=>field.id===fixture.memo),false)
    for(const [index,id]of fixture.records.entries())assert.equal((await h.request(`/api/v1/apps/${fixture.appId}/entities/${fixture.orders}/records/${id}`)).data.record.fields[fixture.amount].value,index===0?'1250.5':null)
    await page.goto(h.origin+'/app/settings');await page.locator('summary').filter({hasText:/^Trash$/}).click()
    const trash=page.getByRole('region',{name:'Trash',exact:true});await trash.getByRole('combobox').selectOption(fixture.appId)
    for(const label of ['Memo','Legacy orders'])await trash.getByRole('button',{name:'Restore '+label,exact:true}).waitFor()
    await owner.capture('field-and-table-trash',trash)
    for(const label of ['Memo','Legacy orders']){
     const restored=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/records/trash/restore'))
     await trash.getByRole('button',{name:'Restore '+label,exact:true}).click();const restoreResponse=await restored;assert.equal(restoreResponse.status(),200,label+': '+await restoreResponse.text())
     await trash.getByRole('status').filter({hasText:'Restored '+label+'.'}).waitFor()
     await owner.capture(label==='Memo'?'field-restored':'table-restored',trash)
    }
    const returned=await fixture.draft();assert.ok(returned.tables.some(item=>item.id===fixture.legacy));assert.ok(returned.tables.find(item=>item.id===fixture.orders).fields.some(field=>field.id===fixture.memo))
    assert.equal((await h.request(`/api/v1/apps/${fixture.appId}/entities/${fixture.orders}/records/${fixture.records[0]}`)).data.record.fields[fixture.memo].value,'Keep dock appointment')
    await page.goto(fixture.url);await page.getByRole('columnheader',{name:'Memo',exact:true}).waitFor();await owner.capture('restored-grid',page.getByRole('columnheader',{name:'Memo',exact:true}))
    // Exercise the builder's own adoption/recovery screen after the delegated
    // owner-review path: currency conversion has no losses but a field removal does.
    await edit();await tile('Amount').getByLabel('Field type',{exact:true}).selectOption('money')
    await tile('Memo').getByRole('button',{name:'Remove field',exact:true}).click()
    const direct=await preview();assert.equal(direct.impacts.flatMap(item=>item.refusals??[]).length,0)
    await owner.capture('owner-direct-preview',page.getByRole('region',{name:'Conversion of Amount',exact:true}))
    await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    const adopted=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/release.adopt'))
    await page.getByRole('button',{name:'Adopt schema',exact:true}).click();assert.equal((await adopted).status(),200)
    await page.getByRole('heading',{name:'Base ready',exact:true}).waitFor();await page.getByRole('link',{name:'Download recovery data',exact:true}).waitFor()
    await owner.capture('builder-adopted-recovery',page.getByRole('heading',{name:'Base ready',exact:true}))
    const linkedBefore=(await h.request(`/api/v1/apps/${fixture.appId}/entities/${fixture.orders}/records/${fixture.records[0]}`)).data.record.fields[fixture.link].value
    await edit();await table('Vendors').click();await page.getByRole('button',{name:'Move table to Trash',exact:true}).click()
    const linkedDeletion=await preview(),sourceImpact=linkedDeletion.impacts.find(item=>item.entityId===fixture.orders)
    assert.ok(linkedDeletion.impacts.some(item=>item.entityId===fixture.vendors&&item.deletedTable))
    assert.ok(sourceImpact.removedFields.some(field=>field.id===fixture.link),'Deletion preview names the inbound field in its source table')
    await page.getByRole('heading',{name:'Orders',exact:true}).waitFor();await page.getByText(sourceImpact.changes.find(change=>change.startsWith('Remove Vendor link:')),{exact:true}).waitFor()
    await owner.capture('linked-table-delete-preview',page.getByRole('heading',{name:'Orders',exact:true}))
    await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    const deleteLinked=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/release.adopt'))
    await page.getByRole('button',{name:'Adopt schema',exact:true}).click();assert.equal((await deleteLinked).status(),200)
    await page.goto(h.origin+'/app/settings');await page.locator('summary').filter({hasText:/^Trash$/}).click()
    const linkedTrash=page.getByRole('region',{name:'Trash',exact:true});await linkedTrash.getByRole('combobox').selectOption(fixture.appId)
    await linkedTrash.getByRole('button',{name:'Restore Vendors',exact:true}).waitFor()
    await owner.capture('linked-table-trash',linkedTrash)
    const restoreLinked=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/records/trash/restore'))
    await linkedTrash.getByRole('button',{name:'Restore Vendors',exact:true}).click()
    const linkedResponse=await restoreLinked;assert.equal(linkedResponse.status(),200,await linkedResponse.text())
    await linkedTrash.getByRole('status').filter({hasText:'Restored Vendors.'}).waitFor()
    await owner.capture('linked-table-restored',linkedTrash)
    const linkedAfter=(await h.request(`/api/v1/apps/${fixture.appId}/entities/${fixture.orders}/records/${fixture.records[0]}`)).data.record.fields[fixture.link].value
    assert.deepEqual(linkedAfter,linkedBefore,'The Settings restore restores the original link identity and value')
    await writeFile(path.join(output,`field-browser-${width}.json`),JSON.stringify({width,checkpoints},null,2))
   }catch(error){
    for(const [index,context]of contexts.entries())for(const page of context.pages())await page.screenshot({path:path.join(output,`field-failed-${index===0?'owner':'creator'}-${width}.png`),fullPage:true})
    throw error
   }finally{for(const context of contexts)await context.close()}
  }
 }finally{await browser?.close();await h?.close()}
}

async function screen(h,browser,width,cookie,output,persona,checkpoints){
 const context=await browser.newContext({acceptDownloads:true,viewport:{width,height:width<=390?844:1000}}),page=await context.newPage(),errors=[]
 await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:h.origin}])
 page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message))
 async function capture(state,target){
  await page.waitForLoadState('networkidle');await target.scrollIntoViewIfNeeded()
  const artifact=path.join(output,`field-${state}-${width}.png`);await page.screenshot({path:artifact,fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,state+': page overflow')
  if(width<=390){const layout=await measureAccessibilityLayout(page);await writeFile(path.join(output,`field-${state}-${width}-layout.json`),JSON.stringify(layout,null,2));assert.equal(layout.viewportWidth,width,state+': actual phone viewport');assert.deepEqual(layout.targetsBelow24.map(control=>({name:control.name,selector:control.selectorPath,width:control.effectiveTargetWidth,height:control.effectiveTargetHeight})),[],state+': active 24x24px touch targets')}
  const report=await new AxeBuilder({page}).analyze(),violations=report.violations.filter(item=>['serious','critical'].includes(item.impact)).map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)}))
  assert.deepEqual(violations,[],state+': serious/critical accessibility');assert.deepEqual(errors,[],state+': browser errors')
  checkpoints.push({state,persona,width,artifact:path.relative(process.cwd(),artifact),serious:0,critical:0,pageOverflow:false})
 }
 return {context,page,capture}
}

async function fieldFixture(h,width){
 const appId=createUlid(),orders=createUlid(),vendors=createUlid(),legacy=createUlid(),amount=createUlid(),phone=createUlid(),memo=createUlid(),order=createUlid(),carrier=createUlid(),link=createUlid(),vendor=createUlid(),legacyName=createUlid(),option=createUlid(),other=createUlid(),name=`Harbor supply ${width}`
 const draft={appId,name,tables:[{id:orders,label:'Orders',primaryFieldId:order,fields:[text(order,'Order',{required:true}),text(amount,'Amount'),text(phone,'Contact phone'),text(memo,'Memo'),{id:carrier,label:'Carrier',type:'select',required:false,unique:false,options:[{id:option,label:'Northline Freight'},{id:other,label:'Unassigned'}]},{id:link,label:'Vendor link',type:'relation',required:false,unique:false,relation:{ownerAppId:appId,entityId:vendors,cardinality:'one',onDelete:'restrict'}}]},{id:vendors,label:'Vendors',primaryFieldId:vendor,fields:[text(vendor,'Vendor',{required:true})]},{id:legacy,label:'Legacy orders',primaryFieldId:legacyName,fields:[text(legacyName,'Order',{required:true})]}]}
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 async function create(entityId,values){const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data;return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:schemaEntity,recordId:entityId},version:schema.version}],input:{appId,entityId,values}}})).data.value}
 const vendorRecord=await create(vendors,{[vendor]:'Northline Freight'})
 const records=[]
 for(const [index,value]of ['1250.50','Awaiting quote'].entries())records.push((await create(orders,{[order]:`Harbor order ${1040+index}`,[amount]:value,[phone]:index===0?'(555) 123-4567':'+442079460123',[memo]:index===0?'Keep dock appointment':'Confirm delivery window',[carrier]:index===0?option:other,[link]:index===0?vendorRecord.ref:null})).id)
 await create(legacy,{[legacyName]:'Legacy order 1042'})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities/${orders}`)).data
 await h.request('/api/v1/commands/view.save',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:schemaEntity,recordId:orders},version:schema.version}],input:{view:{appId,entityId:orders,name:'Invoice review',display:'grid',fields:[order,amount],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:order},visibility:'app',shipped:false}}}})
 const basePerson=createUlid(),email=`field-author-${width}@harbor.example.test`
 await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,'Morgan Lee','member','active',?)").bind(basePerson,email,Date.now()).run()
 const person=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(basePerson).first()).principal_id
 await h.request(`/api/v1/records/bases/${appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:person,role:'creator',version:0}})
 const creatorCookie=(await baseHttpSession(h.origin,email)).cookie
 return {appId,orders,vendors,legacy,amount,phone,memo,link,records,name,creatorCookie,url:`${h.origin}/app/records/${appId}/${orders}`,draft:async()=>(await h.request(`/api/v1/records/bases/${appId}`)).data}
}

function ownedProcesses(){const rows=execFileSync('ps',['-axo','pid,ppid,comm'],{encoding:'utf8'}).trim().split('\n').slice(1).flatMap(line=>{const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);return match?[{pid:Number(match[1]),parent:Number(match[2]),name:match[3]}]:[]}),owned=new Set([process.pid]);let more=true;while(more){more=false;for(const row of rows)if(owned.has(row.parent)&&!owned.has(row.pid)){owned.add(row.pid);more=true}}return rows.filter(row=>owned.has(row.pid))}
