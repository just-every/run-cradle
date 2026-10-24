import type {DescriptorRegistry} from '../descriptors.server'
import {identifier} from '../../admission/sql.server'
const literal=(s:string)=>`'${s.replaceAll("'","''")}'`
/** Import's inert admission never enters this context. Each ordinary command contributes once per record. */
export async function ensureCalendarCapture(db:D1Database,descriptors:DescriptorRegistry){
 const bindings=(await db.prepare('SELECT DISTINCT app_id,entity_id FROM record_calendar_definitions').all<{app_id:string;entity_id:string}>()).results
 for(const b of bindings){const d=descriptors.get(b.app_id,b.entity_id)
  const live=await db.prepare('SELECT version,physical_revision FROM record_schemas WHERE id=? AND app_id=?').bind(b.entity_id,b.app_id).first<{version:number;physical_revision:string}>();if(!live||live.version!==d.schema.version||live.physical_revision!==d.schema.physicalRevision)continue
  for(const {name,sql} of calendarCaptureSchema(d)){
   const prior=await db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").bind(name).first<{sql:string}>();if(prior?.sql===sql)continue
   const nonce=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,0,CASE WHEN EXISTS(SELECT 1 FROM record_schemas WHERE id=? AND app_id=? AND version=? AND physical_revision=?) THEN 1 ELSE 0 END').bind(nonce,b.entity_id,b.app_id,d.schema.version,d.schema.physicalRevision),db.prepare(`DROP TRIGGER IF EXISTS ${identifier(name)}`),db.prepare(sql),db.prepare('DELETE FROM admission_assertions WHERE nonce=?').bind(nonce)])
  }
 }
}

/** The restore adapter uses the same generated trigger definitions as live commands. */
export function calendarCaptureSchema(d: ReturnType<DescriptorRegistry['get']>) {
 const stem='record_calendar_'+d.schema.id.toLowerCase(),app=literal(d.schema.appId),entity=literal(d.schema.id)
 return (['INSERT','UPDATE'] as const).map(operation=>{
  const name=stem+'_'+operation.toLowerCase(),sql=`CREATE TRIGGER ${identifier(name)} AFTER ${operation} ON ${identifier(d.table.tableId)}
   WHEN EXISTS(SELECT 1 FROM record_automation_context c JOIN command_admissions a ON a.command_id=c.command_id WHERE c.singleton=1 AND c.app_id=${app} AND a.state='admitted' AND a.action IN ('record.create','record.patch','record.delete','record.restore','record.undo','record.bulk-commit'))
   AND EXISTS(SELECT 1 FROM record_schemas WHERE id=${entity} AND app_id=${app} AND version=${d.schema.version} AND physical_revision=${literal(d.schema.physicalRevision)})
   BEGIN INSERT OR IGNORE INTO record_calendar_changes(id,definition_id,record_id,command_id,state,created_at,updated_at)
    SELECT c.command_id||':'||definition.id||':'||definition.version||':'||NEW.${identifier(d.idColumn)},definition.id,NEW.${identifier(d.idColumn)},c.command_id,'pending',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM record_automation_context c JOIN record_calendar_definitions definition ON definition.app_id=${app} AND definition.entity_id=${entity} AND definition.enabled=1 WHERE c.singleton=1; END`
  return {name,sql,table:d.table.tableId}
 })
}
