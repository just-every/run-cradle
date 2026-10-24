import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createUlid} from '../../src/core/shared/ids.ts'

/** Observe real HTTP commands, their durable custody, and the provider's receiving edge. */
export function recordCalendarProof({h,call,provider,outlook,appId,entityId,recordId,definitionId}){
 const notificationTitle=`synthetic-cradle-calendar-applied-${recordId}`
 return {
  async capacity(){
   const boundary=await h.db.prepare("SELECT created_at FROM execution_attempts WHERE action='record.calendar.sync' ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET 9").first()
   const due=boundary?Date.parse(boundary.created_at)+60100:0,delay=Math.max(0,due-Date.now())
   assert.ok(delay<=61000,'Calendar capacity uses the existing bounded real minute window')
   if(delay){console.log('CALENDAR_VIEWPORT_CAPACITY',JSON.stringify({reason:'Prior viewport exhausted the installation calendar window',due:new Date(due).toISOString(),milliseconds:delay}));await new Promise(resolve=>setTimeout(resolve,delay))}
   const recent=(await h.db.prepare("SELECT count(*) n FROM execution_attempts WHERE action='record.calendar.sync' AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds')").first()).n
   assert.ok(recent<10,'The ordinary queued change now has real pacing capacity')
  },
  async effect(event,operation){
   const rows=(await h.db.prepare("SELECT id,request_json FROM execution_runs WHERE json_extract(request_json,'$.calendarBinding.definitionId')=? AND json_extract(request_json,'$.calendarBinding.recordId')=? AND json_extract(request_json,'$.calendarBinding.generation')=?").bind(definitionId,recordId,event.generation).all()).results
   assert.equal(rows.length,1,`${operation} has exactly one execution effect for this definition, record and generation`)
   const request=JSON.parse(rows[0].request_json)
   assert.equal(request.action,'record.calendar.sync');assert.equal(request.calendarBinding.operation,operation)
   const run=await call('/api/v1/runs/'+rows[0].id),attempts=(await call('/api/v1/runs/'+run.id+'/attempts')).items
   assert.equal(attempts.length,1,`${operation} has one original attempt`)
   assert.equal(attempts[0].action,'record.calendar.sync')
   const key=`cradle/calendar/${definitionId}/${recordId}/${event.generation}`
   assert.equal(attempts[0].idempotencyKey,key,'The effect key derives from definition, record and event generation')
   if(operation==='create'){
    const write=provider.writes.find(w=>w.method==='POST'&&w.eventId===event.event_id)
    assert.ok(write,'The receiving provider has this create')
    if(outlook)assert.equal(write.body.transactionId,key)
    else assert.equal(write.body.id,createHash('sha256').update(key).digest('hex'),'Google event ID derives from the same effect key')
   }
   return {request,run,attempt:attempts[0]}
  },
  async scopeMismatch({connectionId,otherRecordId,deliver}){
   const prepared=await call(`/api/v1/record-calendar-sync/${definitionId}/records/${otherRecordId}/sync`,{commandId:createUlid()}),runId=prepared.value.runId
   const original=(await call(`/api/v1/runs/${runId}/attempts`)).items
   assert.equal(original.length,1);assert.equal(original[0].state,'prepared')
   const outbox=await h.db.prepare("SELECT id FROM admission_outbox WHERE action='execution.dispatch' AND json_extract(input_json,'$.runId')=? AND state='pending'").bind(runId).first()
   assert.ok(outbox,'The public sync command has a real prepared delivery')
   const writes=provider.writes.length
   // A durable fixture represents account drift after preparation; the sealed effect is untouched.
   await h.db.prepare('UPDATE provider_connections SET account_id=? WHERE id=?').bind(provider.foreignCalendarId,connectionId).run()
   try{
    await deliver({kind:'cradle.outbox.v1',outboxId:outbox.id})
    const attempts=(await call(`/api/v1/runs/${runId}/attempts`)).items
    assert.equal(attempts.length,1);assert.equal(attempts[0].id,original[0].id);assert.equal(attempts[0].state,'refused','Dispatch refuses a prepared calendar effect after its credential account changes')
    assert.equal(attempts[0].firstPossibleEffectAt,null,'No possible provider effect starts on an account mismatch')
    const receipt=await call('/api/v1/receipts/'+attempts[0].receiptId)
    assert.equal(receipt.status,'refused');assert.match(receipt.message,/before any dispatch/)
    assert.equal(provider.writes.length,writes,'A mismatched credential account writes nothing to the provider')
   }finally{await h.db.prepare('UPDATE provider_connections SET account_id=? WHERE id=?').bind(provider.ownedCalendarId,connectionId).run()}
  },
  async approval(commandId){
   const rows=(await h.db.prepare("SELECT actor_id,personal_refs_json FROM admission_audit WHERE command_id=? AND action='record.calendar.approve'").bind(commandId).all()).results
   assert.equal(rows.length,1,'The explicit approval is audited exactly once')
   assert.equal(rows[0].actor_id,'00000000000000000000000981')
   assert.deepEqual(JSON.parse(rows[0].personal_refs_json),[provider.ownedCalendarId],'Approval names the approved calendar ID')
  },
  async automation(page,startFieldId){
   const input={commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-calendar-apply',appId,entityId,event:'updated',trigger:{kind:'fields_updated',fieldIds:[startFieldId]},enabled:true,actions:[{kind:'notify',operatorId:'00000000000000000000000981',title:notificationTitle}]}}
   const response=await page.evaluate(async input=>{const csrf=(await(await fetch('/auth/csrf')).json()).csrfToken,response=await fetch('/api/user-automations',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(input)});return {status:response.status,body:await response.json()}},input)
   assert.equal(response.status,201,JSON.stringify(response.body))
   return response.body.data.result.value
  },
  async applied(automation,commandId){
   const events=(await h.db.prepare('SELECT event,definitions_json FROM record_automation_events WHERE command_id=? AND app_id=? AND entity_id=? AND record_id=?').bind(commandId,appId,entityId,recordId).all()).results
   assert.equal(events.length,1,'Apply to record captures one ordinary record event')
   assert.equal(events[0].event,'updated');assert.ok(JSON.parse(events[0].definitions_json).some(d=>d.id===automation.id))
   const runs=(await call(`/api/user-automations/${automation.id}/runs`)).runs.filter(run=>run.recordId===recordId)
   assert.equal(runs.length,1,'Apply to record starts one automation run')
   assert.equal(runs[0].state,'Complete');assert.deepEqual(runs[0].actions.map(action=>action.state),['Complete'])
   const notifications=(await call('/api/v1/notifications')).items.filter(item=>item.title===notificationTitle)
   assert.equal(notifications.length,1,'The automation produces its notification effect')
  },
 }
}
