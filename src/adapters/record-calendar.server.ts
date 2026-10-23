import {z} from 'zod'
import type {CredentialPort,EffectInput,ProviderAdapter,ProviderResult} from './contracts'
import {ProviderTransport,refusal,unknown} from './transport.server'
import {sha256} from './crypto.server'
export const recordCalendarInput=z.object({calendarId:z.string().min(1).max(512),operation:z.enum(['create','move','cancel']),eventId:z.string().regex(/^[0-9a-v]{5,1024}$/).optional(),etag:z.string().max(512).optional(),summary:z.string().max(500),description:z.string().max(20000),start:z.string().min(10).max(40),end:z.string().min(10).max(40),recordId:z.string(),definitionId:z.string()}).strict()
export function recordCalendarAdapter(credentials:CredentialPort,transport=new ProviderTransport()):ProviderAdapter {
 async function identity(e:EffectInput,purpose:'dispatch'|'readback') {const input=recordCalendarInput.parse(e.input),eventId=input.eventId??await sha256(e.idempotencyKey),credential=await credentials.resolve(e.connectionId,purpose,{attemptId:e.attemptId});if(credential.accountId!==input.calendarId)throw Error('Calendar scope mismatch');return {input,eventId,credential}}
 const date=(value:string)=>value.length===10?{date:value}:{dateTime:value,timeZone:'UTC'}
 async function read(e:EffectInput):Promise<ProviderResult> {
  try {const {input,eventId,credential}=await identity(e,'readback'),r=await transport.request('calendar.get',{ids:[input.calendarId,eventId],headers:{authorization:`Bearer ${credential.token}`},deadline:e.deadline})
   if(input.operation==='cancel'&&[404,410].includes(r.status))return {state:'confirmed',externalId:eventId,value:{operation:'cancel',etag:null},receiptHash:r.hash,requestId:r.requestId}
   const p=z.object({id:z.string(),status:z.string(),etag:z.string(),summary:z.string().optional(),description:z.string().optional(),start:z.object({date:z.string().optional(),dateTime:z.string().optional()}).optional(),end:z.object({date:z.string().optional(),dateTime:z.string().optional()}).optional(),extendedProperties:z.object({private:z.record(z.string(),z.string())}).optional()}).safeParse(r.body)
   if(r.status!==200||!p.success||p.data.id!==eventId)return unknown()
   const v=p.data;if(input.operation==='cancel'&&v.status==='cancelled')return {state:'confirmed',externalId:eventId,value:{operation:'cancel',etag:v.etag},receiptHash:r.hash,requestId:r.requestId}
   const same=(a:string|undefined,b:string)=>b.length===10?a===b:Date.parse(a??'')===Date.parse(b)
   if(v.status!=='confirmed'||(v.summary??'')!==input.summary||(v.description??'')!==input.description||!same(v.start?.date??v.start?.dateTime,input.start)||!same(v.end?.date??v.end?.dateTime,input.end)||v.extendedProperties?.private.cradleHash!==e.canonicalInputHash||v.extendedProperties.private.cradleRecord!==input.recordId||v.extendedProperties.private.cradleDefinition!==input.definitionId)return unknown()
   return {state:'confirmed',externalId:eventId,value:{operation:input.operation,etag:v.etag},receiptHash:r.hash,requestId:r.requestId}
  }catch{return unknown()}
 }
 return {id:'google-calendar',version:'record-sync-1',async preflight(e){const {input}=await identity(e,'dispatch');if(input.operation!=='create'&&(!input.eventId||!input.etag))throw Error('Original event and ETag required')},reconcile:read,async execute(e){
  try {const {input,eventId,credential}=await identity(e,'dispatch'),headers:Record<string,string>={authorization:`Bearer ${credential.token}`};if(input.operation!=='create')headers['If-Match']=input.etag!
   const body={id:eventId,summary:input.summary,description:input.description,start:date(input.start),end:date(input.end),extendedProperties:{private:{cradleRecord:input.recordId,cradleDefinition:input.definitionId,cradleHash:e.canonicalInputHash}}}
   const r=await transport.request(input.operation==='create'?'calendar.insert':input.operation==='move'?'calendar.update':'calendar.delete',{ids:[input.calendarId,eventId],headers,query:new URLSearchParams({sendUpdates:'none'}),...(input.operation==='cancel'?{}:{body}),deadline:e.deadline})
   if(input.operation==='cancel'&&r.status===204)return {state:'confirmed',externalId:eventId,value:{operation:'cancel',etag:null},receiptHash:r.hash,requestId:r.requestId}
   if(r.status===409||r.status>=200&&r.status<300)return read(e)
   return refusal(r)??unknown()
  }catch{return unknown()}
 }}
}
