import { exportContext, formatWorkspaceCell } from './csv-export.server'
import { createCsvLabels, displayCsvValue } from './csv-display.server'
import { z } from 'zod'
import type { RequestContext } from '../authority/ports'
import type { AdmissionPort, SqlPredicate, SqlMutation } from '../admission/ports'
import { identifier, registerTable, trustedPredicate } from '../admission/sql.server'
import { canonical, canonicalHash } from '../admission/canonical'
import { AdmissionError } from '../admission/errors'
import { createUlid } from '../../core/shared/ids'
import { parseCsv, encodeCsv } from '../portability/csv'
import type { createRecordServices } from './service.server'
import { querySchema, idSchema } from './validators'
export { decodeCsvValue, encodeCsvValue } from './csv-values'
import { previewCsvRows } from './csv-preview-rows.server'
import type { CsvImportPreview } from './csv-import-contracts'
import { assertGuards } from './fence.server'
const stored=registerTable('record_csv_previews',['id','app_id','entity_id','owner_id','detail_json','expires_at','command_id'])
export const csvPreviewInput=z.object({appId:idSchema,entityId:idSchema,csv:z.string().max(10*1024*1024),mapping:z.array(z.object({column:z.string(),fieldId:idSchema}).strict()).min(1).max(80),mergeFieldId:z.union([idSchema,z.literal('_record_id')])}).strict()
type Preview=CsvImportPreview & {guards:SqlPredicate[]}
export function createRecordsCsv(db:D1Database,services:ReturnType<typeof createRecordServices>,admission:AdmissionPort){
 const {reader,writer,policy,descriptors,metadata}=services
 async function exportCsv(ctx:RequestContext,input:unknown){
  const request=z.object({appId:idSchema,entityId:idSchema,viewId:idSchema.optional(),query:querySchema}).strict().parse(input)
  const d=descriptors.get(request.appId,request.entityId),view=request.viewId?await metadata.readView(ctx,request.viewId):null
  if(view&&(view.appId!==request.appId||view.entityId!==request.entityId))throw new AdmissionError('validation','View belongs to another table.')
  const scope=await policy.scope(ctx,{appId:request.appId,entityId:request.entityId,purpose:'export'})
  const query=view?{fields:view.fields,sort:view.sort,filter:view.filter,groupBy:view.groupBy}:request.query
  const fields=(query.fields??d.schema.fields.map(f=>f.id)).map(id=>{const field=d.schema.fields.find(f=>f.id===id);if(!field||!scope.readableFieldIds.includes(id))throw new AdmissionError('forbidden','An export field is unavailable.');return field})
  const context=await exportContext(db,view?.name??d.schema.label,ctx.now,fields)
  const guards=[...scope.currentAuthorityGuards],labels=createCsvLabels(services,ctx,guards)
  const revision=await reader.revision(),rows:string[][]=[];let cursor:string|undefined
  do{const page=await reader.query(ctx,scope,{...query,limit:200,cursor},'export');for(const row of page.items)rows.push(await Promise.all(fields.map(async field=>{const cell=row.fields[field.id];if(cell?.state!=='value')throw new AdmissionError('forbidden','Export contains a restricted or unavailable value.');if(field.type==='relation')return labels.display(field,cell.value);return formatWorkspaceCell(field,cell.value,context,()=>!d.schema.physicalRevision.startsWith('manual_')&&field.type==='select'?String(cell.value??''):displayCsvValue(field,cell.value))})));cursor=page.nextCursor??undefined;}while(cursor)
  await assertGuards(db,guards)
  if(await reader.revision()!==revision)throw new AdmissionError('version_conflict','Records changed during export. Export again.')
  return {csv:encodeCsv(fields.map(f=>f.label),rows),filename:context.filename,count:rows.length,capture:context}
 }
 async function preview(ctx:RequestContext,input:unknown){
  const request=csvPreviewInput.parse(input),d=descriptors.get(request.appId,request.entityId)
  if(d.legacy)throw new AdmissionError('validation','This import is for records-builder tables. Use the retained application import for source-maintained records.')
  const scope=await policy.scope(ctx,{appId:request.appId,entityId:request.entityId,purpose:'read'})
  let csv:ReturnType<typeof parseCsv>;try{csv=parseCsv(new TextEncoder().encode(request.csv))}catch(error){throw new AdmissionError('validation',error instanceof Error?error.message:'Invalid CSV.')}
  if(new Set(request.mapping.map(m=>m.fieldId)).size!==request.mapping.length||request.mapping.some(m=>!csv.headers.includes(m.column)))throw new AdmissionError('validation','Each mapped field must have exactly one source column.')
  const byId=request.mergeFieldId==='_record_id',merge=d.fields.get(request.mergeFieldId)?.field
  if(byId&&!csv.headers.includes('_record_id'))throw new AdmissionError('validation','Recovery requires the original _record_id column.')
  if(!byId&&(!merge||!['text','number','date','select'].includes(merge.type)||!request.mapping.some(m=>m.fieldId===merge.id)))throw new AdmissionError('validation','Choose a mapped scalar field to match existing records.')
  // Guard only rows the caller can currently read. Hidden records never affect this preview.
  const expression=`(SELECT COALESCE(json_group_array(json(row)),'[]') FROM (SELECT json_object('id',${identifier(d.idColumn)},'version',${identifier(d.versionColumn)}) AS row FROM ${identifier(d.table.tableId)} WHERE ${scope.rowPredicate.sql} ORDER BY ${identifier(d.idColumn)}))`
  const snapshot=await db.prepare(`SELECT ${expression} AS value`).bind(...scope.rowPredicate.values).first<{value:string}>()
  const rowGuard=trustedPredicate(`${expression}=?`,[...scope.rowPredicate.values,snapshot!.value])
  const existing=[];let cursor:string|undefined
  do{const page=await reader.query(ctx,scope,{limit:200,cursor});existing.push(...page.items);cursor=page.nextCursor??undefined}while(cursor)
  const labelGuards:SqlPredicate[]=[],labels=createCsvLabels(services,ctx,labelGuards)
  const {rows,errors,guards:rowGuards}=await previewCsvRows(ctx,request,csv,d,scope,existing,writer,labels)
  const guards=[...scope.currentAuthorityGuards,...labelGuards,rowGuard,...rowGuards]
  const permit=await policy.authorize(ctx,{appId:request.appId,targetEntityId:request.entityId,fieldIds:request.mapping.map(m=>m.fieldId),action:'import.preview',expected:[],cost:[],inputHash:await canonicalHash(request)})
  guards.push(...permit.guards);await assertGuards(db,guards)
  const result:Preview={id:createUlid(),appId:request.appId,entityId:request.entityId,rows,errors,rejected:errors.length,guards,expiresAt:new Date(Date.parse(ctx.now)+1800000).toISOString(),creates:rows.filter(r=>r.operation==='create').length,updates:rows.filter(r=>r.operation==='update').length,unchanged:rows.filter(r=>r.operation==='unchanged').length}
  await db.prepare('INSERT INTO record_csv_previews(id,app_id,entity_id,owner_id,detail_json,expires_at) VALUES(?,?,?,?,?,?)').bind(result.id,result.appId,result.entityId,ctx.principal.id,canonical(result),result.expiresAt).run()
  await assertGuards(db,guards)
  const {guards:_,...publicResult}=result;return publicResult
 }
 async function commit(ctx:RequestContext,commandId:string,id:string){
  const row=await db.prepare('SELECT detail_json FROM record_csv_previews WHERE id=? AND owner_id=?').bind(id,ctx.principal.id).first<{detail_json:string}>();if(!row)throw new AdmissionError('not_found','Import preview not found.')
  const p=JSON.parse(row.detail_json) as Preview;p.guards=p.guards.map(g=>trustedPredicate(g.sql,g.values));const hash=await canonicalHash({previewId:id}),replay=await admission.replay(ctx,commandId,'import.commit',p.appId,hash);if(replay)return replay
  if(!p.rows.length)throw new AdmissionError('validation','This import has no valid rows. Correct the rejected rows and preview again.')
  if(p.expiresAt<=ctx.now)throw new AdmissionError('version_conflict','Import preview expired.')
  await assertGuards(db,p.guards)
  const scope=await policy.scope(ctx,{appId:p.appId,entityId:p.entityId,purpose:'read'}),guards=[...p.guards],mutations:SqlMutation[]=[],audit=[]
  for(const row of p.rows){
   if(row.operation==='unchanged')continue
   const ref={appId:p.appId,entityId:p.entityId,recordId:row.id},change=row.version===null?await writer.prepareCreate(ctx,scope,row.values,row.id):await writer.prepareChange(ctx,scope,{ref,expectedVersion:row.version,changes:row.values})
   const insertion=change.mutations.find(m=>m.kind==='insert'&&m.table.tableId===descriptors.get(p.appId,p.entityId).table.tableId)
   const permit=await policy.authorize(ctx,{appId:p.appId,targetEntityId:p.entityId,action:row.version===null?'record.create':'record.patch',expected:row.version===null?[]:[{ref,version:row.version}],fieldIds:Object.keys(row.values),proposedRows:insertion?.kind==='insert'?[{entityId:p.entityId,row:insertion.row}]:undefined,cost:[],inputHash:hash})
   guards.push(...change.guards,...permit.guards);mutations.push(...change.mutations);audit.push(...change.audit)
  }
  const permit=await policy.authorize(ctx,{appId:p.appId,targetEntityId:p.entityId,action:'import.commit',expected:[],cost:[],inputHash:hash})
  mutations.push({kind:'update',table:stored,set:{command_id:commandId},where:trustedPredicate('id=? AND command_id IS NULL AND expires_at>?',[id,ctx.now]),expectedRows:1})
  return admission.commit(ctx,{commandId,action:'import.commit',appId:p.appId,canonicalInputHash:hash,permit,guards,mutations,audit,events:[],outbox:[],committedResult:{id,creates:p.creates,updates:p.updates,unchanged:p.unchanged,rejected:p.rejected}})
 }
 return {exportCsv,preview,commit}
}
