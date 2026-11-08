import type { DescriptorRegistry, EntityDescriptor } from '../records/descriptors.server'
import { identifier } from '../admission/sql.server'

const literal=(value:string)=>`'${value.replaceAll("'","''")}'`
function trigger(descriptor:EntityDescriptor,operation:'INSERT'|'UPDATE',name:string) {
 const app=literal(descriptor.schema.appId),entity=literal(descriptor.schema.id),event=literal(operation==='INSERT'?'created':'updated')
 const current=`EXISTS(SELECT 1 FROM record_schemas WHERE id=${entity} AND app_id=${app}
  AND version=${descriptor.schema.version} AND physical_revision=${literal(descriptor.schema.physicalRevision)})`
 const definitions=`SELECT json_group_array(json_object('id',a.id,'version',a.definition_version))
  FROM automations a JOIN record_automation_bindings b ON b.automation_id=a.id
  WHERE b.app_id=${app} AND b.entity_id=${entity} AND a.enabled=1
   AND json_extract(a.trigger_config_json,'$.event')=${event}`
 return `CREATE TRIGGER ${identifier(name)} AFTER ${operation} ON ${identifier(descriptor.table.tableId)}
  WHEN NEW.${identifier(descriptor.lifecycleColumn)}<>'deleted' AND ${current} AND EXISTS(SELECT 1 FROM record_automation_context c
   JOIN command_admissions admission ON admission.command_id=c.command_id
   WHERE c.singleton=1 AND c.app_id=${app} AND admission.state='admitted')
  BEGIN
   INSERT OR IGNORE INTO record_automation_events(id,command_id,app_id,entity_id,record_id,event,record_version,
    definitions_json,cause_run_ids_json,created_at)
   SELECT c.command_id||':'||${entity}||':'||NEW.${identifier(descriptor.idColumn)}||':'||${event},
    c.command_id,${app},${entity},NEW.${identifier(descriptor.idColumn)},${event},NEW.${identifier(descriptor.versionColumn)},
    (${definitions}),c.cause_run_ids_json,unixepoch('subsec')*1000 FROM record_automation_context c
    WHERE c.singleton=1 AND json_array_length((${definitions}))>0;
  END`
}

/** Restore compiles the same capture triggers as admitted live schema changes. */
export function recordAutomationCaptureSchema(descriptor:EntityDescriptor) {
 const stem='record_auto_'+descriptor.schema.id.toLowerCase()
 return (['INSERT','UPDATE'] as const).map(operation=>{
  const name=stem+'_'+(operation==='INSERT'?'created':'updated')
  return {name,sql:trigger(descriptor,operation,name),table:descriptor.table.tableId}
 })
}

/** The live schema check prevents an old request from replacing a new table's triggers. */
export async function ensureRecordAutomationTriggers(db:D1Database,descriptors:DescriptorRegistry,additional:readonly {app_id:string;entity_id:string}[]=[]) {
 const bindings=await db.prepare(`SELECT DISTINCT app_id,entity_id FROM record_automation_bindings`).all<{app_id:string;entity_id:string}>()
 for(const binding of [...bindings.results,...additional]) {
  const descriptor=descriptors.get(binding.app_id,binding.entity_id)
  const live=await db.prepare('SELECT version,physical_revision FROM record_schemas WHERE id=? AND app_id=?')
   .bind(binding.entity_id,binding.app_id).first<{version:number;physical_revision:string}>()
  if(!live||live.version!==descriptor.schema.version||live.physical_revision!==descriptor.schema.physicalRevision)continue
  const saved=await db.prepare('SELECT table_name FROM record_automation_triggers WHERE app_id=? AND entity_id=?')
   .bind(binding.app_id,binding.entity_id).first<{table_name:string}>()
  const stem='record_auto_'+binding.entity_id.toLowerCase()
  if(saved?.table_name===descriptor.table.tableId){
   const existing=await db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").bind(stem+'_updated').first<{sql:string}>()
   if(existing?.sql===trigger(descriptor,'UPDATE',stem+'_updated'))continue
  }
  const nonce=crypto.randomUUID()
  await db.batch([
   db.prepare(`INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,0,CASE WHEN EXISTS(
    SELECT 1 FROM record_schemas WHERE id=? AND app_id=? AND version=? AND physical_revision=?) THEN 1 ELSE 0 END`)
    .bind(nonce,binding.entity_id,binding.app_id,descriptor.schema.version,descriptor.schema.physicalRevision),
   db.prepare(`DROP TRIGGER IF EXISTS ${identifier(stem+'_created')}`),db.prepare(`DROP TRIGGER IF EXISTS ${identifier(stem+'_updated')}`),
   db.prepare(trigger(descriptor,'INSERT',stem+'_created')),db.prepare(trigger(descriptor,'UPDATE',stem+'_updated')),
   db.prepare(`INSERT INTO record_automation_triggers(app_id,entity_id,table_name) VALUES(?,?,?)
    ON CONFLICT(app_id,entity_id) DO UPDATE SET table_name=excluded.table_name`).bind(binding.app_id,binding.entity_id,descriptor.table.tableId),
   db.prepare('DELETE FROM admission_assertions WHERE nonce=?').bind(nonce),
  ])
 }
}
