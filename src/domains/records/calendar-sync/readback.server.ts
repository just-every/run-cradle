import {ProviderTransport} from '../../../adapters/transport.server'
import type {CredentialPort,ProviderResult} from '../../../adapters/contracts'
import type {RequestContext} from '../../authority/ports'
import type {EffectRequest} from '../../execution/contracts'
import type {SqlMutation} from '../../admission/ports'
import {eq,trustedPredicate} from '../../admission/sql.server'
import {AdmissionError} from '../../admission/errors'
import {events,type Definition,type Event} from './storage.server'
/** Runs inside the existing read-only connection.sync job. It never calls a calendar write. */
export async function readCalendarChanges(db:D1Database,ctx:RequestContext,id:string,credentials:CredentialPort,transport=new ProviderTransport()) {
 const connection=await db.prepare("SELECT owner_id,account_id FROM provider_connections WHERE id=? AND adapter_id='google-calendar' AND revoked_at IS NULL").bind(id).first<{owner_id:string;account_id:string}>()
 if(!connection||connection.owner_id!==ctx.principal.id)throw new AdmissionError('forbidden','Use a calendar connection you control.')
 const credential=await credentials.resolve(id,'readback',{jobId:ctx.requestId}),headers={authorization:`Bearer ${credential.token}`},deadline=new Date(Date.now()+60000).toISOString()
 const r=await transport.request('calendar.calendars',{headers,query:new URLSearchParams({minAccessRole:'owner'}),deadline})
 if(r.status!==200||!r.body||typeof r.body!=='object'||!('items'in r.body)||!Array.isArray(r.body.items))throw new AdmissionError('validation','Owned calendars could not be listed.')
 const calendars=r.body.items.filter((c):c is {id:string;summary?:string;accessRole:string}=>!!c&&typeof c==='object'&&typeof c.id==='string'&&c.accessRole==='owner').map(c=>({id:c.id,name:c.summary??c.id}))
 await db.prepare('INSERT INTO record_calendar_catalogues(connection_id,owner_id,calendars_json,checked_at) VALUES(?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET owner_id=excluded.owner_id,calendars_json=excluded.calendars_json,checked_at=excluded.checked_at').bind(id,ctx.principal.id,JSON.stringify(calendars),new Date().toISOString()).run()
 const definitions=(await db.prepare('SELECT * FROM record_calendar_definitions WHERE connection_id=? AND owner_id=?').bind(id,ctx.principal.id).all<Definition>()).results
 for(const d of definitions){
  if(credential.accountId!==d.calendar_id)throw Error('Calendar scope mismatch')
  const marked=await transport.request('calendar.list',{ids:[d.calendar_id],headers,query:new URLSearchParams({privateExtendedProperty:`cradleDefinition=${d.id}`,showDeleted:'true',maxResults:'2500'}),deadline})
  if(marked.status!==200||!marked.body||typeof marked.body!=='object'||!('items'in marked.body)||!Array.isArray(marked.body.items)||'nextPageToken'in marked.body)throw new AdmissionError('validation','Calendar review requires a complete marked-event response.')
  const rows=(await db.prepare("SELECT * FROM record_calendar_events WHERE definition_id=? AND event_id IS NOT NULL AND state<>'cancelled'").bind(d.id).all<Event>()).results
  for(const event of rows){
   if(event.review_json||!event.etag||event.state!=='synced')continue
   const external=marked.body.items.find((item:Record<string,unknown>)=>item.id===event.event_id)
   if(external&&external.etag===event.etag&&external.status!=='cancelled')continue
   const observed=external??{id:event.event_id,status:'cancelled'},now=new Date().toISOString()
   await db.prepare("UPDATE record_calendar_events SET review_json=?,state='review',updated_at=? WHERE id=? AND etag=? AND review_json IS NULL AND state='synced'").bind(JSON.stringify(observed),now,event.id,event.etag).run()
  }
 }
}
/** Provider-confirmed settlement advances the binding in the same admission as its receipt. */
export async function calendarSettlement(db:D1Database,r:EffectRequest,result:ProviderResult,attemptId:string):Promise<{guards:ReturnType<typeof trustedPredicate>[];mutations:SqlMutation[]}> {
 const b=r.calendarBinding;if(!b)return {guards:[],mutations:[]}
 const event=await db.prepare('SELECT id FROM record_calendar_events WHERE definition_id=? AND record_id=? AND generation=? AND attempt_id=?').bind(b.definitionId,b.recordId,b.generation,attemptId).first<{id:string}>()
 // Retried attempts keep the immutable key; their original attempt binding remains valid.
 const row=event??await db.prepare('SELECT e.id FROM record_calendar_events e JOIN execution_attempts original ON original.id=e.attempt_id JOIN execution_attempts current ON current.id=? AND current.run_id=original.run_id WHERE e.definition_id=? AND e.record_id=? AND e.generation=?').bind(attemptId,b.definitionId,b.recordId,b.generation).first<{id:string}>()
 if(!row)throw new AdmissionError('forbidden','Calendar event settlement lost its generation binding.')
 if(result.state!=='confirmed')return {guards:[],mutations:[{kind:'update',table:events,set:{state:result.state,updated_at:new Date().toISOString()},where:eq(events,'id',row.id),expectedRows:1}]}
 const value=result.value as {etag?:string|null}
 return {guards:[],mutations:[{kind:'update',table:events,set:{state:b.operation==='cancel'?'cancelled':'synced',event_id:result.externalId??null,etag:value.etag??null,updated_at:new Date().toISOString()},where:eq(events,'id',row.id),expectedRows:1}]}
}
