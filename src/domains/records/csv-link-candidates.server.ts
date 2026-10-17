import { z } from 'zod'
import type { RequestContext } from '../authority/ports'
import { AdmissionError } from '../admission/errors'
import type { createRecordServices } from './service.server'
import { idSchema } from './validators'
import { assertGuards } from './fence.server'
import { schemaGuard } from './change.server'
import { visibleCalculationSchema } from './calculation-visibility.server'

const inputSchema=z.object({appId:idSchema,entityId:idSchema,search:z.string().max(1000).default(''),fieldIds:z.array(idSchema).max(80).optional(),cursor:z.string().max(20000).optional()}).strict()
/** Candidate schema, filtering and projection all use the current readable target scope. */
export function createCsvLinkCandidates(db:D1Database,services:ReturnType<typeof createRecordServices>){
 return async function linkCandidates(ctx:RequestContext,input:unknown){
  const request=inputSchema.parse(input),d=services.descriptors.get(request.appId,request.entityId)
  const scope=await services.policy.scope(ctx,{appId:request.appId,entityId:request.entityId,purpose:'read'})
  const schema=await visibleCalculationSchema(ctx,{...d.schema,primaryFieldId:d.schema.primaryFieldId&&scope.readableFieldIds.includes(d.schema.primaryFieldId)?d.schema.primaryFieldId:undefined,fields:d.schema.fields.filter(field=>scope.readableFieldIds.includes(field.id))},scope,services.descriptors,services.policy)
  const searchable=schema.fields.filter(field=>['text','url'].includes(field.type==='computed'?field.resultType??'':field.type))
  const primary=searchable.find(field=>field.id===schema.primaryFieldId)??searchable[0]
  const fieldIds=request.fieldIds??(primary?[primary.id]:[])
  if(new Set(fieldIds).size!==fieldIds.length||fieldIds.some(id=>!searchable.some(field=>field.id===id)))throw new AdmissionError('forbidden','A search field is no longer readable or searchable. Refresh the linked-record picker.')
  if(request.search&&!fieldIds.length)throw new AdmissionError('validation','Choose at least one text field to search.')
  const displayIds=[...new Set([...fieldIds,...(schema.primaryFieldId&&schema.fields.some(field=>field.id===schema.primaryFieldId)?[schema.primaryFieldId]:schema.fields.filter(field=>field.type==='text').slice(0,1).map(field=>field.id))])]
  const records=await services.reader.query(ctx,scope,{limit:50,fields:displayIds,cursor:request.cursor,...(request.search?{filter:{kind:'any' as const,conditions:fieldIds.map(fieldId=>({kind:'condition' as const,fieldId,op:'contains' as const,value:request.search}))}}:{})})
  await assertGuards(db,[schemaGuard(d),...scope.currentAuthorityGuards])
  return {schema,searchFieldIds:fieldIds,records}
 }
}
