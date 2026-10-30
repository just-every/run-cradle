import assert from 'node:assert/strict'
import path from 'node:path'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function automationCreateBrowser(page,h,journey,width,output){
 const anchor=(await h.create(`synthetic-cradle-${width} create preview input`)).record
 const name=`synthetic-cradle-${width} create preview`,createdName=`synthetic-cradle-${width} created`
 const saved=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name,appId:h.appId,entityId:h.entityId,event:'created',enabled:false,actions:[{kind:'create',values:{[h.nameId]:createdName,[h.statusId]:'review'}}]}}})).data.result.value
 const query=async()=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/query`,{method:'POST',body:{limit:200}})).data.items
 const before=(await query()).map(row=>row.id).sort()
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
 const liveButton=panel.getByRole('button',{name:'Run confirmed live test',exact:true})
 assert.equal(await liveButton.isDisabled(),true,'The new create effect requires explicit confirmation')
 const confirm=panel.getByRole('checkbox')
 assert.equal(await confirm.count(),1)
 assert.equal(await confirm.isChecked(),false)
 assert.ok((await confirm.locator('..').innerText()).includes(h.entityId),'The confirmation identifies the create table')
 await panel.evaluate(element=>scrollTo(0,Math.max(0,element.getBoundingClientRect().top+scrollY-80)))
 await journey.capture('automation-create-dry',{viewport:true})
 await panel.screenshot({path:path.join(output,`automation-create-dry-detail-${width}.png`)})
 await journey.setChecked(confirm,true)
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
 const after=(await query()).map(row=>row.id).sort()
 assert.deepEqual(after,[...before,recordId].sort(),'One confirmed live test creates exactly the displayed record')
 await panel.evaluate(element=>scrollTo(0,Math.max(0,element.getBoundingClientRect().top+scrollY-80)))
 await journey.capture('automation-create-live',{viewport:true})
 await panel.screenshot({path:path.join(output,`automation-create-live-detail-${width}.png`)})
 assert.equal(await page.evaluate(()=>window.__rerHydration?.count??0),0)
}
