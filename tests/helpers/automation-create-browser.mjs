import assert from 'node:assert/strict'
import path from 'node:path'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function automationCreateBrowser(page,original,journey,width,output){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),statusId=createUlid(),targetId=createUlid(),targetName=createUlid(),quantityId=createUlid()
 const draft={appId,name:`synthetic-cradle-${width} create tests`,tables:[
  {id:entityId,label:'Items',primaryFieldId:nameId,fields:[{id:nameId,label:'Name',type:'text',required:true,unique:false},{id:statusId,label:'Status',type:'text',required:false,unique:false}]},
  {id:targetId,label:`Fulfilments ${width}`,primaryFieldId:targetName,fields:[{id:targetName,label:'Fulfilment',type:'text',required:true,unique:false},{id:quantityId,label:'Quantity',type:'number',required:true,unique:false}]},
 ]}
 const preview=(await original.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await original.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 const entity=(await original.request(`/api/v1/apps/${appId}/entities`)).data.items.find(row=>row.id===entityId)
 const h={...original,appId,entityId,nameId,statusId,entity,create:async name=>{
  const receipt=(await original.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:entity.version}],input:{appId,entityId,values:{[nameId]:name}}}})).data
  return {record:receipt.value}
 }}
 const anchor=(await h.create(`synthetic-cradle-${width} create preview input`)).record
 const name=`synthetic-cradle-${width} create preview`,createdName=`synthetic-cradle-${width} created`
 const saved=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name,appId:h.appId,entityId:h.entityId,event:'created',enabled:false,actions:[{kind:'create',values:{[h.nameId]:createdName,[h.statusId]:'review'}},{kind:'create',entityId:targetId,values:{[targetName]:`synthetic-cradle-${width} fulfilment`,[quantityId]:'3.50'}}]}}})).data.result.value
 const query=async()=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/query`,{method:'POST',body:{limit:200}})).data.items
 const before=(await query()).map(row=>row.id).sort()
 const targets=async()=>(await h.request(`/api/v1/apps/${h.appId}/entities/${targetId}/query`,{method:'POST',body:{limit:100}})).data.items
 await page.goto(`${h.origin}/app/automations?appId=${h.appId}`)
 const records=page.getByRole('region',{name:'Record automations',exact:true})
 await records.getByRole('heading',{name,exact:true}).waitFor()
 await records.getByRole('button',{name:`Edit ${name}`,exact:true}).click()
 const panel=page.getByRole('region',{name:'Test automation',exact:true})
 await panel.getByRole('combobox').first().selectOption(anchor.id)
 const testResponse=page.waitForResponse(response=>response.url().endsWith(`/api/user-automations/${saved.id}/test`)&&response.request().method()==='POST')
 await panel.getByRole('button',{name:'Run test',exact:true}).click()
 const response=await testResponse;assert.equal(response.status(),200,await response.text())
 const dry=(await response.json()).data
 assert.equal(dry.mode,'dry');assert.equal(dry.state,'Complete')
 await panel.getByText('Test · Complete',{exact:true}).waitFor()
 const step=panel.locator('ol > li').first()
 await step.getByText('Input and output',{exact:true}).click()
 await step.getByRole('heading',{name:'Create record',exact:true}).waitFor()
 assert.ok((await step.locator('dl').first().innerText()).includes(`synthetic-cradle-${width} create preview input`),'The test identifies the real triggering record input')
 const proposed=step.locator('dl').nth(1)
 assert.deepEqual(await proposed.locator('dt').allTextContents(),['Name','Status'])
 assert.deepEqual(await proposed.locator('dd').allTextContents(),[createdName,'review'],'Create output displays the new record values independently of the triggering record')
 await step.getByText('Preview only. No records were created.',{exact:true}).waitFor()
 assert.deepEqual((await query()).map(row=>row.id).sort(),before,'The displayed create preview has no native record effect')
 const targetStep=panel.locator('ol > li').nth(1)
 await targetStep.getByText('Input and output',{exact:true}).click()
 await targetStep.getByText(`Fulfilments ${width}`,{exact:true}).waitFor()
 const targetProposed=targetStep.locator('dl').nth(1)
 assert.deepEqual(await targetProposed.locator('dt').allTextContents(),['Fulfilment','Quantity'])
 assert.deepEqual(await targetProposed.locator('dd').allTextContents(),[`synthetic-cradle-${width} fulfilment`,'3.5'],'Target-table preview uses its own field labels and typed values')
 assert.equal((await targets()).length,0,'Dry testing creates no target-table records')
 const liveButton=panel.getByRole('button',{name:'Run confirmed live test',exact:true})
 assert.equal(await liveButton.isDisabled(),true,'The new create effect requires explicit confirmation')
 const confirm=panel.getByRole('checkbox')
 assert.equal(await confirm.count(),2)
 assert.equal(await confirm.nth(0).isChecked(),false);assert.equal(await confirm.nth(1).isChecked(),false)
 assert.ok((await confirm.nth(0).locator('..').innerText()).includes(h.entityId),'The confirmation identifies the create table')
 await panel.evaluate(element=>scrollTo(0,Math.max(0,element.getBoundingClientRect().top+scrollY-80)))
 await journey.capture('automation-create-dry',{viewport:true})
 await panel.screenshot({path:path.join(output,`automation-create-dry-detail-${width}.png`)})
 assert.ok((await confirm.nth(1).locator('..').innerText()).includes(targetId),'The second confirmation names the target table')
 await journey.setChecked(confirm.nth(0),true)
 assert.equal(await liveButton.isDisabled(),true,'Confirming only the triggering table cannot create in another table')
 await journey.setChecked(confirm.nth(1),true)
 assert.equal(await liveButton.isDisabled(),false)
 const liveResponse=page.waitForResponse(response=>response.url().endsWith(`/api/user-automations/${saved.id}/test`)&&response.request().method()==='POST')
 await journey.action(liveButton)
 const liveReply=await liveResponse;assert.equal(liveReply.status(),200,await liveReply.text())
 const live=(await liveReply.json()).data
 assert.equal(live.mode,'live');assert.equal(live.state,'Complete')
 await panel.getByText('Live test · Complete',{exact:true}).waitFor()
 const detail=panel.locator('ol > li').first()
 if(!await detail.getByText('The record was created.',{exact:true}).isVisible())await detail.getByText('Input and output',{exact:true}).click()
 await detail.getByText('The record was created.',{exact:true}).waitFor()
 const recordId=live.steps[0].output.result.recordId
 await detail.getByText(`Created record: ${recordId}`,{exact:true}).waitFor()
 const record=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${recordId}`)).data.record
 assert.equal(record.fields[h.nameId].value,createdName);assert.equal(record.fields[h.statusId].value,'review')
 const targetRows=await targets();assert.equal(targetRows.length,1)
 assert.equal(targetRows[0].id,live.steps[1].output.result.recordId)
 assert.equal(targetRows[0].fields[targetName].value,`synthetic-cradle-${width} fulfilment`)
 assert.equal(targetRows[0].fields[quantityId].value,'3.5')
 const targetDetail=panel.locator('ol > li').nth(1)
 if(!await targetDetail.getByText('The record was created.',{exact:true}).isVisible())await targetDetail.getByText('Input and output',{exact:true}).click()
 await targetDetail.getByText(`Created record: ${targetRows[0].id}`,{exact:true}).waitFor()
 const after=(await query()).map(row=>row.id).sort()
 assert.deepEqual(after,[...before,recordId].sort(),'One confirmed live test creates exactly the displayed record')
 await panel.evaluate(element=>scrollTo(0,Math.max(0,element.getBoundingClientRect().top+scrollY-80)))
 await journey.capture('automation-create-live',{viewport:true})
 await panel.screenshot({path:path.join(output,`automation-create-live-detail-${width}.png`)})
 assert.equal(await page.evaluate(()=>window.__rerHydration?.count??0),0)
}
