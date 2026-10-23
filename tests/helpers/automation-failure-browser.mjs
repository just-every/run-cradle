import path from 'node:path'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
export async function automationFailureBrowser(page,h,journey,width,output){
 for(const [kind,state]of [['refused','Failed'],['safe','Failed'],['unknown','Unknown']]){
  const destination=(await h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,kind:'webhook',url:`https://receiver.example.com/${kind}`}})).data
  const name=`synthetic-cradle-81 ${kind} ${width}`
  const saved=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name,appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'webhook',destinationId:destination.id}]}}})).data.result.value
  const created=await h.create(`synthetic-cradle-82 ${kind}`);await h.tick(created.commandId)
  const run=(await h.request(`/api/user-automations/${saved.id}/runs`)).data.runs[0]
  assert.equal(run.state,state)
  await page.goto(h.origin+run.href)
  const article=page.locator(`#run-${run.id}`)
  await article.getByText(state,{exact:true}).waitFor()
  await article.getByText(run.cause,{exact:false}).waitFor()
  assert.ok((await article.getByRole('link',{name:'Link to this run'}).getAttribute('href')).includes(run.id))
  assert.equal(await article.getByRole('button',{name:'Retry safe action'}).count(),kind==='safe'?1:0)
  assert.equal(await page.evaluate(()=>window.__rerHydration?.count??0),0,'No hydration recovery on run history')
  await journey.capture(`automation-failure-${kind}`)
  await article.screenshot({path:path.join(output,`automation-failure-${kind}-detail-${width}.png`)})
  await h.request(`/api/user-automations/${saved.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:saved.version}})
 }
 await page.goto(h.origin+'/app/notifications')
 await page.getByRole('heading',{name:/Notification/}).first().waitFor()
 assert.equal(await page.evaluate(()=>window.__rerHydration?.count??0),0,'No hydration recovery on failure inbox')
 await journey.capture('automation-failure-inbox')
}
