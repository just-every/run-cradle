import assert from 'node:assert/strict'
import path from 'node:path'
import {createUlid} from '../../src/core/shared/ids.ts'
export async function automationTriggerBrowser(page,h,journey,width,output){
 const anchor=(await h.create(`synthetic-cradle-151 scheduled ${width}`)).record,name=`synthetic-cradle-152 scheduled ${width}`
 const saved=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name,appId:h.appId,entityId:h.entityId,event:'created',enabled:true,trigger:{kind:'schedule',recordId:anchor.id,startsAt:'2026-10-23T12:00:00Z',schedule:{unit:'minutes',every:15}},actions:[{kind:'update',fieldId:h.statusId,value:'scheduled complete'}]}}})).data.result.value
 const worker=await h.runtime.getWorker();await worker.scheduled({scheduledTime:Date.parse('2026-10-23T12:17:00Z'),cron:'* * * * *'})
 const run=(await h.request(`/api/user-automations/${saved.id}/runs`)).data.runs[0];assert.equal(run.state,'Complete')
 await page.goto(h.origin+run.href)
 await page.locator(`#run-${run.id}`).getByText('Complete',{exact:true}).waitFor()
 await page.getByRole('button',{name:`Edit ${name}`,exact:true}).click()
 const summary=page.getByRole('region',{name:'Saved control steps'})
 await summary.getByRole('list').first().waitFor();assert.equal(await summary.locator('input,select,textarea').count(),0)
 assert.equal(await page.evaluate(()=>window.__rerHydration?.count??0),0)
 await journey.capture('automation-schedule-summary')
 await summary.screenshot({path:path.join(output,`automation-schedule-summary-detail-${width}.png`)})
 await h.request(`/api/user-automations/${saved.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:saved.version}})
}
