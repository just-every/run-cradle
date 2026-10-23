import type { AdmissionPort } from '../../../domains/admission/ports'
/** Publication never changes the durable command or provider state. A failed send is
 * recoverable from admission_outbox; every retry retains the original outbox ID. */
export function withAdmissionWake(admission: AdmissionPort, db: D1Database, queue: Queue): AdmissionPort {
  return {...admission, async commit(ctx, plan) {
    const receipt=await admission.commit(ctx,plan)
    try {
      const rows=await db.prepare("SELECT id FROM admission_outbox WHERE command_id=? AND state='pending' AND not_before<=? ORDER BY id").bind(plan.commandId,new Date().toISOString()).all<{id:string}>()
      for(let offset=0;offset<rows.results.length;offset+=100)await queue.sendBatch(rows.results.slice(offset,offset+100).map(row=>({body:{kind:'cradle.outbox.v1',outboxId:row.id}})))
      const due=await db.prepare("SELECT 1 FROM channel_deliveries WHERE state='queued' AND due_at<=? LIMIT 1").bind(Date.now()).first()
      if(due)await queue.send({kind:'cradle.channels.wake.v1'})
      const launch=await db.prepare("SELECT 1 FROM admission_events WHERE command_id=? AND app_id='00000000000000000000000700' LIMIT 1").bind(plan.commandId).first()
      if(launch)await queue.send({kind:'cradle.launch.events.v1',commandId:plan.commandId})
      const records=await db.prepare("SELECT 1 WHERE EXISTS(SELECT 1 FROM record_automation_events WHERE command_id=?1 AND state='pending') OR EXISTS(SELECT 1 FROM record_calendar_changes WHERE command_id=?1 AND state='pending')").bind(plan.commandId).first()
      if(records)await queue.send({kind:'cradle.records.automations.v1',commandId:plan.commandId})
      const changes=await db.prepare("SELECT 1 FROM record_change_subscriptions WHERE app_id=? AND state='active' AND expires_at>? AND EXISTS(SELECT 1 FROM admission_audit WHERE command_id=? AND action IN ('record.create','record.patch','record.delete','record.undo')) LIMIT 1").bind(plan.appId,Date.now(),plan.commandId).first()
      if(changes)await queue.send({kind:'cradle.changes.v1',commandId:plan.commandId})
      const warehouse=plan.action==='warehouse.save'
      if(warehouse)await queue.send({kind:'cradle.warehouse.wake.v1'})
      if(rows.results.length||due||records||launch||warehouse||changes)await db.prepare("INSERT INTO runtime_queue_publications(command_id,state,attempts,checked_at,error_code) VALUES(?,'published',1,?,NULL) ON CONFLICT(command_id) DO UPDATE SET state='published',attempts=attempts+1,checked_at=excluded.checked_at,error_code=NULL").bind(plan.commandId,new Date().toISOString()).run()
    } catch {
      // The client receives the real admission outcome, never a claim that mail or
      // another external effect completed. Cron scans the original durable work.
      await db.prepare("INSERT INTO runtime_queue_publications(command_id,state,attempts,checked_at,error_code) VALUES(?,'unknown',1,?,'queue_publication_unknown') ON CONFLICT(command_id) DO UPDATE SET state='unknown',attempts=attempts+1,checked_at=excluded.checked_at,error_code=excluded.error_code").bind(plan.commandId,new Date().toISOString()).run()
    }
    return receipt
  }}
}
