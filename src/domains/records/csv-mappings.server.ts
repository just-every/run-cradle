import { z } from 'zod'
import type { RequestContext } from '../authority/ports'
import { AdmissionError } from '../admission/errors'
import { and } from '../admission/sql.server'
import { canonical, canonicalHash } from '../admission/canonical'
import { createUlid } from '../../core/shared/ids'
import type { createRecordServices } from './service.server'
import { idSchema } from './validators'
import { assertGuards } from './fence.server'
import { schemaGuard } from './change.server'
import { CSV_CREATE_ALL } from './csv-mapping-contracts'
import type { CsvMappingChoice, CsvSavedMapping } from './csv-mapping-contracts'

export const csvMappingSchema = z.array(z.object({column:z.string().min(1).max(100000),fieldId:idSchema}).strict()).min(1).max(80)
export const csvMergeSchema = z.union([idSchema,z.literal('_record_id')])
export const csvImportMergeSchema = z.union([csvMergeSchema,z.literal(CSV_CREATE_ALL)])
const identity = {appId:idSchema,entityId:idSchema}
const sourceName = z.string().trim().min(1).max(200)
const requestSchema = z.discriminatedUnion('action',[
 z.object({...identity,action:z.literal('list')}).strict(),
 z.object({...identity,action:z.literal('use'),sourceName,headers:z.array(z.string()).min(1).max(200)}).strict(),
 z.object({...identity,action:z.literal('save'),sourceName,mapping:csvMappingSchema,mergeFieldId:csvImportMergeSchema,expectedVersion:z.number().int().positive().nullable()}).strict(),
])
type Stored = {id:string;source_name:string;version:number;detail_json:string;created_at:string;updated_at:string}
type Detail = Pick<CsvSavedMapping,'mapping'|'mergeFieldId'> & {fieldShapes:Record<string,string>}

/** Validate at both the saved-mapping and live-preview doors, including read and write policy. */
export async function validateCsvMapping(services:ReturnType<typeof createRecordServices>,ctx:RequestContext,appId:string,entityId:string,mapping:CsvSavedMapping['mapping'],mergeFieldId:string,headers?:string[]) {
 const d=services.descriptors.get(appId,entityId)
 if(d.legacy)throw new AdmissionError('validation','Recurring CSV mappings require a records-builder table.')
 const scope=await services.policy.scope(ctx,{appId,entityId,purpose:'read'})
 if(new Set(mapping.map(m=>m.column)).size!==mapping.length||new Set(mapping.map(m=>m.fieldId)).size!==mapping.length)
  throw new AdmissionError('validation','Map each column and field only once.')
 const fieldShapes:Record<string,string>={}
 for(const m of mapping){
  const field=d.fields.get(m.fieldId)?.field
  if(!field||!scope.readableFieldIds.includes(m.fieldId)||!scope.writableFieldIds.includes(m.fieldId)||field.readOnly||field.type==='computed'||d.writePolicy?.protectedFieldIds?.includes(m.fieldId))throw new AdmissionError('forbidden','A mapped field is no longer readable and writable. Update this mapping.')
  if(headers&&!headers.includes(m.column))throw new AdmissionError('validation',`The file is missing mapped column ${JSON.stringify(m.column)}. Update this mapping or choose the right file.`)
  fieldShapes[m.fieldId]=canonical({type:field.type,required:field.required,options:field.options??null,relation:field.relation??null})
 }
 const merge=d.fields.get(mergeFieldId)?.field
 if(mergeFieldId==='_record_id'){
  if(headers&&!headers.includes('_record_id'))throw new AdmissionError('validation','The file needs its original _record_id column.')
 }else if(mergeFieldId!==CSV_CREATE_ALL&&(!merge||!['text','number','date','select'].includes(merge.type)||!mapping.some(m=>m.fieldId===mergeFieldId)))throw new AdmissionError('validation','Choose a mapped scalar field to match existing records.')
 if(d.writePolicy?.create===false||d.writePolicy?.patch===false)throw new AdmissionError('forbidden','This table does not allow merge imports.')
 const inputHash=await canonicalHash({mapping,mergeFieldId})
 const permits=await Promise.all(['import.preview','record.create','record.patch'].map(action=>services.policy.authorize(ctx,{appId,targetEntityId:entityId,action,fieldIds:mapping.map(m=>m.fieldId),expected:[],cost:[],inputHash})))
 const guards=[schemaGuard(d),...scope.currentAuthorityGuards,...permits.flatMap(permit=>permit.guards)]
 return {scope,guards:[...new Map(guards.map(guard=>[canonical({sql:guard.sql,values:guard.values}),guard])).values()],fieldShapes}
}
export function createCsvMappings(db:D1Database,services:ReturnType<typeof createRecordServices>){
 return async function mappings(ctx:RequestContext,input:unknown){
  const request=requestSchema.parse(input),{appId,entityId}=request
  const scope=await services.policy.scope(ctx,{appId,entityId,purpose:'read'})
  await assertGuards(db,scope.currentAuthorityGuards)
  const select='SELECT * FROM record_csv_mappings WHERE app_id=? AND entity_id=? AND owner_id=?'
  async function checked(row:Stored,headers?:string[]){
   const detail=JSON.parse(row.detail_json) as Detail
   const validation=await validateCsvMapping(services,ctx,appId,entityId,detail.mapping,detail.mergeFieldId,headers)
   if(canonical(validation.fieldShapes)!==canonical(detail.fieldShapes))throw new AdmissionError('schema_conflict','Mapped field types or options changed. Update the saved mapping before using it.')
   await assertGuards(db,validation.guards)
   return {id:row.id,sourceName:row.source_name,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,mapping:detail.mapping,mergeFieldId:detail.mergeFieldId} satisfies CsvSavedMapping
  }
  if(request.action==='list'){
   const rows=await db.prepare(select+' ORDER BY source_name').bind(appId,entityId,ctx.principal.id).all<Stored>(),choices:CsvMappingChoice[]=[]
   for(const row of rows.results){
    const choice={id:row.id,sourceName:row.source_name,version:row.version,updatedAt:row.updated_at}
    try{await checked(row);choices.push({...choice,available:true})}catch(error){if(!(error instanceof AdmissionError)||!['forbidden','validation','schema_conflict'].includes(error.code))throw error;choices.push({...choice,available:false,problem:error.message})}
   }
   await assertGuards(db,scope.currentAuthorityGuards);return {mappings:choices}
  }
  const prior=await db.prepare(select+' AND source_name=?').bind(appId,entityId,ctx.principal.id,request.sourceName).first<Stored>()
  if(request.action==='use'){
   if(!prior)throw new AdmissionError('not_found','Saved mapping not found.')
   return checked(prior,request.headers)
  }
  if((prior?.version??null)!==request.expectedVersion)throw new AdmissionError('version_conflict','This mapping changed. Reload it before updating.')
  const validation=await validateCsvMapping(services,ctx,appId,entityId,request.mapping,request.mergeFieldId)
  const detail:Detail={mapping:request.mapping,mergeFieldId:request.mergeFieldId,fieldShapes:validation.fieldShapes}
  const guard=and(...validation.guards),id=prior?.id??createUlid(),version=(prior?.version??0)+1
  await assertGuards(db,validation.guards)
  const statement=prior
   ? db.prepare(`UPDATE record_csv_mappings SET detail_json=?,version=?,updated_at=? WHERE id=? AND version=? AND (${guard.sql})`).bind(canonical(detail),version,ctx.now,id,prior.version,...guard.values)
   : db.prepare(`INSERT INTO record_csv_mappings(id,app_id,entity_id,owner_id,source_name,version,detail_json,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM record_csv_mappings WHERE app_id=? AND entity_id=? AND owner_id=? AND source_name=?) AND (${guard.sql})`).bind(id,appId,entityId,ctx.principal.id,request.sourceName,version,canonical(detail),ctx.now,ctx.now,appId,entityId,ctx.principal.id,request.sourceName,...guard.values)
  const result=await statement.run()
  if(result.meta.changes!==1)throw new AdmissionError('version_conflict','Mapping or access changed. Reload and try again.')
  return {id,sourceName:request.sourceName,version,createdAt:prior?.created_at??ctx.now,updatedAt:ctx.now,mapping:request.mapping,mergeFieldId:request.mergeFieldId} satisfies CsvSavedMapping
 }
}
