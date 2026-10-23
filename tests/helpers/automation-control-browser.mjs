import assert from 'node:assert/strict'
import path from 'node:path'
import {createUlid} from '../../src/core/shared/ids.ts'
export async function automationControlBrowser(page,h,journey,width,output){
 const name=`synthetic-cradle-121 control ${width}`,prefix=`synthetic-cradle-122 ${width} repeat`,items=[]
 for(const letter of ['A','B','C'])items.push((await h.create(`${prefix} ${letter}`)).record)
 const condition=value=>({kind:'condition',fieldId:h.nameId,op:'eq',value}),update=value=>({kind:'update',fieldId:h.statusId,value})
 const saved=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name,appId:h.appId,entityId:h.entityId,event:'created',enabled:true,steps:[{kind:'condition',when:condition('never'),actions:[update('must not run')]},{kind:'branch',paths:[{when:condition(name),actions:[update('branch complete')]}],otherwise:[update('otherwise')]},{kind:'repeat',find:{kind:'condition',fieldId:h.nameId,op:'contains',value:prefix},actions:[update('item complete')]}]}}})).data.result.value
 const trigger=await h.create(name);await h.tick(trigger.commandId)
 let run
 for(let attempt=0;attempt<10;attempt++){
  run=(await h.request(`/api/user-automations/${saved.id}/runs`)).data.runs.find(run=>run.recordId===trigger.record.id)
  if(run?.state==='Complete')break
  const worker=await h.runtime.getWorker();await worker.scheduled({scheduledTime:Date.parse('2026-10-23T12:17:00Z'),cron:'* * * * *'})
 }
 assert.equal(run.state,'Complete');assert.equal(run.items.length,3)
 await page.goto(h.origin+run.href)
 const article=page.locator(`#run-${run.id}`)
 await article.getByRole('heading',{name:'Repeat item results'}).waitFor()
 for(const item of items)await article.getByText(`${item.id}: Complete`,{exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>window.__rerHydration?.count??0),0)
 await journey.capture('automation-control-items')
 await article.screenshot({path:path.join(output,`automation-control-items-detail-${width}.png`)})
 await page.getByRole('button',{name:`Edit ${name}`,exact:true}).click()
 const summary=page.getByRole('region',{name:'Saved control steps'})
 await summary.getByRole('list').first().waitFor()
 assert.equal(await summary.locator('input,select,textarea').count(),0,'Saved control shapes cannot be overwritten by the flat editor')
 await journey.capture('automation-control-summary')
 await summary.screenshot({path:path.join(output,`automation-control-summary-detail-${width}.png`)})
 await h.request(`/api/user-automations/${saved.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:saved.version}})
}
