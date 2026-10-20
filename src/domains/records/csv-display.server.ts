import type { CellValue, Ref } from '../../contracts/primitives'
import type { RequestContext } from '../authority/ports'
import type { SqlPredicate } from '../admission/ports'
import { AdmissionError } from '../admission/errors'
import type { Field } from './contracts'
import type { createRecordServices } from './service.server'
import { validateCsvCell } from './csv-validation'
import { parseLinkCell } from './base-transfer/parse'
import { ImportInputError } from './base-transfer/input-error'
import { typedCsvValue } from './csv-typed-values'

/** Legacy multi-select storage holds literal labels; authored bases hold option IDs. */
export function displayCsvLabels(labels:readonly string[]):string{return labels.map(label=>'"'+label.replaceAll('"','""')+'"').join(',')}

export function displayCsvValue(field:Field,value:CellValue):string {
 if(value===null)return ''
 const type=field.resultType??field.type
 if(type==='array'&&Array.isArray(value)&&field.resultElementType==='select')return JSON.stringify(value.map(item=>item===null?null:displayCsvValue({...field,resultType:'select',resultElementType:undefined},item as string)))
 if(type==='select'||type==='multi_select'){
  const labels=(Array.isArray(value)?value:[value]).map(id=>{
   const label=field.options?.find(option=>option.id===id)?.label
   if(label===undefined)throw new AdmissionError('validation',`${field.label}: a select option is unavailable.`)
   return label
  })
  return type==='multi_select'?displayCsvLabels(labels):labels[0]??''
 }
 if(typeof value==='boolean')return value?'Yes':'No'
 return typeof value==='string'?value:JSON.stringify(value)
}

/** Label reads require their own export scope, including the target's primary field. */
export function createCsvLabels(services:ReturnType<typeof createRecordServices>,ctx:RequestContext,guards:SqlPredicate[]){
 const targets=new Map<string,Promise<{scope:Awaited<ReturnType<typeof services.policy.scope>>;field:Field}>>()
 async function target(field:Field,reference?:Ref){
  const relation=field.type==='computed'&&field.resultElementType==='relation'?{ownerAppId:reference!.appId,entityId:reference!.entityId}:field.relation!,key=relation.ownerAppId+':'+relation.entityId
  let pending=targets.get(key)
  if(!pending){pending=(async()=>{
   const d=services.descriptors.get(relation.ownerAppId,relation.entityId),primary=d.schema.primaryFieldId?d.fields.get(d.schema.primaryFieldId)?.field:d.schema.fields.find(f=>f.type==='text')
   const scope=await services.policy.scope(ctx,{appId:relation.ownerAppId,entityId:relation.entityId,purpose:'export'})
   if(!primary||!scope.readableFieldIds.includes(primary.id))throw new AdmissionError('forbidden','Linked record labels are unavailable for export.')
   guards.push(...scope.currentAuthorityGuards)
   return {scope,field:primary}
  })();targets.set(key,pending)}
  return pending
 }
 const labels=new Map<string,Promise<string>>()
 async function label(field:Field,ref:Ref){
  const key=ref.appId+':'+ref.entityId+':'+ref.recordId
  let pending=labels.get(key)
  if(!pending){pending=(async()=>{const t=await target(field,ref),record=await services.reader.record(ctx,t.scope,ref),cell=record.fields[t.field.id];if(cell?.state!=='value')throw new AdmissionError('forbidden','A linked record label is restricted or unavailable.');return displayCsvValue(t.field,cell.value)})();labels.set(key,pending)}
  return pending
 }
 const candidates=new Map<string,Promise<Map<string,Ref[]>>>()
 async function resolve(field:Field,raw:string):Promise<CellValue>{
  if(raw==='')return validateCsvCell(field,field.relation!.cardinality==='many'?[]:null)
  const key=field.relation!.ownerAppId+':'+field.relation!.entityId
  let pending=candidates.get(key)
  if(!pending){pending=(async()=>{
   const t=await target(field),byLabel=new Map<string,Ref[]>();let cursor:string|undefined
   do{const page=await services.reader.query(ctx,t.scope,{fields:[t.field.id],limit:200,cursor,includeArchived:true});for(const row of page.items){const cell=row.fields[t.field.id];if(cell?.state!=='value')throw new AdmissionError('forbidden','A linked record label is restricted or unavailable.');const text=displayCsvValue(t.field,cell.value),matches=byLabel.get(text)??[];matches.push(row.ref);byLabel.set(text,matches)}cursor=page.nextCursor??undefined}while(cursor)
   return byLabel
  })();candidates.set(key,pending)}
  let texts:string[]
  try{texts=field.relation!.cardinality==='many'?parseLinkCell(raw):[raw]}catch(error){
   if(!(error instanceof ImportInputError))throw error
   throw new AdmissionError('validation',`${field.label}: ${error.message}. Use the linked record format from a view CSV export.`)
  }
  const byLabel=await pending,refs=texts.map(text=>{
   const matches=byLabel.get(text)??[]
   if(matches.length!==1)throw new AdmissionError('validation',`${field.label}: ${JSON.stringify(text)} ${matches.length?'matches several linked records; choose an unambiguous value':'was not found among available linked records'}.`)
   return matches[0]!
  })
  return validateCsvCell(field,field.relation!.cardinality==='many'?refs:refs[0]!)
 }
 return {resolve,async display(field:Field,value:CellValue){
  if(value===null)return ''
  const refs=(Array.isArray(value)?value:[value]) as Ref[],texts=await Promise.all(refs.map(ref=>label(field,ref)))
  return field.resultType==='array'||field.relation?.cardinality==='many'?texts.map(text=>'"'+text.replaceAll('"','""')+'"').join(','):texts[0]??''
 }}
}

export function decodeDisplayCsvValue(field:Field,raw:string):CellValue{
 if(field.type==='computed')throw new AdmissionError('validation',`${field.label} is computed and cannot be imported.`)
 let value:unknown=typedCsvValue(field,raw)
 if(field.type==='select')value=raw===''?null:field.options?.find(option=>option.label===raw)?.id??raw
 else if(field.type!=='text'&&field.type!=='multi_select'&&raw==='')value=null
 return validateCsvCell(field,value)
}
