import type {RequestContext} from '../../authority/ports'
import type {AdmissionPort,SqlMutation,SqlPredicate} from '../../admission/ports'
import type {createRecordServices} from '../service.server'
import type {EntitySchema} from '../contracts'
import {AdmissionError} from '../../admission/errors'
import {canonical} from '../../admission/canonical'
import {identifier,registerTable,trustedPredicate} from '../../admission/sql.server'
import {compileSchema,createDescriptorRegistry,physicalName,type EntityDescriptor} from '../descriptors.server'
import {createPolicyPort} from '../../authority/policy.server'
import {createApplicationEntityRegistry} from '../../../core/app/composition/entities.server'
import {createManualSchemas} from '../manual/service.server'
import {entitySchema} from '../validators'
import {snapshotValidationValues} from '../validation-values.server'
import type {StoredPreview} from '../manual/release.server'
import {trashTable,type TrashRow} from './storage.server'
import {markerFence,type SchemaTrashDetail,type SchemaRestorePlan} from './schema-markers.server'
type MetadataPlan={guards:SqlPredicate[];mutations:SqlMutation[]}
/** Restage the retained table and its inbound fields as one guarded release. */
export async function restoreHeldTable(db:D1Database,services:ReturnType<typeof createRecordServices>,admission:AdmissionPort,ctx:RequestContext,input:{commandId:string},row:TrashRow,detail:SchemaTrashDetail,accessGuards:SqlPredicate[],metadata:(held:StoredPreview,schema:EntitySchema,at:string,now:string)=>Promise<MetadataPlan>){
 const stored=await db.prepare('SELECT version,schema_json FROM record_schemas WHERE app_id=? AND id=?').bind(row.app_id,row.entity_id).first<{version:number;schema_json:string}>()
 if(!stored||canonical(JSON.parse(stored.schema_json))!==canonical(detail.schema))throw new AdmissionError('version_conflict','The held table schema changed.')
 const release=await db.prepare('SELECT detail_json,created_at FROM manual_record_releases WHERE id=? AND app_id=?').bind(detail.releaseId,row.app_id).first<{detail_json:string;created_at:string}>()
 if(!release)throw new AdmissionError('schema_conflict','The authorized recovery snapshot is unavailable.')
 const held=JSON.parse(release.detail_json) as StoredPreview,now=Date.parse(ctx.now)
 function descriptor(schema:EntitySchema){schema=entitySchema.parse(schema);
  const skeleton={schema,table:registerTable(physicalName(schema),[]),fields:new Map(),idColumn:'id',versionColumn:'version',createdColumn:'created_at',updatedColumn:'updated_at',lifecycleColumn:'lifecycle',schemaVersionColumn:'schema_version'} as EntityDescriptor
  return compileSchema(schema,(app,id)=>id===detail.schema.id&&app===detail.schema.appId?skeleton:services.descriptors.list().find(table=>table.schema.appId===app&&table.schema.id===id),schema.version>1?skeleton:undefined).descriptor
 }
 const retained=descriptor(detail.schema),registry=createDescriptorRegistry([...services.descriptors.list(),retained]),policy=createPolicyPort(db,createApplicationEntityRegistry(registry)),manual=createManualSchemas(db,policy,admission,registry)
 const draft=await manual.read(ctx,row.app_id)
 draft.tables=draft.tables.filter(table=>table.id!==row.entity_id)
 if(draft.tables.some(table=>table.label.toLowerCase()===detail.schema.label.toLowerCase()))throw new AdmissionError('version_conflict','A current table reuses this name; restore will not overwrite it.')
 const schema=detail.schema
 draft.tables.push({id:schema.id,label:schema.label,...(schema.primaryFieldId?{primaryFieldId:schema.primaryFieldId}:{}),fields:structuredClone(schema.fields),...(schema.incomingRelations?{incomingRelations:structuredClone(schema.incomingRelations)}:{}),...(schema.validationRules?{validationRules:structuredClone(schema.validationRules)}:{})})
 const plan:SchemaRestorePlan={tableIds:[row.entity_id],values:{},guards:[...accessGuards,markerFence(row,now),trustedPredicate('EXISTS(SELECT 1 FROM manual_record_releases WHERE id=? AND app_id=? AND detail_json=? AND created_at=?)',[detail.releaseId,row.app_id,release.detail_json,release.created_at])],mutations:[removeMarker(row)]}
 const metadataDone=new Set<string>()
 for(const incoming of detail.inbound??[]){
  const marker=await db.prepare("SELECT * FROM record_trash WHERE app_id=? AND entity_id=? AND record_id=? AND kind='field' AND group_id=?").bind(row.app_id,incoming.entityId,incoming.fieldId,row.group_id).first<TrashRow>()
  if(!marker||marker.expires_at<=now||marker.purge_state!=='held')throw new AdmissionError('version_conflict','An inbound link left this table restore custody; resolve its custody first.')
  const original=JSON.parse(marker.detail_json) as SchemaTrashDetail,field=original.schema.fields.find(field=>field.id===incoming.fieldId),target=draft.tables.find(table=>table.id===incoming.entityId)
  if(!field||!target||field.relation?.ownerAppId!==row.app_id||field.relation.entityId!==row.entity_id)throw new AdmissionError('schema_conflict','The inbound link recovery definition is unavailable.')
  if(target.fields.some(current=>current.id===field.id||current.label.toLowerCase()===field.label.toLowerCase()))throw new AdmissionError('version_conflict','A current field reuses an inbound link identity or name; restore will not overwrite it.')
  const old=descriptor(original.schema),current=registry.get(row.app_id,incoming.entityId),sourceRows=held.snapshots[old.table.tableId]
  if(!sourceRows)throw new AdmissionError('schema_conflict','The inbound link recovery snapshot is unavailable.')
  const records=await db.prepare(`SELECT ${identifier(current.idColumn)} id FROM ${identifier(current.table.tableId)}`).all<{id:string}>(),ids=new Set(records.results.map(record=>record.id)),values=plan.values[incoming.entityId]??={}
  for(const record of sourceRows){const id=String(record[old.idColumn]);if(!ids.has(id))continue;(values[id]??={})[field.id]=snapshotValidationValues({...old,fields:new Map([[field.id,old.fields.get(field.id)!]])},record,held.snapshots)[field.id]??null;ids.delete(id)}
  if(field.required&&ids.size)throw new AdmissionError('version_conflict','New records lack a required inbound link; restore cannot invent their values.')
  const deleted=held.schemas.find(schema=>schema.id===incoming.entityId)
  if(!deleted)throw new AdmissionError('schema_conflict','The inbound link deletion schema is unavailable.')
  if(!metadataDone.has(incoming.entityId)){const restored=await metadata(held,deleted,release.created_at,ctx.now);plan.guards.push(...restored.guards);plan.mutations.push(...restored.mutations);metadataDone.add(incoming.entityId)}
  plan.guards.push(markerFence(marker,now));plan.mutations.push(removeMarker(marker))
  target.fields.splice(Math.min(original.position??target.fields.length,target.fields.length),0,structuredClone(field))
 }
 const preview=await manual.preview(ctx,draft,undefined,plan)
 return manual.adopt(ctx,input.commandId,preview.id)
}
function removeMarker(row:TrashRow):SqlMutation{return {kind:'delete',table:trashTable,where:trustedPredicate('app_id=? AND entity_id=? AND record_id=? AND kind=?',[row.app_id,row.entity_id,row.record_id,row.kind]),expectedRows:1}}
