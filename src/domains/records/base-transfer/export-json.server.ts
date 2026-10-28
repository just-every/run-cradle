import {prepareBaseStream} from './stream-source.server'
import {auditOperation} from '../../admission/operation-audit.server'
import {isReferenceValue} from '../store-references'
import {exportStoreCell} from './export-store.server'
import { exportTimelineSettings } from './timeline-portable'
import type { RequestContext } from '../../authority/ports'
import type { createRecordServices } from '../service.server'
import type { DescriptorRegistry } from '../descriptors.server'
import type { Field,Filter } from '../contracts'
import type { CellValue } from '../../../contracts/primitives'
import type { PortableBase,PortableField } from './json-format'
import { validatePortableBase } from './json-validation'
import { snapshotTables } from '../manual/snapshot.server'
import { assertGuards } from '../fence.server'
import { trustedPredicate } from '../../admission/sql.server'
import { AdmissionError } from '../../admission/errors'

export function portableField(field:Field,schema:import('../contracts').EntitySchema,registry:DescriptorRegistry):PortableField {
 const {id,label,type,required,unique}=field
 if(type==='attachment'&&field.defaultValue!==undefined&&field.defaultValue!==null&&(!Array.isArray(field.defaultValue)||field.defaultValue.length))throw new AdmissionError('validation',`${label}: attachment defaults have no portable representation.`)
 if(!['email','rating','duration','phone','text','url','number','date','instant','money','boolean','select','multi_select','person','relation','attachment','computed'].includes(type))throw new AdmissionError('validation',`${label}: this field type has no base JSON representation.`)
 const relation=field.expression?.kind==='rollup'?schema.fields.find(f=>f.id===(field.expression as Extract<NonNullable<Field['expression']>,{kind:'rollup'}>).relationFieldId)?.relation:undefined
 const source=relation&&field.expression?.kind==='rollup'?registry.get(relation.ownerAppId,relation.entityId).fields.get(field.expression.valueFieldId)?.field:undefined
 const lookup=source&&['email','rating','duration','phone','text','url','number','date','boolean','select'].includes(source.type)&&relation?.cardinality==='one'&&field.expression?.kind==='rollup'&&field.expression.aggregate==='lookup'&&!field.expression.filter&&field.expression.separator===undefined&&field.expression.sort===undefined&&field.expression.limit===undefined?field.expression:null
 return {id,label,type:type as PortableField['type'],required,unique,...(field.validation?{validation:structuredClone(field.validation)}:{}),...(field.defaultValue!==undefined?{defaultValue:structuredClone(field.defaultValue)}:{}),...(field.options?{options:field.options.map(o=>({id:o.id,label:o.label}))}:{}),...(field.linkPicker?{linkPicker:structuredClone(field.linkPicker)}:{}),...(field.numberFormat?{numberFormat:field.numberFormat}:{}),...(field.relation?{relation:{tableId:field.relation.entityId,cardinality:field.relation.cardinality,onDelete:field.relation.onDelete as 'restrict'}}:{}),...(field.expression?{...(lookup?{lookup:{relationFieldId:lookup.relationFieldId,valueFieldId:lookup.valueFieldId}}:{expression:structuredClone(field.expression)}),resultType:field.resultType as PortableField['resultType'],...(field.resultElementType?{resultElementType:field.resultElementType}:{})}: {})}
}
export function portableValue(field:Field,value:CellValue):PortableBase['base']['tables'][number]['records'][number]['values'][string]{if(field.type!=='relation')return value as PortableBase['base']['tables'][number]['records'][number]['values'][string];const refs=value===null?[]:Array.isArray(value)?value:[value];if(refs.some(ref=>typeof ref!=='object'||!ref||!('recordId'in ref)||ref.appId!==field.relation!.ownerAppId||ref.entityId!==field.relation!.entityId))throw new AdmissionError('validation','Link value does not match its field.');const ids=refs.map(ref=>(ref as {recordId:string}).recordId);return field.relation!.cardinality==='many'?ids:ids[0]??null}
/** No projection can silently turn a restricted base into a partial export. */
export function createBaseExport(db:D1Database,services:ReturnType<typeof createRecordServices>){
 const exportBase=async function(ctx:RequestContext,appId:string):Promise<PortableBase>{
  const {descriptors,policy,reader,metadata}=services
  const base=await db.prepare('SELECT name,version,release_id FROM manual_record_bases WHERE id=?').bind(appId).first<{name:string;version:number;release_id:string}>()
  if(!base)throw new AdmissionError('not_found','Base export is available for records-builder bases.')
  const release=await db.prepare('SELECT detail_json FROM manual_record_releases WHERE id=? AND app_id=?').bind(base.release_id,appId).first<{detail_json:string}>()
  if(!release)throw new AdmissionError('schema_conflict','Base schema order is unavailable.')
  const schemas=(JSON.parse(release.detail_json) as {schemas:{id:string}[]}).schemas
  // Production also registers private source-staging storage for this app.
  // Only the adopted base tables belong in its complete portable export.
  const adoptedIds=new Set(schemas.map(schema=>schema.id)),registered=descriptors.list(appId).filter(d=>adoptedIds.has(d.schema.id))
  if(!registered.length)throw new AdmissionError('not_found','Base has no tables.')
  const ordered=schemas.map(schema=>registered.find(d=>d.schema.id===schema.id))
  if(ordered.length!==registered.length||ordered.some(d=>!d)||new Set(ordered).size!==ordered.length)throw new AdmissionError('schema_conflict','Base schema order changed.')
  const guards=[trustedPredicate('EXISTS(SELECT 1 FROM manual_record_bases WHERE id=? AND name=? AND version=? AND release_id=?)',[appId,base.name,base.version,base.release_id]),trustedPredicate('(SELECT COUNT(*) FROM record_schemas WHERE app_id=?)=?',[appId,registered.length])]
  const scopes=new Map<string,Awaited<ReturnType<typeof policy.scope>>>()
  for(const d of registered){const scope=await policy.scope(ctx,{appId,entityId:d.schema.id,purpose:'export'});if(!scope.unrestrictedRows||d.schema.fields.some(f=>!scope.readableFieldIds.includes(f.id)))throw new AdmissionError('forbidden','A complete base export requires export access to every row and field in every table.');scopes.set(d.schema.id,scope);guards.push(...scope.currentAuthorityGuards)}
  // Fence raw complete row/join sets, including insertions into an empty table.
  const capture=await snapshotTables(db,registered);guards.push(...capture.guards)
  for(const d of registered)for(const field of d.fields.values())if(field.field.type==='attachment'&&field.join&&(capture.rows[field.join.table.tableId]??[]).some(row=>typeof row[field.join!.valueColumn]!=='string'||!isReferenceValue(row[field.join!.valueColumn] as string)))throw new AdmissionError('validation',`${field.field.label}: uploaded attachment bytes have no base JSON representation.`)
  const revision=await reader.revision(),tables:PortableBase['base']['tables']=[]
  for(const d of ordered){const schema=d!.schema as NonNullable<typeof d>['schema'] & {primaryFieldId?:string;incomingRelations?:PortableBase['base']['tables'][number]['incomingRelations']},records:PortableBase['base']['tables'][number]['records']=[];let cursor:string|undefined
   do{const page=await reader.query(ctx,scopes.get(schema.id)!,{fields:schema.fields.map(f=>f.id),includeArchived:true,limit:200,cursor},'export');for(const row of page.items){if(row.lifecycle!=='active')throw new AdmissionError('validation','This base contains a lifecycle state not represented by base JSON.');const values:PortableBase['base']['tables'][number]['records'][number]['values']={},calculationErrors:NonNullable<PortableBase['base']['tables'][number]['records'][number]['calculationErrors']>={};for(const field of schema.fields){const cell=row.fields[field.id];if(cell?.state==='unavailable'&&field.type==='computed'){const {state,...error}=cell;calculationErrors[field.id]=error;values[field.id]=null;continue}if(cell?.state!=='value')throw new AdmissionError('forbidden','A base export contains a restricted or unavailable value.');if(field.type==='attachment')values[field.id]=await exportStoreCell(db,field.label,cell.value);else values[field.id]=portableValue(field,cell.value)}records.push({id:row.id,values,...(Object.keys(calculationErrors).length?{calculationErrors}:{})})};cursor=page.nextCursor??undefined}while(cursor)
   for(const field of schema.fields)if(field.relation?.ownerAppId&&field.relation.ownerAppId!==appId)throw new AdmissionError('forbidden','A base export cannot include a relationship to another base.')
   tables.push({id:schema.id,label:schema.label,...(schema.validationRules?{validationRules:structuredClone(schema.validationRules)}:{}),primaryFieldId:schema.primaryFieldId??schema.fields[0]!.id,fields:schema.fields.map(field=>portableField(field,schema,descriptors)),incomingRelations:(schema.incomingRelations??[]).map(r=>({id:r.id,label:r.label,sourceEntityId:r.sourceEntityId,sourceFieldId:r.sourceFieldId})),records:records.sort((a,b)=>a.id.localeCompare(b.id))})
  }
  const views:PortableBase['base']['views']=[],forms:PortableBase['base']['forms']=[]
  // Capture and fence the whole metadata set, not only the caller-visible subset.
  for(const kind of ['record_views','record_forms'] as const){const expression=`(SELECT COALESCE(json_group_array(json_object('id',id,'definition',definition_json,'deletedAt',deleted_at${kind==='record_views'?",'visibility',visibility,'owner',owner_id":''})), '[]') FROM (SELECT * FROM ${kind} WHERE app_id=? ORDER BY id))`,row=await db.prepare(`SELECT ${expression} AS snapshot`).bind(appId).first<{snapshot:string}>();guards.push(trustedPredicate(`${expression}=?`,[appId,row!.snapshot]));const entries=JSON.parse(row!.snapshot) as {id:string;visibility?:string;definition:string;deletedAt?:number|null}[]
   for(const entry of entries){if(entry.deletedAt!==null&&entry.deletedAt!==undefined)continue;if(kind==='record_views'){if(entry.visibility==='deleted')continue;const view=await metadata.readView(ctx,entry.id), timeline=exportTimelineSettings(view,JSON.parse(entry.definition) as import('../contracts').View,tables.find(table=>table.id===view.entityId)!.records);views.push({id:view.id,tableId:view.entityId,name:view.name,display:view.display,...(view.listLevels?{listLevels:structuredClone(view.listLevels)}:{}),fields:[...view.fields],filter:structuredClone(view.filter) as Filter,sort:view.sort.map(s=>({fieldId:s.fieldId,direction:s.direction})),groupBy:[...view.groupBy],layout:{...view.layout},...timeline,...(view.coverFit?{coverFit:view.coverFit}:{}),visibility:view.visibility,...(view.locked!==undefined?{locked:view.locked}:{}),...(view.summaries?{summaries:structuredClone(view.summaries)}:{}),...(view.formatting?{formatting:structuredClone(view.formatting)}:{})})}else {const form=await metadata.readForm(ctx,entry.id);if(form.submitAction!=='record.create')throw new AdmissionError('validation','A source-mapped form cannot be exported as a portable base form.');forms.push({id:form.id,tableId:form.entityId,title:form.title,fields:form.fields.map(f=>structuredClone(f)),submitAction:'record.create',authenticated:true})}}
  }
  const result=validatePortableBase({format:'cradle-base',version:1,envelope:{capturedAt:ctx.now},base:{id:appId,name:base.name,tables,views,forms}})
  if(await reader.revision()!==revision)throw new AdmissionError('version_conflict','Records changed during base export. Export again.')
  await assertGuards(db,guards)
  await auditOperation(db,ctx,'base.export',appId)
  return result
 }
 return Object.assign(exportBase,{prepare:(ctx:RequestContext,appId:string)=>prepareBaseStream(db,services,ctx,appId)})
}
