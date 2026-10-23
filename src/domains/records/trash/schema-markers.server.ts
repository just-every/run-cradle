import type {EntitySchema} from '../contracts'
import type {CellValue} from '../../../contracts/primitives'
import type {SqlMutation,SqlPredicate} from '../../admission/ports'
import type {StoredPreview} from '../manual/release.server'
import {trashTable,trashLifetime} from './storage.server'
import {trustedPredicate} from '../../admission/sql.server'
import {canonical} from '../../admission/canonical'
export type SchemaTrashDetail={schema:EntitySchema;fieldId?:string;position?:number;releaseId:string}
export type SchemaRestorePlan={values:Record<string,Record<string,Record<string,CellValue>>>;guards:SqlPredicate[];mutations:SqlMutation[]}
export const liveSchemaPredicate="NOT EXISTS(SELECT 1 FROM record_trash t WHERE t.app_id=record_schemas.app_id AND t.entity_id=record_schemas.id AND t.kind='table')"
/** Schema markers share record Trash's clock and keep references to the existing
 * authorized recovery snapshot, rather than creating another value store. */
export function prepareSchemaTrash(detail:StoredPreview,releaseId:string,actorId:string,now:string):SqlMutation[]{
 const mutations:SqlMutation[]=[],at=Date.parse(now)
 for(const schema of detail.prior){
  const next=detail.schemas.find(s=>s.id===schema.id),removed=next?schema.fields.filter(f=>!next.fields.some(n=>n.id===f.id)):[]
  const objects=next?removed.map(field=>({kind:'field' as const,id:field.id,fieldId:field.id,position:schema.fields.findIndex(f=>f.id===field.id)})):[{kind:'table' as const,id:schema.id}]
  for(const object of objects)mutations.push({kind:'insert',table:trashTable,row:{app_id:schema.appId,entity_id:schema.id,record_id:object.id,group_id:releaseId,actor_id:actorId,deleted_at:at,expires_at:at+trashLifetime,record_version:next?.version??schema.version,schema_version:schema.version,prior_lifecycle:'schema',links_json:'[]',purge_state:'held',kind:object.kind,detail_json:canonical({schema,releaseId,...('fieldId'in object?{fieldId:object.fieldId,position:object.position}:{})})}})
 }
 return mutations
}
/** Expiry stops restoration even when historical revisions/recovery exports
 * still need complete disposal custody. This explicit hold is a named Gap. */
export async function expireSchemaTrash(db:D1Database,now:number){
 await db.prepare("UPDATE record_trash SET purge_state='blocked_recovery_custody' WHERE kind IN ('field','table') AND expires_at<=? AND purge_state='held'").bind(now).run()
}
export function markerFence(row:{app_id:string;entity_id:string;record_id:string;record_version:number;kind:'record'|'field'|'table';detail_json:string},now:number){return trustedPredicate("EXISTS(SELECT 1 FROM record_trash WHERE app_id=? AND entity_id=? AND record_id=? AND record_version=? AND kind=? AND detail_json=? AND expires_at>? AND purge_state='held')",[row.app_id,row.entity_id,row.record_id,row.record_version,row.kind,row.detail_json,now])}
