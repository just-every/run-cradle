import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

/** Real admitted mail is held across a Worker restart, then the native cron releases it once. */
export async function automationQuietHours(h,definition) {
 async function settings(changes) {
  const version=(await h.request('/api/v1/settings')).data.version
  await h.request('/api/v1/commands/settings.update',{method:'POST',body:{commandId:createUlid(),expected:[],input:{version,changes}}})
 }
 const current=new Date(),localHour=(current.getUTCHours()+10)%24
 const quietEnd=(localHour+2)%24,quietStart=(localHour+23)%24
 await settings({timezone:'Australia/Brisbane',quietHoursStart:`${String(quietStart).padStart(2,'0')}:00`,quietHoursEnd:`${String(quietEnd).padStart(2,'0')}:00`})
 const end=new Date(current);end.setUTCHours(end.getUTCHours()+2,0,0,0)
 const saved=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{...definition,name:'Held email',actions:[{kind:'email',operatorId:h.operator,subject:'Quiet-hour item',text:'Wait for the workspace morning.'},{kind:'update',fieldId:h.statusId,value:'mail delivered'}]}}})).data.result.value
 const created=await h.create('Quiet-hour record')
 await h.tick(created.commandId)
 const runs=()=>h.request(`/api/user-automations/${saved.id}/runs`).then(reply=>reply.data.runs)
 const mailCount=async()=>Number((await h.db.prepare("SELECT count(*) n FROM rer_mail_development_outbox WHERE json_extract(message,'$.subject')='Quiet-hour item'").first()).n)
 const held=(await runs())[0]
 assert.equal(held.state,'Held');assert.equal(held.recordLabel,'Quiet-hour record');assert.equal(Date.parse(held.heldUntil),end.getTime())
 assert.equal(await mailCount(),0)
 await h.restart()
 let worker=await h.runtime.getWorker()
 await worker.scheduled({scheduledTime:end.getTime()-1000,cron:'* * * * *'})
 assert.equal((await runs())[0].state,'Held');assert.equal(await mailCount(),0)
 await worker.scheduled({scheduledTime:end.getTime(),cron:'* * * * *'})
 const completed=(await runs())[0]
 assert.equal(completed.state,'Complete');assert.deepEqual(completed.actions.map(action=>action.state),['Complete','Complete'])
 assert.equal(await mailCount(),1)
 const record=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${created.record.ref.recordId}`)).data.record
 assert.equal(record.fields[h.statusId].value,'mail delivered')
 await worker.scheduled({scheduledTime:end.getTime()+60000,cron:'* * * * *'});assert.equal(await mailCount(),1)
 await h.request(`/api/user-automations/${saved.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:saved.version}})
 // The remaining acceptance flow needs immediately due effects, regardless of the wall clock.
 await settings({quietHoursStart:'00:00',quietHoursEnd:'00:00'})
}
