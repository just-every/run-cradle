import { delegationCommandId } from '../authority/user-delegation.server'
import { recordAutomationDefinition, type RecordAutomationDefinition } from './contracts'

export type AutomationRun = {
 id:string; automation_id:string; definition_version:number; subject_id:string;
 state:string; definition_json:string; cause_run_ids_json:string;
 principal_id:string; credential_id:string|null; app_id:string; entity_id:string;
}
export type AutomationActionRun = {
 id:string; position:number; state:string; idempotency_key:string;
 started_at:number|null; result_json:string|null;
}
type CapturedEvent={id:string;command_id:string;app_id:string;entity_id:string;record_id:string;
 event:string;record_version:number;definitions_json:string;cause_run_ids_json:string;created_at:number}

/** Capture and action receipts are durable; queue delivery never supplies effect authority. */
export function createAutomationRunStore(db:D1Database) {
 return {
  async stage(commandId?:string) {
   const events=await db.prepare(`SELECT e.* FROM record_automation_events e
    JOIN command_admissions c ON c.command_id=e.command_id AND c.state='committed'
    WHERE e.state='pending' ${commandId?'AND e.command_id=?':''} ORDER BY e.created_at,e.id LIMIT 50`)
    .bind(...(commandId?[commandId]:[])).all<CapturedEvent>()
   for(const event of events.results) {
    const refs=JSON.parse(event.definitions_json) as {id:string;version:number}[]
    const causes=JSON.parse(event.cause_run_ids_json) as string[]
    const statements:D1PreparedStatement[]=[]
    for(const ref of refs) {
     const saved=await db.prepare(`SELECT v.definition_json,b.owner_id FROM record_automation_versions v
      JOIN record_automation_bindings b ON b.automation_id=v.automation_id
      WHERE v.automation_id=? AND v.definition_version=? AND b.app_id=? AND b.entity_id=?`)
      .bind(ref.id,ref.version,event.app_id,event.entity_id).first<{definition_json:string;owner_id:string}>()
     if(!saved)throw new Error('Captured automation definition is unavailable')
     const definition=recordAutomationDefinition.parse(JSON.parse(saved.definition_json))
     const id=await delegationCommandId(event.id,`${ref.id}:${ref.version}`)
     const ancestors=causes.length?await db.prepare(`SELECT id,automation_id FROM automation_runs WHERE id IN (${causes.map(()=>'?').join(',')}) UNION ALL SELECT id,automation_id FROM record_automation_tests WHERE id IN (${causes.map(()=>'?').join(',')})`)
      .bind(...causes,...causes).all<{id:string;automation_id:string}>():{results:[]}
     const suppressed=causes.length>=10||ancestors.results.some(run=>run.automation_id===ref.id)
     const state=suppressed?'Suppressed':'Queued',now=Date.now()
     const snapshot=JSON.stringify({definition,event:{commandId:event.command_id,event:event.event,
      ref:{appId:event.app_id,entityId:event.entity_id,recordId:event.record_id},version:event.record_version}})
     statements.push(db.prepare(`INSERT INTO automation_runs(id,created_at,updated_at,version,automation_id,
      definition_version,subject_id,state,queued_at,finished_at,affected_count,error_code,trigger_key,
      definition_json,cause_run_ids_json,initiated_by_id)
      SELECT ?,?,?,1,?,?,?,?,?,?,0,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM record_automation_events
       WHERE id=? AND state='pending') ON CONFLICT DO NOTHING`)
      .bind(id,now,now,ref.id,ref.version,event.record_id,state,event.created_at,suppressed?now:null,
       suppressed?'automation_loop':null,event.id,snapshot,JSON.stringify(causes),saved.owner_id,event.id))
     for(let position=0;position<definition.actions.length;position++) {
      const actionId=await delegationCommandId(id,String(position))
      statements.push(db.prepare(`INSERT INTO launch_automation_actions(id,run_id,position,idempotency_key,state)
       SELECT ?,?,?,?,'Pending' WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND state='Queued')
       ON CONFLICT(run_id,position) DO NOTHING`).bind(actionId,id,position,actionId,id))
     }
    }
    statements.push(db.prepare("UPDATE record_automation_events SET state='complete' WHERE id=? AND state='pending'").bind(event.id))
    await db.batch(statements)
   }
  },
  async pending() {
   return (await db.prepare(`SELECT r.*,v.principal_id,v.credential_id,b.app_id,b.entity_id FROM automation_runs r
    JOIN record_automation_versions v ON v.automation_id=r.automation_id AND v.definition_version=r.definition_version
    JOIN record_automation_bindings b ON b.automation_id=r.automation_id
    WHERE r.state IN ('Queued','Running') ORDER BY r.queued_at,r.id LIMIT 50`).all<AutomationRun>()).results
  },
  async actions(runId:string) {
   return (await db.prepare('SELECT id,position,state,idempotency_key,started_at,result_json FROM launch_automation_actions WHERE run_id=? ORDER BY position')
    .bind(runId).all<AutomationActionRun>()).results
  },
  async hold(actionId:string,until:number) {
   await db.prepare("UPDATE launch_automation_actions SET result_json=? WHERE id=? AND state='Pending'")
    .bind(JSON.stringify({heldUntil:new Date(until).toISOString()}),actionId).run()
  },
  async claim(run:AutomationRun,action:AutomationActionRun,guard:{sql:string;values:readonly unknown[]}) {
   const now=Date.now()
   const claimed=await db.prepare(`UPDATE launch_automation_actions SET state='Running',started_at=?
    WHERE id=? AND run_id=? AND state='Pending' AND EXISTS(SELECT 1 FROM automations WHERE id=? AND enabled=1)
    AND (${guard.sql}) RETURNING id`).bind(now,action.id,run.id,run.automation_id,...guard.values).first()
   if(!claimed)return false
   await db.prepare("UPDATE automation_runs SET state='Running',started_at=coalesce(started_at,?),updated_at=?,version=version+1 WHERE id=? AND state='Queued'")
    .bind(now,now,run.id).run()
   return true
  },
  async actionFinished(id:string,state:'Complete'|'Failed'|'Unknown',result:unknown,errorCode:string|null=null) {
   await db.prepare(`UPDATE launch_automation_actions SET state=?,result_json=?,error_code=?,finished_at=?
    WHERE id=? AND state='Running'`).bind(state,JSON.stringify(result),errorCode,Date.now(),id).run()
  },
  async finish(runId:string,state:'Complete'|'Failed'|'Unknown'|'Cancelled',errorCode:string|null=null) {
   const now=Date.now()
   await db.prepare(`UPDATE automation_runs SET state=?,error_code=?,finished_at=?,updated_at=?,version=version+1
    WHERE id=? AND state IN ('Queued','Running')`).bind(state,errorCode,now,now,runId).run()
  },
 }
}

export function runSnapshot(run:AutomationRun):{definition:RecordAutomationDefinition;event:{commandId:string;event:string;ref:{appId:string;entityId:string;recordId:string};version:number}} {
 const saved=JSON.parse(run.definition_json)
 return {...saved,definition:recordAutomationDefinition.parse(saved.definition)}
}
