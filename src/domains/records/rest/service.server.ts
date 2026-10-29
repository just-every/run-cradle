import type {RequestContext} from '../../authority/ports'
import type {AdmissionPort,AdmissionPlan} from '../../admission/ports'
import type {createRecordServices} from '../service.server'
import type {CellValue} from '../../../contracts/primitives'
import type {PreparedRecordChange} from '../ports'
import {AdmissionError} from '../../admission/errors'
import {canonical,canonicalHash} from '../../admission/canonical'
import {assertCurrentScopeAuthority} from '../../authority/guards.server'
import {delegationCommandId} from '../../authority/user-delegation.server'
import {readBoundedJson} from '../../authority/http.server'
import {idSchema,validateCell} from '../validators'
import {createInput,updateInput,deleteInput,batchInput,upsertInput,restQueryInput} from './contracts'
import {recordOpenApi,restSchema} from './openapi'
import {createRestComments} from './comments.server'
import type {CommandRegistry} from '../../../core/registry/commands'
import type {createCommentReader} from '../../evidence/comment-reader.server'
import {createFormulaQuery} from './formula-query.server'

type Services=ReturnType<typeof createRecordServices>
/** A separate REST representation omits unreadable field identities as well as values. */
function project<T>(value:T,readable:readonly string[]):T{
 if(Array.isArray(value))return value.map(item=>project(item,readable)) as T
 if(!value||typeof value!=='object')return value
 const item=value as Record<string,unknown>
 return Object.fromEntries(Object.entries(item).map(([key,child])=>[key,key==='fields'&&child&&typeof child==='object'&&!Array.isArray(child)?Object.fromEntries(Object.entries(child).filter(([id])=>readable.includes(id)).map(([id,cell])=>[id,project(cell,readable)])):key==='fieldIds'&&Array.isArray(child)?child.filter(id=>typeof id==='string'&&readable.includes(id)):project(child,readable)])) as T
}
export function createRecordRest(db:D1Database,services:Services,admission:AdmissionPort,evidence?:{comments:ReturnType<typeof createCommentReader>;commands:CommandRegistry},cursorSecret?:string){
 const {policy,reader,writer,descriptors,metadata}=services
 const comments=evidence?createRestComments(services,evidence.comments,evidence.commands):undefined
 const formulaQuery=cursorSecret?createFormulaQuery(db,services,cursorSecret):undefined
 return {async handle(ctx:RequestContext,request:Request):Promise<unknown>{
  const path=new URL(request.url).pathname,document=path.match(/^\/api\/v1\/apps\/([^/]+)\/openapi\.json$/)
  if(document&&request.method==='GET'){
   const appId=idSchema.parse(document[1]),candidates=await metadata.entities(ctx,appId),schemas=[] as typeof candidates
   // Metadata already narrows the schema; a final authority fence covers the entire document.
   for(const schema of candidates){const scope=await policy.scope(ctx,{appId,entityId:schema.id,purpose:'read'});schemas.push({...schema,fields:schema.fields.filter(field=>scope.readableFieldIds.includes(field.id))});await assertCurrentScopeAuthority(db,ctx,scope)}
   return recordOpenApi(appId,schemas)
  }
  const comment=path.match(/^\/api\/v1\/apps\/([^/]+)\/rest\/entities\/([^/]+)\/records\/([^/]+)\/comments(?:\/([^/]+))?$/)
  if(comment){if(!comments)throw new AdmissionError('unconfigured','REST comments require the native comment services.');return comments(ctx,request,comment)}
  const match=path.match(/^\/api\/v1\/apps\/([^/]+)\/rest\/entities\/([^/]+)(?:\/(query|records|batch|upsert)(?:\/([^/]+))?)?$/)
  if(!match)throw new AdmissionError('not_found','Unknown REST records route')
  const appId=idSchema.parse(match[1]),entityId=idSchema.parse(match[2]),part=match[3],recordId=match[4]?idSchema.parse(match[4]):undefined
  const descriptor=descriptors.get(appId,entityId),scope=await policy.scope(ctx,{appId,entityId,purpose:'read'})
  const finish=async<T>(value:T)=>{await assertCurrentScopeAuthority(db,ctx,scope);return project(value,scope.readableFieldIds)}
  if(!part&&request.method==='GET')return finish(restSchema({...descriptor.schema,fields:descriptor.schema.fields.filter(field=>scope.readableFieldIds.includes(field.id)).map(field=>({...field,readOnly:field.readOnly||!scope.writableFieldIds.includes(field.id)}))}))
  if(part==='query'&&request.method==='POST'){
   const input=restQueryInput.parse(await readBoundedJson(request,65536))
   if(input.formula===undefined)return finish(await reader.query(ctx,scope,input))
   if(!formulaQuery)throw new AdmissionError('unconfigured','REST formula queries require a cursor signing secret.')
   return finish(await formulaQuery(ctx,scope,input))
  }
  if(part==='records'&&recordId&&request.method==='GET')return finish(await reader.record(ctx,scope,{appId,entityId,recordId}))
  const body=await readBoundedJson(request,1048576)
  let operation:'create'|'update'|'delete',commandId:string,schemaVersion:number|undefined,rows:({values:Record<string,CellValue>}|{recordId:string;version:number;changes:Record<string,CellValue>}|{recordId:string;version:number;confirmation:string})[],upsert=false
  if(part==='batch'&&request.method==='POST'){const input=batchInput.parse(body);({operation,commandId,rows}=input);schemaVersion='schemaVersion'in input?input.schemaVersion:undefined}
  else if(part==='records'&&!recordId&&request.method==='POST'){const input=createInput.parse(body);operation='create';commandId=input.commandId;schemaVersion=input.schemaVersion;rows=[{values:input.values}]}
  else if(part==='records'&&recordId&&request.method==='PATCH'){const input=updateInput.parse(body);operation='update';commandId=input.commandId;rows=[{recordId,version:input.version,changes:input.changes}]}
  else if(part==='records'&&recordId&&request.method==='DELETE'){const input=deleteInput.parse(body);operation='delete';commandId=input.commandId;rows=[{recordId,version:input.version,confirmation:input.confirmation}]}
  else if(part==='upsert'&&request.method==='PUT'){
   const input=upsertInput.parse(body);commandId=input.commandId;schemaVersion=input.schemaVersion;upsert=true
   const field=descriptor.fields.get(input.mergeFieldId)?.field
   if(!field||!scope.readableFieldIds.includes(field.id)||!scope.writableFieldIds.includes(field.id))throw new AdmissionError('forbidden','Merge field must be readable and writable')
   if(!field.unique||field.type==='computed'||descriptor.fields.get(field.id)?.join)throw new AdmissionError('validation','Merge field must have a scalar uniqueness rule')
   const value=validateCell(field,input.values[field.id]);if(value===null)throw new AdmissionError('validation','Merge value cannot be empty')
   const found=await reader.query(ctx,scope,{limit:2,filter:{kind:'condition',fieldId:field.id,op:'eq',value}})
   if(found.items.length>1)throw new AdmissionError('validation','Merge field did not identify one record')
   const existing=found.items[0];operation=existing?'update':'create';rows=existing?[{recordId:existing.ref.recordId,version:existing.version,changes:input.values}]:[{values:input.values}]
  }else throw new AdmissionError('not_found','Unknown REST records operation')
  const action='rest.records.'+(upsert?'upsert':operation),hash=await canonicalHash({path,method:request.method,body})
  const prior=await admission.replay(ctx,commandId,action,appId,hash);if(prior)return finish(prior)
  if(schemaVersion!==undefined&&schemaVersion!==descriptor.schema.version)throw new AdmissionError('schema_conflict','Current schema version required')
  const ids=rows.flatMap(row=>'recordId'in row?[row.recordId]:[]);if(new Set(ids).size!==ids.length)throw new AdmissionError('validation','A batch names each record once')
  for(const row of rows){const values='values'in row?row.values:'changes'in row?row.changes:{};if(Object.keys(values).some(id=>!scope.readableFieldIds.includes(id)))throw new AdmissionError('forbidden','REST writes require readable fields')}
  // The writer preflights each row against stored data. Also reject duplicate proposed
  // unique values within this request, before a transaction is assembled.
  for(const field of descriptor.schema.fields.filter(field=>field.unique)){
   const seen=new Set<string>()
   for(const row of rows){const values='values'in row?row.values:'changes'in row?row.changes:{};const value=Object.hasOwn(values,field.id)?values[field.id]:('values'in row?field.defaultValue:undefined);if(value===undefined||value===null)continue;const encoded=canonical(validateCell(field,value));if(seen.has(encoded))throw new AdmissionError('validation','A batch repeats a unique value');seen.add(encoded)}
  }
  const prepared:PreparedRecordChange[]=[]
  for(const [index,row]of rows.entries()){
   if('values'in row)prepared.push(await writer.prepareCreate(ctx,scope,row.values,await delegationCommandId(commandId,`rest-row-${index}`)))
   else if('changes'in row)prepared.push(await writer.prepareChange(ctx,scope,{ref:{appId,entityId,recordId:row.recordId},expectedVersion:row.version,changes:row.changes}))
   else{if(row.confirmation!==row.recordId)throw new AdmissionError('validation','Confirm deletion using the exact record ID');prepared.push(await writer.prepareDelete(ctx,scope,{appId,entityId,recordId:row.recordId},row.version))}
  }
  const fieldIds=[...new Set(prepared.flatMap(change=>change.audit.flatMap(fact=>fact.changes.map(change=>change.fieldId))))]
  const expected=rows.flatMap(row=>'recordId'in row?[{ref:{appId,entityId,recordId:row.recordId},version:row.version}]:[])
  const proposedRows=prepared.flatMap(change=>change.mutations.filter(mutation=>mutation.kind==='insert'&&mutation.table.tableId===descriptor.table.tableId).map(mutation=>({entityId,row:(mutation as Extract<typeof mutation,{kind:'insert'}>).row})))
  const permit=await policy.authorize(ctx,{appId,action:'record.'+(operation==='update'?'patch':operation),expected,targetEntityId:entityId,proposedRows,fieldIds,cost:[],inputHash:hash,commandId})
  const plan:AdmissionPlan<unknown>={commandId,action,appId,canonicalInputHash:hash,permit:{...permit,action},guards:prepared.flatMap(change=>change.guards),mutations:prepared.flatMap(change=>change.mutations),audit:prepared.flatMap(change=>change.audit),events:[],outbox:[],changed:prepared.map(change=>({ref:change.next.ref,version:change.next.version})),committedResult:operation==='delete'?{deleted:prepared.map(change=>change.next.ref),trashUntil:new Date(Date.parse(ctx.now)+30*86400000).toISOString()}:{rows:prepared.map(change=>change.next)}}
  return finish(await admission.commit(ctx,plan))
 }}
}
