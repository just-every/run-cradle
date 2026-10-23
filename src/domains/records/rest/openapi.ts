import {z} from 'zod'
import type {EntitySchema,Field} from '../contracts'
import {querySchema,cellValueSchema,idSchema} from '../validators'
import {createInput,updateInput,deleteInput,batchInput,upsertInput} from './contracts'
const json=(schema:z.ZodType)=>z.toJSONSchema(schema,{unrepresentable:'any'}) as Record<string,unknown>
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,...(required.length?{required}:{}),additionalProperties:false})
const array=(items:unknown)=>({type:'array',items})
const ref=object({appId:json(idSchema),entityId:json(idSchema),recordId:json(idSchema)},['appId','entityId','recordId'])
function cell(field:Field):Record<string,unknown>{
 let schema:Record<string,unknown>
 if(field.type==='computed')schema=json(cellValueSchema)
 else if(field.type==='boolean')schema={type:'boolean'}
 else if(field.type==='money')schema=object({minor:{type:'string'},currency:{type:'string'},scale:{type:'integer'}},['minor','currency','scale'])
 else if(field.type==='relation')schema=field.relation?.cardinality==='many'?array(ref):ref
 else if(field.type==='multi_select')schema=array({type:'string',enum:field.options?.map(option=>option.id)})
 else if(field.type==='attachment')schema=array({type:'object'})
 else schema={type:'string',...(field.type==='date'?{format:'date'}:field.type==='instant'?{format:'date-time'}:{}),...(field.type==='select'?{enum:field.options?.map(option=>option.id)}:{})}
 return {...(field.required?schema:{anyOf:[schema,{type:'null'}]}),title:field.label}
}
export function restSchema(schema:EntitySchema){return {id:schema.id,appId:schema.appId,label:schema.label,version:schema.version,fields:schema.fields.map(field=>({id:field.id,label:field.label,type:field.type,required:field.required,unique:field.unique,...(field.options?{options:field.options}:{}),...(field.readOnly?{readOnly:true}:{})})),...(schema.fields.some(field=>field.id===schema.primaryFieldId)?{primaryFieldId:schema.primaryFieldId}:{})}}
function requestSchema(input:z.ZodType,fields:unknown,requiredFields:string[],create=false){
 const visit=(value:unknown,creating=false):unknown=>{
  if(Array.isArray(value))return value.map(item=>visit(item,creating))
  if(!value||typeof value!=='object')return value
  const item=value as {properties?:{operation?:{const?:string}}}
  creating=creating||item.properties?.operation?.const==='create'
  return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,key==='properties'&&child&&typeof child==='object'?Object.fromEntries(Object.entries(child).map(([name,definition])=>[name,['values','changes'].includes(name)?{...(fields as object),...(creating&&name==='values'&&requiredFields.length?{required:requiredFields}:{})}:visit(definition,creating)])):visit(child,creating)]))
 }
 return visit(json(input),create)
}
export function recordOpenApi(appId:string,schemas:EntitySchema[]){
 const paths:Record<string,unknown>={}
 for(const schema of schemas){
  const base=`/api/v1/apps/${appId}/rest/entities/${schema.id}`
  const values=object(Object.fromEntries(schema.fields.filter(field=>!field.readOnly&&field.type!=='computed').map(field=>[field.id,cell(field)])))
  const fieldCell=(field:Field)=>({oneOf:[object({state:{const:'value'},value:cell(field)},['state','value']),object({state:{const:'redacted'},reason:{enum:['policy','erased']}},['state','reason']),object({state:{const:'unavailable'},code:{type:'string'},fieldIds:array(json(idSchema)),message:{type:'string'}},['state','code','fieldIds','message'])]})
  const record=object({id:json(idSchema),ref,version:{type:'integer'},createdAt:{type:'string',format:'date-time'},updatedAt:{type:'string',format:'date-time'},lifecycle:{type:'string'},schemaVersion:{type:'integer'},allowedActions:array({type:'object'}),fields:object(Object.fromEntries(schema.fields.map(field=>[field.id,fieldCell(field)])))},['id','ref','version','fields'])
  const receipt=object({replay:{type:'boolean'},consistencyToken:{type:'string'},result:object({commandId:json(idSchema),state:{const:'committed'},value:{oneOf:[object({rows:array(record)},['rows']),object({deleted:array(ref),trashUntil:{type:'string',format:'date-time'}},['deleted','trashUntil'])]},changed:array(object({ref,version:{type:'integer'}})),eventIds:array(json(idSchema))},['commandId','state','value'])},['replay','result','consistencyToken'])
  const page=object({items:array(record),nextCursor:{type:['string','null']},total:object({kind:{enum:['exact','at_least']},value:{type:'integer'}}),evaluatedAt:{type:'string',format:'date-time'}},['items','nextCursor','total','evaluatedAt'])
  const operation=(name:string,input?:z.ZodType,recordId=false)=>({operationId:`${schema.id}_${name}`,'x-cradle-operation':name,'x-cradle-entityId':schema.id,security:[{apiKey:[]}],...(recordId?{parameters:[{name:'recordId',in:'path',required:true,schema:json(idSchema)}]}:{}),...(input?{requestBody:{required:true,content:{'application/json':{schema:requestSchema(input,values,schema.fields.filter(field=>field.required&&field.defaultValue===undefined&&!field.readOnly&&field.type!=='computed').map(field=>field.id),name==='create')}}}}:{}),responses:{'200':{description:'Current policy checked result. Mutations are atomic; receipt replay requires current subject visibility.',content:{'application/json':{schema:{type:'object',properties:{data:name==='get'?record:name==='query'?page:name==='schema'?{type:'object'}:receipt,meta:{type:'object'}},required:['data','meta']}}}},'400':{description:'Invalid request; no writes.'},'401':{description:'A current session or API key is required.'},'403':{description:'Current key scope or policy refuses the operation.'},'404':{description:'The route or record is unavailable.'},'409':{description:'Schema, record or authority changed; no writes.'}}})
  paths[base]={get:operation('schema')}
  paths[base+'/query']={post:operation('query',querySchema)}
  paths[base+'/records']={post:operation('create',createInput)}
  paths[base+'/records/{recordId}']={get:operation('get',undefined,true),patch:operation('update',updateInput,true),delete:operation('delete',deleteInput,true)}
  paths[base+'/batch']={post:operation('batch',batchInput)}
  paths[base+'/upsert']={put:operation('upsert',upsertInput)}
 }
 return {openapi:'3.1.0',info:{title:'Cradle records REST API',version:'1'},servers:[{url:'/'}],components:{securitySchemes:{apiKey:{type:'http',scheme:'bearer'}}},paths}
}
