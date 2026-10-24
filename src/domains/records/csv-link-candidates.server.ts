import { z } from 'zod'
import type { RequestContext } from '../authority/ports'
import { AdmissionError } from '../admission/errors'
import type { createRecordServices } from './service.server'
import { idSchema } from './validators'
import { assertGuards } from './fence.server'
import { schemaGuard } from './change.server'
import { visibleCalculationSchema } from './calculation-visibility.server'
import { pickerView } from './link-picker-view.server'

const inputSchema=z.object({appId:idSchema,entityId:idSchema,fieldId:idSchema,search:z.string().max(1000).default(''),cursor:z.string().max(20000).optional()}).strict()
/** Source-field settings and current source/target authority govern every page. */
export function createCsvLinkCandidates(db:D1Database,services:ReturnType<typeof createRecordServices>){
 return async function linkCandidates(ctx:RequestContext,input:unknown){
  const request=inputSchema.parse(input),source=services.descriptors.get(request.appId,request.entityId)
  const own=await services.policy.scope(ctx,{appId:request.appId,entityId:request.entityId,purpose:'read'}),field=source.schema.fields.find(field=>field.id===request.fieldId)
  if(!field?.relation||field.type!=='relation'||!own.readableFieldIds.includes(field.id)||!own.discoverableRelations.includes(field.id))throw new AdmissionError('forbidden','This linked-record field is unavailable.')
  const d=services.descriptors.get(field.relation.ownerAppId,field.relation.entityId),scope=await services.policy.scope(ctx,{appId:d.schema.appId,entityId:d.schema.id,purpose:'read'})
  const schema=await visibleCalculationSchema(ctx,{...d.schema,primaryFieldId:d.schema.primaryFieldId&&scope.readableFieldIds.includes(d.schema.primaryFieldId)?d.schema.primaryFieldId:undefined,fields:d.schema.fields.filter(field=>scope.readableFieldIds.includes(field.id))},scope,services.descriptors,services.policy)
  const searchable=schema.fields.filter(field=>['phone', 'text','url'].includes(field.type==='computed'?field.resultType??'':field.type)),primary=schema.fields.find(field=>field.id===schema.primaryFieldId)??schema.fields.find(field=>field.type==='text')
  const searchFieldIds=[...new Set([...(primary&&searchable.includes(primary)?[primary.id]:[]),...(field.linkPicker?.searchFieldIds??[])])].filter(id=>searchable.some(field=>field.id===id))
  const displayFieldIds=(field.linkPicker?.displayFieldIds??searchFieldIds).filter(id=>schema.fields.some(field=>field.id===id)),fields=[...new Set([...displayFieldIds,...(primary?[primary.id]:[])])]
  if(request.search&&!searchFieldIds.length)throw new AdmissionError('forbidden','No configured search fields are currently readable. Ask the base owner to update the picker.')
  const limited=await pickerView(db,services,ctx,d.schema,field.linkPicker?.viewId),search=request.search?{kind:'any' as const,conditions:searchFieldIds.map(fieldId=>({kind:'condition' as const,fieldId,op:'contains' as const,value:request.search}))}:undefined
  const filter=limited&&search?{kind:'all' as const,conditions:[limited.view.filter,search]}:limited?.view.filter??search
  const records=await services.reader.query(ctx,scope,{limit:50,fields,cursor:request.cursor,...(filter?{filter}:{}),...(limited?{sort:limited.view.sort}:{})})
  await assertGuards(db,[schemaGuard(source),schemaGuard(d),...own.currentAuthorityGuards,...scope.currentAuthorityGuards,...(limited?[limited.guard]:[])])
  return {schema,searchFieldIds,displayFieldIds,records,...(limited?{viewName:limited.view.name}:{})}
 }
}
