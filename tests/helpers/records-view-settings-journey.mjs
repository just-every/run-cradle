import {displayAction,sortAndGroup,tableAction} from './records-table-tools.mjs'
import {waitForSavedViewSummary} from './records-summary-ready.mjs'
import {compileSchema} from '../../src/domains/records/descriptors.server.ts'
import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {browserCall,liveCommand} from './records-live-fixture.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {assertPortableJsonSchema} from './json-schema-assert.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
const schemaId='00000000000000000000000001',viewId='00000000000000000000000002'
const definition=view=>{const {id,version,createdAt,updatedAt,access,...input}=view;return input}
export async function fixture(page,h){
 const appId=createUlid(),entityId=createUlid(),title=newField('Order'),stage=newField('Status','select'),units=newField('Units','number'),notes=newField('Notes')
 stage.options=[{id:createUlid(),label:'Ready'},{id:createUlid(),label:'Shipped'}]
 const preview=await browserCall(page,'/api/v1/records/schema-preview',{appId,name:'Order fulfillment',tables:[{id:entityId,label:'Orders',fields:[title,stage,units,notes]}]});await browserCall(page,'/api/v1/commands/release.adopt',liveCommand({kind:'manual_schema',previewId:preview.id}))
 const schema=await browserCall(page,`/api/v1/apps/${appId}/entities/${entityId}`),rows=[]
 for(const [name,status,quantity,note]of [['PO-1042',0,'2','Awaiting carrier'],['PO-1043',1,'4',null],['PO-1044',0,null,'Awaiting stock']])rows.push((await browserCall(page,'/api/v1/commands/record.create',liveCommand({appId,entityId,values:{[title.id]:name,[stage.id]:stage.options[status].id,[units.id]:quantity,[notes.id]:note}},[{ref:{appId,entityId:schemaId,recordId:entityId},version:schema.version}]))).value)
 const peer=createUlid(),now=Date.now(),policyId=createUlid()
 await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(peer,'Avery Lane','avery@example.test',now,now).run()
 await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(peer,peer,now,now).run()
 const original=await h.db.prepare('SELECT rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),rules=JSON.parse(original.rules_json).map(rule=>({...rule,id:createUlid(),principals:[{id:peer,kind:'human'}],actions:rule.actions.filter(action=>action!=='release.adopt')}))
 await h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policyId,appId,'Order editors',JSON.stringify(rules),now,now).run();await h.db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,state,version) VALUES(?,?,?,'active',1)").bind(peer,appId,policyId).run()
 const auth=await createFixtureAuth(h.db,{appOrigin:h.origin,sessionSecret:'test-only-records-session-secret-at-least-32-characters',mode:'development'},peer),session=await auth.signIn(peer)
 return {appId,entityId,title,stage,units,notes,rows,schema,peer,policyId,rules,peerCookie:session.cookie,path:`${h.origin}/app/records/${appId}/${entityId}`}
}
export async function viewSettingsJourney(){
 const output=path.resolve('.private/view-settings');await mkdir(output,{recursive:true})
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{for(const width of [1440,390]){
  const h=await recordsBrowserRuntime(0),context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
  let peerContext
  try{
   page.setDefaultTimeout(15000);await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}]);await page.goto(h.origin+'/app')
   const f=await fixture(page,h),base=`/api/v1/apps/${f.appId}/entities/${f.entityId}`
   peerContext=await browser.newContext({viewport:{width,height:width===390?844:1000}});await peerContext.addCookies([{name:f.peerCookie.split('=')[0],value:f.peerCookie.slice(f.peerCookie.indexOf('=')+1),url:h.origin}]);const peer=await peerContext.newPage();await peer.goto(f.path)
   const privateView=(await browserCall(page,'/api/v1/commands/view.save',liveCommand({view:{appId:f.appId,entityId:f.entityId,name:'My receiving queue',display:'grid',fields:[f.title.id],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:f.title.id},visibility:'private',shipped:false}}))).value
   assert.ok(!(await browserCall(peer,`/api/v1/apps/${f.appId}/views`)).items.some(v=>v.id===privateView.id));await browserCall(peer,`/api/v1/views/${privateView.id}/query`,{},404)
   await page.goto(f.path);await sortAndGroup(page);await page.getByLabel('Group',{exact:true}).selectOption(f.stage.id)
   await tableAction(page,'Summary');const rawSummary=page.getByRole('region',{name:'Whole-query summary',exact:true});await rawSummary.getByRole('combobox',{name:/^Summary field/}).selectOption(f.units.id);await rawSummary.getByRole('combobox',{name:/^Calculation/}).selectOption('sum');await rawSummary.getByRole('button',{name:'Calculate summary',exact:true}).click();await rawSummary.locator('strong').filter({hasText:/Sum: 6$/}).waitFor();await j.capture('view-table-summary');await tableAction(page,'Summary')
   await tableAction(page,'Save view');await page.getByLabel('Name',{exact:true}).fill('Dispatch exceptions');await page.getByLabel('Who can use this view',{exact:true}).selectOption('app')
   await page.getByRole('button',{name:'Add summary column',exact:true}).click();await page.getByLabel('Summary column 1',{exact:true}).selectOption(f.units.id);await page.getByLabel('Summary calculation 1',{exact:true}).selectOption('sum')
   await page.getByRole('button',{name:'Add summary column',exact:true}).click();await page.getByLabel('Summary column 2',{exact:true}).selectOption(f.notes.id);await page.getByLabel('Summary calculation 2',{exact:true}).selectOption('empty')
   await page.getByRole('button',{name:'Add colour rule',exact:true}).click();let rule=page.getByRole('group',{name:'Colour rule 1',exact:true});await rule.getByLabel('Field',{exact:true}).selectOption(f.stage.id);await rule.getByLabel('Status',{exact:true}).selectOption(f.stage.options[1].id);await page.getByLabel('Colour 1',{exact:true}).selectOption('coral')
   await page.getByRole('button',{name:'Add colour rule',exact:true}).click();rule=page.getByRole('group',{name:'Colour rule 2',exact:true});await rule.getByLabel('Field',{exact:true}).selectOption(f.units.id);await rule.getByLabel('Units',{exact:true}).fill('4');await page.getByLabel('Colour target 2',{exact:true}).selectOption(f.units.id);await page.getByLabel('Colour 2',{exact:true}).selectOption('lilac')
   await j.capture('view-presentation-editor')
   await j.command(page.locator('form').filter({has:page.getByLabel('Name',{exact:true})}).getByRole('button',{name:'Save view',exact:true}),'view.save')
   const get=async()=> (await browserCall(page,`/api/v1/apps/${f.appId}/views`)).items.find(v=>v.name==='Dispatch exceptions')
   let view=await get();assert.equal(view.summaries.length,2);assert.equal(view.formatting.length,2)
   const open=async(target,name='Dispatch exceptions')=>{await target.goto(f.path);await waitForSavedViewSummary(target,()=>displayAction(target,name))}
   await open(page);const summary=page.getByRole('region',{name:'Saved view summaries',exact:true});assert.deepEqual(await summary.locator('dd').allTextContents(),['6','1']);assert.deepEqual((await summary.getByRole('list',{name:'Group counts'}).locator('li').allTextContents()).sort(),['Ready · 2','Shipped · 1'])
   const shipped=page.locator(`tr[data-view-color="coral"]`);assert.equal(await shipped.count(),1);assert.equal(await shipped.locator(`td[data-field-id="${f.units.id}"][data-view-color="lilac"]`).count(),1)
   await j.capture('view-summary-colours')
   await open(peer);assert.equal(await peer.getByRole('button',{name:'Edit view',exact:true}).isEnabled(),true)
   // Collaborative edits retain original ownership; editor cannot lock the shared view.
   await browserCall(peer,'/api/v1/commands/view.save',liveCommand({id:view.id,view:{...definition(view),locked:true,access:{canEdit:true,canLock:true}}},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]),403)
   const edited=(await browserCall(peer,'/api/v1/commands/view.save',liveCommand({id:view.id,view:{...definition(view),sort:[{fieldId:f.title.id,direction:'desc'}]}},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]))).value
   assert.equal((await h.db.prepare('SELECT owner_id FROM record_views WHERE id=?').bind(view.id).first()).owner_id,'00000000000000000000000981')
   await open(page);await page.getByRole('button',{name:'Edit view',exact:true}).click();await page.getByLabel('Lock view',{exact:true}).check();await j.command(page.locator('form').filter({has:page.getByLabel('Name',{exact:true})}).getByRole('button',{name:'Save view',exact:true}),'view.save');view=await get();assert.equal(view.locked,true);await open(page)
   await open(peer);assert.equal(await peer.getByRole('button',{name:'Edit view',exact:true}).isDisabled(),true);assert.equal(await peer.getByRole('button',{name:'Delete view',exact:true}).isDisabled(),true)
   await browserCall(peer,'/api/v1/commands/view.save',liveCommand({id:view.id,view:{...definition(view),name:'Forbidden edit'}},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]),403)
   await browserCall(peer,'/api/v1/commands/view.delete',liveCommand({viewId:view.id},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]),403)
   await j.capture('view-locked-owner')
   const peerJourney=recordsJourney(peer,h.origin,output,width);await peerJourney.capture('view-locked-editor')
   // Existing action-based creator grants permit locked edits, and their removal fences the next write.
   const creator=f.rules.map(r=>r.entityId===schemaId?{...r,actions:[...r.actions,'release.adopt']}:r);await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(creator),f.policyId).run()
   await browserCall(peer,'/api/v1/commands/view.save',liveCommand({id:view.id,view:definition(view)},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]))
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(f.rules),f.policyId).run();view=await get()
   await browserCall(peer,'/api/v1/commands/view.save',liveCommand({id:view.id,view:definition(view)},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]),403)
   const exported=await browserCall(page,'/api/v1/records/base-export',{appId:f.appId,format:'json'}),snapshot=JSON.parse(exported.content);assertPortableJsonSchema(snapshot);const portable=snapshot.base.views.find(v=>v.id===view.id);assert.equal(portable.locked,true);assert.deepEqual(portable.summaries,view.summaries);assert.deepEqual(portable.formatting,view.formatting)
   const imported=await page.evaluate(async content=>{const csrf=(await(await fetch('/auth/csrf')).json()).csrfToken,form=new FormData();form.append('files',new File([content],'orders.json',{type:'application/json'}));form.append('options',JSON.stringify({name:'Orders copy'}));const r=await fetch('/api/v1/records/base-import/preview',{method:'POST',headers:{'x-csrf-token':csrf},body:form});return {status:r.status,body:await r.json()}},exported.content)
   assert.equal(imported.status,200,JSON.stringify(imported.body));const copied=imported.body.data.portableViews.find(v=>v.name===view.name);assert.equal(copied.locked,true);assert.ok(copied.summaries.every(s=>s.fieldId!==f.units.id&&s.fieldId!==f.notes.id));assert.notEqual(copied.formatting[0].filter.fieldId,f.stage.id)
   // Every column aggregate is computed over all selected rows, including blank cells.
   for(const [aggregate,expected]of [['sum','6'],['average','3'],['min','2'],['max','4'],['count','2'],['empty','1'],['percent-filled','≈ 66.67%']]){
    view=await get();await browserCall(page,'/api/v1/commands/view.save',liveCommand({id:view.id,view:{...definition(view),summaries:[{fieldId:f.units.id,aggregate}]}},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]));await open(page);assert.ok((await page.getByRole('region',{name:'Saved view summaries',exact:true}).locator('dd').innerText()).startsWith(expected))
   }
   await browserCall(page,'/api/v1/commands/record.create',liveCommand({appId:f.appId,entityId:f.entityId,values:{[f.title.id]:'PO-1045',[f.stage.id]:f.stage.options[0].id,[f.units.id]:'1',[f.notes.id]:null}},[{ref:{appId:f.appId,entityId:schemaId,recordId:f.entityId},version:f.schema.version}]))
   view=await get();await browserCall(page,'/api/v1/commands/view.save',liveCommand({id:view.id,view:{...definition(view),summaries:[{fieldId:f.units.id,aggregate:'average'}]}},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]));await open(page);assert.match(await page.getByRole('region',{name:'Saved view summaries',exact:true}).locator('dd').innerText(),/≈ 2.333333/)
   await j.capture('view-fractional-average')
   for(const display of ['board','cards']){
    view=await get();await browserCall(page,'/api/v1/commands/view.save',liveCommand({id:view.id,view:{...definition(view),display,layout:{titleFieldId:f.title.id,...(display==='board'?{boardFieldId:f.stage.id}:{})}}},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]));await open(page)
    const cards=page.locator(display==='board'?'.cr-board-card':'.cr-gallery-card');assert.equal(await cards.locator('p[data-view-color="lilac"]').count(),1);assert.equal(await cards.filter({has:page.getByText('PO-1043',{exact:true})}).getAttribute('data-view-color'),'coral');await cards.filter({has:page.getByText('PO-1043',{exact:true})}).scrollIntoViewIfNeeded();await j.capture(`view-${display}-colours`)
   }
   // Current policy removes rules and summary choices that mention restricted cells.
   const narrowed=f.rules.map(r=>r.entityId===f.entityId?{...r,readableFields:r.readableFields.filter(id=>id!==f.units.id)}:r);await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrowed),f.policyId).run()
   const current=await browserCall(peer,`/api/v1/views/${view.id}/query`,{});assert.ok(current.view.summaries.every(s=>s.fieldId!==f.units.id));assert.equal(current.view.formatting.length,1)
   // Cross the query counter's 10,000+ boundary: summary statistics still read every revision-fenced page.
   const descriptor=compileSchema(f.schema,()=>undefined).descriptor,now=new Date().toISOString()
   for(let offset=0;offset<10001;offset+=100){const statements=[];for(let index=offset;index<Math.min(offset+100,10001);index++)statements.push(h.db.prepare(`INSERT INTO "${descriptor.table.tableId}"(id,version,created_at,updated_at,lifecycle,schema_version,${f.schema.fields.map(field=>'"'+descriptor.fields.get(field.id).column+'"').join(',')}) VALUES(?,1,?,?,'active',1,?,?,?,?)`).bind(createUlid(),now,now,`PO-${20000+index}`,f.stage.options[0].id,'1','Standard replenishment'));await h.db.batch(statements)}
   view=await get();await browserCall(page,'/api/v1/commands/view.save',liveCommand({id:view.id,view:{...definition(view),display:'grid',layout:{titleFieldId:f.title.id},summaries:[{fieldId:f.units.id,aggregate:'sum'}]}},[{ref:{appId:f.appId,entityId:viewId,recordId:view.id},version:view.version}]));await open(page)
   const large=page.getByRole('region',{name:'Saved view summaries',exact:true});assert.equal(await large.locator('dd').innerText(),'10008');assert.match(await large.innerText(),/10005 matching records/);await large.scrollIntoViewIfNeeded();await j.capture('view-large-summary',{viewport:true})

  }catch(error){await page.screenshot({path:path.join(output,`failure-${width}.png`),fullPage:true});throw error}finally{await peerContext?.close();await context.close();await h.close()}
 }}finally{await browser.close()}
}
