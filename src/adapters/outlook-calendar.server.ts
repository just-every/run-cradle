import {z} from 'zod'
import type {CredentialPort,EffectInput,ProviderAdapter,ProviderResult} from './contracts'
import {ProviderTransport,refusal,unknown} from './transport.server'

/** Named private properties are retained with the event; no provider search by title. */
const property=(name:string)=>`String {b9f59dd2-e833-49ea-a393-c3260f9de033} Name ${name}`
export const outlookProperties={effect:property('CradleEffect'),hash:property('CradleHash'),record:property('CradleRecord'),definition:property('CradleDefinition')}
const eventSchema=z.object({id:z.string(),changeKey:z.string(),subject:z.string().optional(),body:z.object({content:z.string(),contentType:z.string()}).optional(),isAllDay:z.boolean().optional(),start:z.object({dateTime:z.string(),timeZone:z.string()}),end:z.object({dateTime:z.string(),timeZone:z.string()}),singleValueExtendedProperties:z.array(z.object({id:z.string(),value:z.string()})).optional()})
const inputSchema=z.object({calendarId:z.string().min(1).max(512),operation:z.enum(['create','move','cancel']),eventId:z.string().min(1).max(1024).optional(),etag:z.string().max(512).optional(),summary:z.string().max(500),description:z.string().max(20000),start:z.string().min(10).max(40),end:z.string().min(10).max(40),recordId:z.string(),definitionId:z.string()}).strict()
const quoted=(value:string)=>value.replaceAll("'","''")
export const outlookExpand="singleValueExtendedProperties($filter="+Object.values(outlookProperties).map(id=>`id eq '${id}'`).join(' or ')+')'
export const outlookMarkedQuery=(definitionId:string)=>new URLSearchParams({'$filter':`singleValueExtendedProperties/Any(ep: ep/id eq '${outlookProperties.definition}' and ep/value eq '${quoted(definitionId)}')`,'$expand':outlookExpand,'$top':'1000'})
/** Reviews use one provider-neutral projection, including Graph's change key. */
export function outlookReview(value:unknown){const e=eventSchema.parse(value);return {id:e.id,etag:e.changeKey,status:'confirmed',summary:e.subject??'',start:e.isAllDay?{date:e.start.dateTime.slice(0,10)}:{dateTime:e.start.dateTime.endsWith('Z')?e.start.dateTime:e.start.dateTime+'Z'},end:e.isAllDay?{date:e.end.dateTime.slice(0,10)}:{dateTime:e.end.dateTime.endsWith('Z')?e.end.dateTime:e.end.dateTime+'Z'}}}
export function outlookCalendarAdapter(credentials:CredentialPort,transport=new ProviderTransport()):ProviderAdapter{
 async function identity(e:EffectInput,purpose:'dispatch'|'readback'){const input=inputSchema.parse(e.input),credential=await credentials.resolve(e.connectionId,purpose,{attemptId:e.attemptId});if(credential.accountId!==input.calendarId)throw Error('Calendar scope mismatch');return {input,credential}}
 const date=(value:string)=>({dateTime:value.length===10?value+'T00:00:00':new Date(value).toISOString().replace(/Z$/,''),timeZone:'UTC'})
 async function read(e:EffectInput):Promise<ProviderResult>{try{
  const {input,credential}=await identity(e,'readback'),headers={authorization:`Bearer ${credential.token}`,Prefer:'outlook.timezone="UTC", outlook.body-content-type="text"'},query=new URLSearchParams({'$expand':outlookExpand})
  if(input.operation==='create')query.set('$filter',`singleValueExtendedProperties/Any(ep: ep/id eq '${outlookProperties.effect}' and ep/value eq '${quoted(e.idempotencyKey)}')`)
  const r=await transport.request(input.operation==='create'?'outlook.list':'outlook.get',{ids:input.operation==='create'?[input.calendarId]:[input.calendarId,input.eventId!],headers,query,deadline:e.deadline})
  if(input.operation==='cancel'&&[404,410].includes(r.status))return {state:'confirmed',externalId:input.eventId!,value:{operation:'cancel',etag:null},receiptHash:r.hash,requestId:r.requestId}
  const list=input.operation==='create'?z.object({value:z.array(z.unknown()).length(1),'@odata.nextLink':z.never().optional()}).safeParse(r.body):null
  const parsed=eventSchema.safeParse(input.operation==='create'?list?.success?list.data.value[0]:null:r.body)
  if(r.status!==200||!parsed.success)return unknown()
  const v=parsed.data,props=new Map(v.singleValueExtendedProperties?.map(p=>[p.id,p.value])??[])
  const same=(actual:string,expected:string)=>expected.length===10?actual.slice(0,10)===expected:Date.parse(actual.endsWith('Z')?actual:actual+'Z')===Date.parse(expected)
  if(input.operation==='cancel'||input.eventId&&v.id!==input.eventId||props.get(outlookProperties.effect)!==e.idempotencyKey||props.get(outlookProperties.hash)!==e.canonicalInputHash||props.get(outlookProperties.record)!==input.recordId||props.get(outlookProperties.definition)!==input.definitionId||(v.subject??'')!==input.summary||v.body?.contentType.toLowerCase()!=='text'||v.body.content!==input.description||!same(v.start.dateTime,input.start)||!same(v.end.dateTime,input.end)||v.start.timeZone!=='UTC'||v.end.timeZone!=='UTC'||!!v.isAllDay!==(input.start.length===10))return unknown()
  return {state:'confirmed',externalId:v.id,value:{operation:input.operation,etag:v.changeKey},receiptHash:r.hash,requestId:r.requestId}
 }catch{return unknown()}}
 return {id:'outlook',version:'record-sync-1',async preflight(e){const {input}=await identity(e,'dispatch');if(input.operation!=='create'&&(!input.eventId||!input.etag))throw Error('Original event and change key required')},reconcile:read,async execute(e){try{
  const {input,credential}=await identity(e,'dispatch'),headers:Record<string,string>={authorization:`Bearer ${credential.token}`,Prefer:'outlook.timezone="UTC", outlook.body-content-type="text"'}
  if(input.operation!=='create')headers['If-Match']=`W/"${input.etag!}"`
  const body={...(input.operation==='create'?{transactionId:e.idempotencyKey}:{}),subject:input.summary,body:{contentType:'text',content:input.description},isAllDay:input.start.length===10,start:date(input.start),end:date(input.end),singleValueExtendedProperties:[{id:outlookProperties.effect,value:e.idempotencyKey},{id:outlookProperties.hash,value:e.canonicalInputHash},{id:outlookProperties.record,value:input.recordId},{id:outlookProperties.definition,value:input.definitionId}]}
  const r=await transport.request(input.operation==='create'?'outlook.insert':input.operation==='move'?'outlook.update':'outlook.delete',{ids:[input.calendarId,...(input.eventId?[input.eventId]:[])],headers,...(input.operation==='cancel'?{}:{body}),deadline:e.deadline})
  if(input.operation==='cancel'&&r.status===204)return {state:'confirmed',externalId:input.eventId!,value:{operation:'cancel',etag:null},receiptHash:r.hash,requestId:r.requestId}
  if(r.status>=200&&r.status<300||r.status===409)return read(e)
  return refusal(r)??unknown()
 }catch{return unknown()}}}
}
