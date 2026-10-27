import {closeTablePanel,displayAction,sortAndGroup,tableAction} from './records-table-tools.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {browserCall,liveCommand} from './records-live-fixture.mjs'
import {setupRepairs} from '../../src/apps/repairs/setup.server.ts'
import {repairDescriptors} from '../../src/apps/repairs/descriptors.ts'
import {REPAIRS_APP_ID,REPAIRS_RELEASE_ID,REPAIR_ENTITIES,repairFieldId} from '../../src/apps/repairs/model.ts'
import {RECORD_SCHEMA_ENTITY_ID,RECORD_VIEW_ENTITY_ID} from '../../src/domains/records/contracts.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {assertPortableJsonSchema} from './json-schema-assert.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function galleryFixture(h){
 const owner='00000000000000000000000981',now=new Date().toISOString(),policyId=createUlid()
 await setupRepairs(h.db,{managerId:owner,releaseId:REPAIRS_RELEASE_ID,now})
 const base={principals:[{id:owner,kind:'human'}],rows:{kind:'all',conditions:[]},actions:['record.create','record.patch','view.save','upload.begin','upload.complete'],effect:'allow',purposes:['read','export']}
 const rules=repairDescriptors.map(d=>({...base,id:createUlid(),entityId:d.schema.id,readableFields:d.schema.fields.map(f=>f.id),writableFields:d.schema.fields.map(f=>f.id)}))
 rules.push(...[RECORD_VIEW_ENTITY_ID,RECORD_SCHEMA_ENTITY_ID].map(entityId=>({...base,id:createUlid(),entityId,readableFields:[],writableFields:[]})))
 await h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,1,1)').bind(policyId,REPAIRS_APP_ID,'Equipment catalog editors',JSON.stringify(rules)).run()
 await h.db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,state,version) VALUES(?,?,?,'active',1)").bind(owner,REPAIRS_APP_ID,policyId).run()
 const store=createUlid()
 await h.db.prepare("INSERT INTO repair_stores(id,version,created_at,updated_at,lifecycle,schema_version,name,location,contact_id,active) VALUES(?,1,?,?,'active',1,'West depot','Austin',?,1)").bind(store,now,now,owner).run()
 const ids=[]
 for(const [name,trade]of [['Cold room A','Refrigeration'],['Portable pump','Plumbing'],['Empty inspection','Plumbing']]){
  const id=createUlid();ids.push(id)
  await h.db.prepare("INSERT INTO repair_assets(id,version,created_at,updated_at,lifecycle,schema_version,name,store_id,serial,trade,active) VALUES(?,1,?,?,'active',1,?,?,?,?,1)").bind(id,now,now,name,store,'ASSET-'+ids.length,trade).run()
 }
 return {policyId,rules,ids,appId:REPAIRS_APP_ID,entityId:REPAIR_ENTITIES.assets,title:repairFieldId('assets','name'),group:repairFieldId('assets','trade'),cover:repairFieldId('assets','repair_evidence')}
}
export async function galleryBrowserJourney(){
 const output=path.resolve('.private/gallery');await mkdir(output,{recursive:true})
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{for(const width of [1440,390]){
  const h=await recordsBrowserRuntime(0),context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
  try{
   page.setDefaultTimeout(15000)
   console.log('gallery fixture',width)
   const f=await galleryFixture(h),table=`${h.origin}/app/records/${f.appId}/${f.entityId}`,base=`/api/v1/apps/${f.appId}/entities/${f.entityId}`
   await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
   // Existing attachment-enabled records use their real editor, upload custody and audited patch path.
   for(const [index,name]of ['cooler','pump'].entries()){
    console.log('gallery upload',width,index)
    await page.goto(`${table}/${f.ids[index]}`);await page.getByRole('button',{name:'Edit record',exact:true}).click()
    await page.getByLabel('Add repair evidence',{exact:true}).setInputFiles(path.resolve(`tests/fixtures/gallery/${name}.png`))
    await page.getByRole('button',{name:'Upload file',exact:true}).click();await page.getByRole('button',{name:'File verified',exact:true}).waitFor()
    await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch')
   }
   console.log('gallery render',width)
   await page.goto(table)
   await displayAction(page,'Gallery')
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('.cr-gallery-cover')).filter(img=>img.complete&&img.naturalWidth>0).length===2);assert.equal(await page.locator('.cr-gallery-cover').count(),2)
   await sortAndGroup(page);await page.getByLabel('Group',{exact:true}).selectOption(f.group)
   await sortAndGroup(page);await page.getByLabel('Sort',{exact:true}).selectOption(f.title)
   await j.capture('gallery-grouped')
   await closeTablePanel(page,'Sort and group');await page.getByRole('button',{name:'Filter',exact:true}).click();await page.getByRole('button',{name:'Add condition',exact:true}).click()
   await page.getByLabel('Field',{exact:true}).selectOption(f.group);await page.getByRole('dialog',{name:'Filter',exact:true}).getByLabel('trade',{exact:true}).fill('Plumbing')
   await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.cr-gallery-card').length===2)
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('.cr-gallery-cover')).filter(img=>img.complete&&img.naturalWidth>0).length===1);assert.equal(await page.locator('.cr-gallery-cover').count(),1)
   await j.capture('gallery-filtered')
   await page.getByRole('button',{name:'Filter',exact:true}).click();await page.getByRole('button',{name:'Remove condition 1',exact:true}).click();await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.cr-gallery-card').length===3)
   await tableAction(page,'Visible columns');await page.getByRole('checkbox',{name:'serial',exact:true}).uncheck();await closeTablePanel(page,'Visible columns')
   assert.equal(await page.locator('.cr-gallery-group-title').count(),2)
   await tableAction(page,'Save view')
   await page.getByLabel('Name',{exact:true}).fill('Equipment catalog')
   await page.getByLabel('Gallery cover',{exact:true}).selectOption(f.cover)
   await page.getByLabel('Image fit',{exact:true}).selectOption('contain')
   await j.capture('gallery-settings')
   await j.command(page.locator('form').filter({has:page.getByLabel('Name',{exact:true})}).getByRole('button',{name:'Save view',exact:true}),'view.save')
   await displayAction(page,'Equipment catalog')
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('.cr-gallery-cover')).filter(img=>img.complete&&img.naturalWidth>0).length===2);assert.equal(await page.locator('.cr-gallery-cover').count(),2)
   assert.equal(await page.locator('.cr-gallery-cover').first().evaluate(img=>getComputedStyle(img).objectFit),'contain')
   await j.capture('gallery-saved-fit')
   const view=(await browserCall(page,`/api/v1/apps/${f.appId}/views`)).items.find(v=>v.name==='Equipment catalog')
   assert.equal(view.layout.coverFieldId,f.cover);assert.equal(view.coverFit,'contain');assert.deepEqual(view.groupBy,[f.group]);assert.ok(!view.fields.includes(repairFieldId('assets','serial')))
   const cards=await browserCall(page,`/api/v1/views/${view.id}/query`,{});assert.deepEqual(cards.records.items.map(row=>row.fields[f.title].value),['Empty inspection','Portable pump','Cold room A'])
   await page.locator('.cr-gallery-card').filter({has:page.getByRole('heading',{name:'Cold room A',exact:true})}).getByRole('link',{name:'Open record',exact:true}).click();await page.getByRole('heading',{name:'Cold room A',exact:true}).waitFor()
   await page.goto(table);await displayAction(page,'Equipment catalog');await page.locator('.cr-gallery-card').first().waitFor()
   const row=(await browserCall(page,base+'/records/'+f.ids[0])).record,fileId=row.fields[f.cover].value[0].fileId
   // Restrict the cover while retaining the title and every ordinary field. The saved gallery remains usable.
   const rules=f.rules.map(rule=>rule.entityId===f.entityId?{...rule,readableFields:rule.readableFields.filter(id=>id!==f.cover)}:rule)
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),f.policyId).run()
   await page.waitForFunction(()=>document.querySelectorAll('.cr-gallery-card').length===3 && document.querySelectorAll('.cr-gallery-cover').length===0)
   const refused=await context.request.get(`${h.origin}/api/v1/files/${fileId}/content`);assert.equal(refused.status(),404)
   await j.capture('gallery-restricted-cover')
   const selected=(await browserCall(page,`/api/v1/views/${view.id}/query`,{}));assert.ok(!selected.view.layout.coverFieldId);assert.ok(selected.records.items.every(row=>!Object.hasOwn(row.fields,f.cover)))
   const narrower=rules.map(rule=>rule.entityId===f.entityId?{...rule,rows:{kind:'condition',fieldId:f.title,op:'ne',value:'Cold room A'}}:rule)
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrower),f.policyId).run()
   await page.waitForFunction(()=>document.querySelectorAll('.cr-gallery-card').length===2)
   assert.equal(await page.locator('.cr-gallery-card').getByText('Cold room A',{exact:true}).count(),0)
   assert.equal((await context.request.get(`${h.origin}${base}/records/${f.ids[0]}`)).status(),404)
   await j.capture('gallery-restricted-rows')
   // A gallery's fit setting also travels through the public native exit and return preview.
   const appId=createUlid(),entityId=createUlid(),title=newField('Item'),draft={appId,name:'Portable gallery',tables:[{id:entityId,label:'Items',fields:[title]}]}
   const schemaPreview=await browserCall(page,'/api/v1/records/schema-preview',draft)
   await browserCall(page,'/api/v1/commands/release.adopt',liveCommand({kind:'manual_schema',previewId:schemaPreview.id}))
   await browserCall(page,'/api/v1/commands/view.save',liveCommand({view:{appId,entityId,name:'Portable gallery',display:'cards',fields:[title.id],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:title.id},coverFit:'contain',visibility:'private',shipped:false}}))
   const exit=await browserCall(page,'/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(exit.content)
   assertPortableJsonSchema(snapshot);assert.equal(snapshot.base.views[0].coverFit,'contain')
   const returned=await page.evaluate(async content=>{const csrf=(await(await fetch('/auth/csrf')).json()).csrfToken,form=new FormData();form.append('files',new File([content],'gallery.json',{type:'application/json'}));form.append('options',JSON.stringify({name:'Gallery return'}));const response=await fetch('/api/v1/records/base-import/preview',{method:'POST',headers:{'x-csrf-token':csrf},body:form});return {status:response.status,body:await response.json()}},exit.content)
   assert.equal(returned.status,200,JSON.stringify(returned.body));assert.equal(returned.body.data.portableViews[0].coverFit,'contain')
  }catch(error){console.log('gallery failure',error.message);await page.screenshot({path:path.join(output,`failure-${width}.png`),fullPage:true});throw error}finally{await context.close();await h.close()}
 }}finally{await browser.close()}
}
