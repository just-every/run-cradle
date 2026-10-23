import type {RequestContext} from '../../authority/ports'
import type {ServerFoundation} from '../../../core/app/foundation.server'
import type {createProvidersComposition} from '../../../core/app/composition/providers.server'
import type {createRecordServices} from '../service.server'
import {AdmissionError} from '../../admission/errors'
import {eq,trustedPredicate} from '../../admission/sql.server'
import {canonicalHash} from '../../admission/canonical'
import {delegationCommandId} from '../../authority/user-delegation.server'
import {requireBaseAuthor} from '../manual/base-access.server'
import {calendarConfiguration} from './configuration.server'
import {calendarEffects} from './effects.server'
import {ensureCalendarCapture} from './capture.server'
import {events,type Definition,type Event} from './storage.server'
import {syncDefinition} from './contracts'
export function createRecordCalendarSync(db:D1Database,foundation:ServerFoundation,providers:ReturnType<typeof createProvidersComposition>,records:ReturnType<typeof createRecordServices>,origin:string){
 const {policy,admission}=foundation,configure=calendarConfiguration(db,policy,admission,foundation.descriptors),effect=calendarEffects(db,policy,admission,records,providers.execution,origin)
 async function owned(ctx:RequestContext,id:string){const d=await db.prepare('SELECT * FROM record_calendar_definitions WHERE id=? AND owner_id=?').bind(id,ctx.principal.id).first<Definition>();if(!d)throw new AdmissionError('not_found','Calendar sync is unavailable.');return d}
 async function list(ctx:RequestContext,appId:string,entityId:string){
  const scope=await policy.scope(ctx,{appId,entityId,purpose:'read'}),rows=(await db.prepare('SELECT * FROM record_calendar_definitions WHERE app_id=? AND entity_id=? AND owner_id=?').bind(appId,entityId,ctx.principal.id).all<Definition>()).results
  const connections=(await db.prepare("SELECT c.id,c.name,c.account_id,c.state,c.version,cat.calendars_json FROM provider_connections c LEFT JOIN record_calendar_catalogues cat ON cat.connection_id=c.id WHERE c.app_id=? AND c.owner_id=? AND c.adapter_id='google-calendar' AND c.revoked_at IS NULL").bind(appId,ctx.principal.id).all<{id:string;name:string;account_id:string;state:string;version:number;calendars_json:string|null}>()).results.map(c=>({id:c.id,name:c.name,accountId:c.account_id,state:c.state,calendars:JSON.parse(c.calendars_json??'[]')}))
  let canConfigure=false;try{canConfigure=!!await requireBaseAuthor(db,ctx,appId)}catch{}
  const definitions=[]
  for(const d of rows){const definition=syncDefinition.parse(JSON.parse(d.definition_json)),items=[];let stopped=!d.enabled||!canConfigure
   const connection=connections.find(c=>c.id===d.connection_id);if(!connection||connection.state!=='connected')stopped=true
   const approved=await db.prepare("SELECT 1 FROM provider_connections c,json_each(c.scopes_json) s,json_each(json_extract(s.value,'$.actions')) a WHERE c.id=? AND json_extract(s.value,'$.resource')=? AND a.value='record.calendar.sync'").bind(d.connection_id,d.calendar_id).first();if(!approved||!scope.readableFieldIds.includes(definition.startFieldId))stopped=true
   const eventRows=(await db.prepare('SELECT * FROM record_calendar_events WHERE definition_id=? ORDER BY updated_at DESC LIMIT 200').bind(d.id).all<Event>()).results
   for(const event of eventRows){try{const row=await records.reader.record(ctx,scope,{appId,entityId,recordId:event.record_id}),title=row.fields[definition.titleFieldId],review=event.review_json?JSON.parse(event.review_json):null
     items.push({recordId:row.id,label:title?.state==='value'?String(title.value??''):'',state:event.state,eventId:event.event_id,review:review?{deleted:review.status==='cancelled',summary:scope.readableFieldIds.includes(definition.titleFieldId)?review.summary:undefined,start:review.start,end:review.end}:null,canResolve:scope.writableFieldIds.includes(definition.startFieldId)&&(!definition.endFieldId||scope.writableFieldIds.includes(definition.endFieldId)),attemptId:event.attempt_id})
    }catch(error){if(!(error instanceof Error)||!('code'in error)||!['forbidden','not_found'].includes(String(error.code)))throw error}}
   const query=await records.reader.query(ctx,scope,{appId,entityId,limit:1,filter:{kind:'all',conditions:[]}})
   const total=query.total.kind==='exact'?query.total.value:null
   definitions.push({id:d.id,version:d.version,definition,state:stopped?'stopped':'active',items,notOnCalendar:total===null?null:Math.max(0,total-eventRows.filter(e=>e.state!=='cancelled').length)})
  }
  return {definitions,connections,canConfigure}
 }
 async function sync(ctx:RequestContext,id:string,recordId:string,commandId:string){const d=await owned(ctx,id);return effect(ctx,d,recordId,commandId)}
 async function refresh(ctx:RequestContext,id:string,commandId:string){const row=await db.prepare('SELECT app_id FROM provider_connections WHERE id=? AND owner_id=?').bind(id,ctx.principal.id).first<{app_id:string}>();if(!row)throw new AdmissionError('not_found','Connection is unavailable.');return (await admission.commit(ctx,await providers.jobs.prepare(ctx,commandId,id,'connection.sync'))).result}
 async function resolve(ctx:RequestContext,id:string,recordId:string,commandId:string,action:'apply'|'restore'){
  const d=await owned(ctx,id),definition=syncDefinition.parse(JSON.parse(d.definition_json)),ref={appId:d.app_id,entityId:d.entity_id,recordId},scope=await policy.scope(ctx,{appId:d.app_id,entityId:d.entity_id,purpose:'read'}),row=await records.reader.record(ctx,scope,ref)
  if(!scope.writableFieldIds.includes(definition.startFieldId)||definition.endFieldId&&!scope.writableFieldIds.includes(definition.endFieldId))throw new AdmissionError('forbidden','Write authority on the calendar date fields is required.')
  const event=await db.prepare('SELECT * FROM record_calendar_events WHERE definition_id=? AND record_id=? AND review_json IS NOT NULL').bind(id,recordId).first<Event>();if(!event)throw new AdmissionError('not_found','Calendar review is no longer open.')
  if(action==='restore')return effect(ctx,d,recordId,commandId,true)
  const external=JSON.parse(event.review_json!),date=(v:unknown)=>{if(!v||typeof v!=='object')throw new AdmissionError('validation','Calendar date cannot be applied.');const o=v as {date?:string;dateTime?:string};return o.date??o.dateTime??null}
  const changes:Record<string,string|null>={[definition.startFieldId]:external.status==='cancelled'?null:date(external.start)}
  if(definition.endFieldId){const end=external.status==='cancelled'?null:date(external.end);changes[definition.endFieldId]=end?.length===10?new Date(Date.parse(end+'T00:00:00Z')-86400000).toISOString().slice(0,10):end}
  if(external.status!=='cancelled'&&scope.writableFieldIds.includes(definition.titleFieldId)&&typeof external.summary==='string')changes[definition.titleFieldId]=external.summary
  const prepared=await records.writer.prepareChange(ctx,scope,{ref,expectedVersion:row.version,changes}),hash=await canonicalHash({id,recordId,action,event:external}),permit=await policy.authorize(ctx,{appId:d.app_id,action:'record.patch',expected:[{ref,version:row.version}],fieldIds:Object.keys(changes),cost:[],inputHash:hash,commandId})
  return (await admission.commit(ctx,{commandId,action:'record.patch',appId:d.app_id,canonicalInputHash:hash,permit,guards:[...prepared.guards,trustedPredicate('EXISTS(SELECT 1 FROM record_calendar_events WHERE id=? AND review_json=?)',[event.id,event.review_json!])],mutations:[...prepared.mutations,{kind:'update',table:events,set:{review_json:null,state:external.status==='cancelled'?'cancelled':'synced',etag:external.etag??null,last_record_version:row.version+1,updated_at:new Date().toISOString()},where:eq(events,'id',event.id),expectedRows:1}],audit:[...prepared.audit,{action:'record.calendar.apply-review',subject:ref,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{recordId,applied:true}})).result
 }
 async function tick(){if((await db.prepare("SELECT count(*) AS total FROM execution_attempts WHERE action='record.calendar.sync' AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds')").first<{total:number}>())!.total>=10)return;const pending=(await db.prepare("SELECT change.id AS change_id,change.record_id,definition.* FROM record_calendar_changes change JOIN record_calendar_definitions definition ON definition.id=change.definition_id WHERE change.state='pending' AND definition.enabled=1 ORDER BY change.created_at,change.id LIMIT 10").all<Definition&{change_id:string;record_id:string}>()).results
  for(const change of pending){const commandId=await delegationCommandId(change.change_id,'calendar-effect')
   // The stored author is the real native actor that approved this exact definition.
   const definitionId=(await db.prepare('SELECT definition_id FROM record_calendar_changes WHERE id=?').bind(change.change_id).first<{definition_id:string}>())?.definition_id
   if(!definitionId)continue
   const definition=await db.prepare('SELECT * FROM record_calendar_definitions WHERE id=?').bind(definitionId).first<Definition>();if(!definition)continue
   const ctx:RequestContext={principal:JSON.parse(definition.actor_json),requestId:commandId,now:new Date().toISOString(),ingress:'schedule'}
   try{await effect(ctx,definition,change.record_id,commandId,false,true);await db.prepare("UPDATE record_calendar_changes SET state='complete',updated_at=? WHERE id=?").bind(new Date().toISOString(),change.change_id).run()}catch(error){if(error instanceof Error&&'code'in error&&['forbidden','signed_out','grant_revoked','not_found'].includes(String(error.code)))await db.prepare("UPDATE record_calendar_changes SET state='stopped',updated_at=? WHERE id=?").bind(new Date().toISOString(),change.change_id).run();else if(!(error instanceof Error)||!('code'in error)||String(error.code)!=='version_conflict')throw error}
  }
 }
 async function reconcile(ctx:RequestContext,id:string,recordId:string){const d=await owned(ctx,id),event=await db.prepare('SELECT attempt_id FROM record_calendar_events WHERE definition_id=? AND record_id=?').bind(d.id,recordId).first<{attempt_id:string}>();if(!event)throw new AdmissionError('not_found','Calendar effect is unavailable.');return providers.execution.reconcile(ctx,event.attempt_id)}
 return {list,reconcile,save:async(ctx:RequestContext,input:unknown)=>{const result=await configure(ctx,input);await ensureCalendarCapture(db,foundation.descriptors);return result},sync,refresh,resolve,tick}
}
