import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {createUlid} from '../../src/core/shared/ids.ts'
export async function automationTestJourney(h,delivered){
 await h.restart({CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64')})
 const person=createUlid(),email='synthetic-cradle-61@example.test'
 await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(person,email,'synthetic-cradle-61',Date.now()).run()
 const mapping=await h.db.prepare('SELECT p.id,p.human_id FROM cradle_base_operators m JOIN authority_principals p ON p.id=m.principal_id WHERE m.base_id=?').bind(person).first()
 await h.request(`/api/v1/records/bases/${h.appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:mapping.id,role:'editor',version:0}})
 const chosen=(await h.create('synthetic-cradle-62 · Packaging approval')).record
 const destination=(await h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,kind:'webhook',url:'https://receiver.example.com/changes'}})).data
 const definition={name:'synthetic-cradle-63',appId:h.appId,entityId:h.entityId,event:'created',enabled:false,actions:[{kind:'update',fieldId:h.statusId,value:'review'},{kind:'notify',operatorId:mapping.human_id,title:'Review the packaging order'},{kind:'email',operatorId:mapping.human_id,subject:'Packaging order',text:'Please review this packaging order.'},{kind:'webhook',destinationId:destination.id}]}
 const save=async(definition,id,version)=>(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition,...(id?{id,version}:{})}})).data.result.value
 const automation=await save(definition),route=`/api/user-automations/${automation.id}/test`,input={commandId:createUlid(),recordId:chosen.id,event:'created'}
 const windowEnd=new Date(Date.now()+60000).toISOString(),rates=async()=>(await h.request('/api/automations?windowEnd='+encodeURIComponent(windowEnd))).automations.map(a=>({id:a.id,rate:a.successRate30Days,runs:a.runCount30Days,succeeded:a.succeededCount30Days}))
 const beforeRates=await rates(),beforeNotifications=(await h.db.prepare('SELECT count(*) n FROM channel_events').first()).n,beforeEffects=(await h.db.prepare('SELECT count(*) n FROM execution_attempts').first()).n
 delivered.length=0
 const tested=(await h.request(route,{method:'POST',body:input})).data
 assert.equal(tested.trigger.matches,true);assert.equal(tested.steps.length,4);assert.ok(tested.steps.every(step=>step.state==='Complete'&&step.input&&step.output))
 assert.deepEqual(tested.steps[0].output,{fieldId:h.statusId,before:null,after:'review'})
 assert.deepEqual(tested.steps[2].output.wouldHaveUsed,[email]);assert.deepEqual(tested.steps[2].output.to,['import-owner@example.test'])
 assert.equal(tested.steps[3].output.sent,false);assert.ok(tested.steps[3].output.wire.headers['webhook-signature'])
 assert.deepEqual(delivered.map(message=>message.to),['import-owner@example.test'],'One test email reaches the builder alone; no webhook reached the network edge')
 const unchanged=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${chosen.id}`)).data.record
 assert.equal(unchanged.version,chosen.version);assert.deepEqual(unchanged.fields,chosen.fields)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_events').first()).n,beforeNotifications)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM execution_attempts').first()).n,beforeEffects)
 assert.deepEqual(await rates(),beforeRates,'Test runs do not change the public success rate or counts')
 const history=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs
 assert.ok(history.some(run=>run.id===tested.id&&run.testMode==='dry'&&run.actions.length===4))
 await h.request(route,{method:'POST',body:input});assert.equal(delivered.length,1,'Replaying a test does not resend its mail')
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-64',permissions:'read',expiresAt:new Date(Date.now()+86400000).toISOString()}})).data.key
 await h.request(route,{method:'POST',secret:key.secret,status:404,body:{...input,commandId:createUlid()}})
 const mismatch=(await h.request(route,{method:'POST',body:{...input,commandId:createUlid(),event:'updated'}})).data
 assert.equal(mismatch.trigger.matches,false);assert.ok(mismatch.steps.every(step=>step.state==='Skipped'));assert.equal(delivered.length,1)
 await h.request(route,{method:'POST',status:409,body:{...input,commandId:createUlid(),live:{previewId:tested.id,effects:[]}}})
 // The confirmed live test uses the supported three actions; no real webhook provider is used.
 const liveAutomation=await save({...definition,actions:definition.actions.slice(0,3)},automation.id,automation.version)
 const dry=(await h.request(route,{method:'POST',body:{...input,commandId:createUlid()}})).data
 const live=(await h.request(route,{method:'POST',body:{...input,commandId:createUlid(),live:{previewId:dry.id,effects:dry.confirmationEffects}}})).data
 assert.equal(live.mode,'live');assert.equal(live.state,'Complete')
 assert.equal((await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${chosen.id}`)).data.record.fields[h.statusId].value,'review')
 assert.equal(delivered.at(-1).to,email,'Only an explicitly confirmed live test sends to the original operator')
 assert.ok((await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.some(run=>run.id===live.id&&run.testMode==='live'))
 await h.request(`/api/user-automations/${automation.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:liveAutomation.version}})
 delivered.length=0
}
