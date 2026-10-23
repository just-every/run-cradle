import type {RequestContext} from '../../authority/ports'
import type {AdmissionPort,SqlMutation,SqlPredicate} from '../../admission/ports'
import type {createRecordServices} from '../service.server'
import type {EntitySchema,View,Form} from '../contracts'
import {AdmissionError} from '../../admission/errors'
import {canonical,canonicalHash} from '../../admission/canonical'
import {identifier,trustedPredicate} from '../../admission/sql.server'
import {compileSchema,physicalName,type EntityDescriptor} from '../descriptors.server'
import {snapshotValidationValues} from '../validation-values.server'
import {currentSchemaView,currentSchemaForm} from '../metadata-schema'
import {viewTable,formTable} from '../metadata.server'
import {createManualSchemas} from '../manual/service.server'
import {baseAccess} from '../manual/base-access.server'
import {manualAuthority,bases} from '../manual/authority.server'
import type {StoredPreview} from '../manual/release.server'
import {trashTable,type TrashRow} from './storage.server'
import {markerFence,type SchemaTrashDetail,type SchemaRestorePlan} from './schema-markers.server'

export function schemaTrashService(db:D1Database,services:ReturnType<typeof createRecordServices>,admission:AdmissionPort){
 const manual=createManualSchemas(db,services.policy,admission,services.descriptors)
 async function authority(ctx:RequestContext,appId:string){const access=await baseAccess(db,ctx,appId);if(!access?.canDestruct)throw new AdmissionError('forbidden','Restoring a field or table requires current base-owner destructive authority.');return access}
 async function restore(ctx:RequestContext,input:{kind:'field'|'table';commandId:string;appId:string;entityId:string;recordId:string;version:number}){
  const access=await authority(ctx,input.appId),row=await db.prepare("SELECT * FROM record_trash WHERE app_id=? AND entity_id=? AND record_id=? AND kind=?").bind(input.appId,input.entityId,input.recordId,input.kind).first<TrashRow>()
  if(!row)throw new AdmissionError('not_found','Schema item not found in Trash.')
  if(row.record_version!==input.version)throw new AdmissionError('version_conflict','The schema Trash item changed.')
  if(row.expires_at<=Date.parse(ctx.now)||row.purge_state!=='held')throw new AdmissionError('invalid_transition','The 30-day restore window expired; recovery custody is awaiting disposal.')
  const detail=JSON.parse(row.detail_json) as SchemaTrashDetail,draft=await manual.read(ctx,input.appId)
  if(detail.schema.appId!==row.app_id||detail.schema.id!==row.entity_id||(row.kind==='table'?row.record_id!==detail.schema.id:row.record_id!==detail.fieldId))throw new AdmissionError('schema_conflict','The schema Trash identity does not match its held definition.')
  if(input.kind==='table'){
   if(services.descriptors.list().some(table=>table.schema.id===detail.schema.id)||draft.tables.some(table=>table.id===detail.schema.id||table.label.toLowerCase()===detail.schema.label.toLowerCase()))throw new AdmissionError('version_conflict','A current table reuses this identity or name; restore will not overwrite it.')
   const stored=await db.prepare('SELECT version,schema_json FROM record_schemas WHERE app_id=? AND id=?').bind(row.app_id,row.entity_id).first<{version:number;schema_json:string}>()
   if(!stored||canonical(JSON.parse(stored.schema_json))!==canonical(detail.schema))throw new AdmissionError('version_conflict','The held table schema changed.')
   // Table deletion is restricted to isolated tables. Its canonical data and
   // schema pointer never move, so restoration cannot overwrite a newer row.
   const base=await db.prepare('SELECT version,release_id FROM manual_record_bases WHERE id=?').bind(row.app_id).first<{version:number;release_id:string}>(),hash=await canonicalHash(input),permit=await manualAuthority(db,services.policy,ctx,row.app_id,hash)
   if(!base)throw new AdmissionError('schema_conflict','The parent base is unavailable.')
   const nameFence=trustedPredicate("NOT EXISTS(SELECT 1 FROM record_schemas s WHERE s.app_id=? AND s.id<>? AND lower(json_extract(s.schema_json,'$.label'))=lower(?) AND NOT EXISTS(SELECT 1 FROM record_trash t WHERE t.app_id=s.app_id AND t.entity_id=s.id AND t.kind='table'))",[row.app_id,row.entity_id,detail.schema.label])
   return admission.commit(ctx,{commandId:input.commandId,action:'table.restore',appId:row.app_id,canonicalInputHash:hash,permit:{...permit,action:'table.restore'},guards:[...access.guards,markerFence(row,Date.parse(ctx.now)),nameFence,trustedPredicate('EXISTS(SELECT 1 FROM record_schemas WHERE app_id=? AND id=? AND version=? AND schema_json=?)',[row.app_id,row.entity_id,stored.version,stored.schema_json])],mutations:[{kind:'delete',table:trashTable,where:trustedPredicate("app_id=? AND entity_id=? AND record_id=? AND kind='table'",[row.app_id,row.entity_id,row.record_id]),expectedRows:1},{kind:'update',table:bases,set:{version:base.version+1,updated_at:ctx.now},where:trustedPredicate('id=? AND version=? AND release_id=?',[row.app_id,base.version,base.release_id]),expectedRows:1}],audit:[{action:'table.restore',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{restored:[{kind:'table',id:row.record_id}]}})
  }
  const target=draft.tables.find(table=>table.id===row.entity_id),field=detail.schema.fields.find(field=>field.id===detail.fieldId)
  if(!target||!field)throw new AdmissionError('schema_conflict','The field parent or held definition is unavailable.')
  if(target.fields.some(current=>current.id===field.id||current.label.toLowerCase()===field.label.toLowerCase()))throw new AdmissionError('version_conflict','A current field reuses this identity or name; restore will not overwrite it.')
  const release=await db.prepare('SELECT detail_json,created_at FROM manual_record_releases WHERE id=? AND app_id=?').bind(detail.releaseId,row.app_id).first<{detail_json:string;created_at:string}>()
  if(!release)throw new AdmissionError('schema_conflict','The authorized recovery snapshot is unavailable.')
  const held=JSON.parse(release.detail_json) as StoredPreview,old=descriptor(detail.schema),current=services.descriptors.get(row.app_id,row.entity_id),rows=await db.prepare(`SELECT ${identifier(current.idColumn)} id FROM ${identifier(current.table.tableId)}`).all<{id:string}>(),ids=new Set(rows.results.map(record=>record.id)),values:SchemaRestorePlan['values']={[row.entity_id]:{}}
  const sourceRows=held.snapshots[physicalName(detail.schema)],sourceField=old.fields.get(field.id)!
  if(!held.prior.some(schema=>canonical(schema)===canonical(detail.schema))||!sourceRows||sourceField.join&&!held.snapshots[sourceField.join.table.tableId])throw new AdmissionError('schema_conflict','The retained field recovery snapshot is incomplete or changed.')
  for(const record of sourceRows){const id=String(record.id);if(!ids.has(id))continue;values[row.entity_id]![id]={[field.id]:snapshotValidationValues(old,record,held.snapshots)[field.id]??null};ids.delete(id)}
  if(field.required&&ids.size)throw new AdmissionError('version_conflict','New records lack this required field; restore cannot invent their values.')
  for(const byRecord of Object.values(values[row.entity_id]!))for(const ref of field.type==='relation'?(Array.isArray(byRecord[field.id])?byRecord[field.id]:byRecord[field.id]?[byRecord[field.id]]:[]) as import('../../../contracts/primitives').Ref[]:[]){let linked:EntityDescriptor;try{linked=services.descriptors.get(ref.appId,ref.entityId)}catch{throw new AdmissionError('version_conflict','A retained linked table is unavailable.')}if(!await db.prepare(`SELECT 1 FROM ${identifier(linked.table.tableId)} WHERE ${identifier(linked.idColumn)}=? AND ${identifier(linked.lifecycleColumn)}<>'deleted'`).bind(ref.recordId).first())throw new AdmissionError('version_conflict','A retained link target is unavailable; restore refuses to lose or invent links.')}
  const deletionSchema=held.schemas.find(schema=>schema.id===row.entity_id&&schema.appId===row.app_id)
  if(!deletionSchema)throw new AdmissionError('schema_conflict','The field deletion schema is unavailable.')
  const metadata=await restoreMetadata(held,deletionSchema,release.created_at,ctx.now)
  target.fields.splice(Math.min(detail.position??target.fields.length,target.fields.length),0,field)
  const plan:SchemaRestorePlan={values,guards:[...access.guards,markerFence(row,Date.parse(ctx.now)),trustedPredicate('EXISTS(SELECT 1 FROM manual_record_releases WHERE id=? AND app_id=? AND detail_json=? AND created_at=?)',[detail.releaseId,row.app_id,release.detail_json,release.created_at]),...metadata.guards],mutations:[...metadata.mutations,{kind:'delete',table:trashTable,where:trustedPredicate("app_id=? AND entity_id=? AND record_id=? AND kind='field'",[row.app_id,row.entity_id,row.record_id]),expectedRows:1}]}
  const preview=await manual.preview(ctx,draft,undefined,plan)
  return manual.adopt(ctx,input.commandId,preview.id)
 }
 function descriptor(schema:EntitySchema){const skeleton={schema,table:{tableId:physicalName(schema)},fields:new Map(),idColumn:'id',versionColumn:'version',createdColumn:'created_at',updatedColumn:'updated_at',lifecycleColumn:'lifecycle',schemaVersionColumn:'schema_version'} as EntityDescriptor;return compileSchema(schema,(app,id)=>services.descriptors.list().find(d=>d.schema.appId===app&&d.schema.id===id),schema.version>1?skeleton:undefined).descriptor}
 async function restoreMetadata(held:StoredPreview,schema:EntitySchema,deletedAt:string,now:string){
  const mutations:SqlMutation[]=[],guards:SqlPredicate[]=[]
  for(const [table,snapshots]of [[viewTable,held.viewSnapshots??[]],[formTable,held.formSnapshots??[]]] as const)for(const snapshot of snapshots){
   const original=JSON.parse(snapshot.definition_json) as View&Form;if(original.entityId!==schema.id)continue
   const pruned=table===viewTable?currentSchemaView(original,schema):currentSchemaForm(original,schema)
   if(canonical(pruned)===canonical(original))continue
   const expected=canonical({...pruned,version:snapshot.version+1,updatedAt:deletedAt}),current=await db.prepare(`SELECT version,definition_json FROM ${table.tableId} WHERE id=?`).bind(snapshot.id).first<{version:number;definition_json:string}>()
   if(!current||current.version!==snapshot.version+1||current.definition_json!==expected)throw new AdmissionError('version_conflict','A dependent view or form changed after deletion; restore refuses to overwrite it.')
   guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${table.tableId} WHERE id=? AND version=? AND definition_json=?)`,[snapshot.id,current.version,expected]));mutations.push({kind:'update',table,set:{version:current.version+1,definition_json:canonical({...original,version:current.version+1,updatedAt:now}),updated_at:now},where:trustedPredicate('id=? AND version=? AND definition_json=?',[snapshot.id,current.version,expected]),expectedRows:1})
  }
  return {mutations,guards}
 }
 return {restore,async list(ctx:RequestContext,appId:string){try{await authority(ctx,appId)}catch(error){if(error instanceof Error&&'code'in error&&['forbidden','not_found'].includes(String(error.code)))return [];throw error}const rows=await db.prepare("SELECT * FROM record_trash WHERE app_id=? AND kind IN ('field','table') ORDER BY deleted_at,record_id LIMIT 200").bind(appId).all<TrashRow>();return rows.results.map(row=>{const detail=JSON.parse(row.detail_json) as SchemaTrashDetail,field=detail.schema.fields.find(field=>field.id===detail.fieldId);return {kind:row.kind,id:row.record_id,entityId:row.entity_id,entityLabel:row.kind==='field'?detail.schema.label+' · Field':'Table',name:field?.label??detail.schema.label,version:row.record_version,deletedAt:new Date(row.deleted_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),restorable:row.expires_at>Date.parse(ctx.now)&&row.purge_state==='held',purgeState:row.purge_state}})}}
}
