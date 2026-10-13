import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {userAutomationRuntime} from './helpers/user-automation-runtime.mjs'
import {createUlid} from '../src/core/shared/ids.ts'

contract('AUTO-USER-001','real admitted record triggers run notify/email/update once, retain history, and stop disabled or revoked work',async()=>{
 const h=await userAutomationRuntime(18952)
 try {
  const save={commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{
   name:'Welcome record',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[
    {kind:'notify',operatorId:h.operator,title:'A new item needs review'},
    {kind:'email',operatorId:h.operator,subject:'New item',text:'Open Cradle to review the new item.'},
    {kind:'update',fieldId:h.statusId,value:'review'},
   ]}}
  const automation=(await h.request('/api/user-automations',{method:'POST',status:201,body:save})).data.result.value
  const created=await h.create('Automation item')
  await h.tick(created.commandId);await h.tick(created.commandId)
  const runs=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs
  assert.equal(runs.length,1);assert.equal(runs[0].state,'Complete');assert.deepEqual(runs[0].actions.map(action=>action.state),['Complete','Complete','Complete'])
  const record=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${created.record.ref.recordId}`)).data.record
  assert.equal(record.fields[h.statusId].value,'review')
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM channel_events WHERE event_id IN (SELECT id FROM launch_automation_actions WHERE run_id=?)').bind(runs[0].id).first()).n,1)
  assert.equal((await h.db.prepare("SELECT count(*) AS n FROM rer_mail_development_outbox WHERE json_extract(message,'$.subject')='New item'").first()).n,1)
  const loop=(await h.request('/api/user-automations',{method:'POST',status:201,body:{...save,commandId:createUlid(),definition:{...save.definition,name:'One update per chain',event:'updated',actions:[{kind:'update',fieldId:h.statusId,value:'loop-safe'}]}}})).data.result.value
  const changed=await h.patch(record,{[h.statusId]:'start'})
  await h.tick(changed.data.commandId)
  const worker=await h.runtime.getWorker();await worker.scheduled({cron:'* * * * *'})
  const loopRuns=(await h.request(`/api/user-automations/${loop.id}/runs`)).data.runs
  assert.ok(loopRuns.some(run=>run.state==='Complete'));assert.ok(loopRuns.some(run=>run.state==='Suppressed'))
  await h.request(`/api/user-automations/${automation.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:automation.version}})
  const afterDisable=await h.create('Disabled item');await h.tick(afterDisable.commandId)
  assert.equal((await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.length,1)
  await h.db.prepare('UPDATE authority_delegations SET revoked_at=? WHERE automation_id=?').bind(Date.now(),loop.id).run()
  const pending=await h.patch((await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${afterDisable.record.ref.recordId}`)).data.record,{[h.statusId]:'after revocation'})
  await h.tick(pending.data.commandId)
  // Real queue delivery may still be executing the run; wait (bounded) until no run is in flight.
  let revoked=[]
  for(let attempt=0;attempt<40;attempt++){revoked=(await h.request(`/api/user-automations/${loop.id}/runs`)).data.runs;if(!revoked.some(run=>['Queued','Running'].includes(run.state)))break;await new Promise(resolve=>setTimeout(resolve,250))}
  assert.ok(revoked.some(run=>run.state==='Cancelled'))
 }finally{await h.close()}
})
