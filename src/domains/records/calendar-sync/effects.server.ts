import {createUlid} from '../../../core/shared/ids'
import type {RequestContext,PolicyPort} from '../../authority/ports'
import type {AdmissionPort,SqlMutation} from '../../admission/ports'
import type {createRecordServices} from '../service.server'
import type {createExecutionService} from '../../execution/service.server'
import type {EffectRequest} from '../../execution/contracts'
import {eq,trustedPredicate} from '../../admission/sql.server'
import {AdmissionError} from '../../admission/errors'
import {canonicalHash} from '../../admission/canonical'
import {events,type Definition,type Event} from './storage.server'
import {syncDefinition} from './contracts'
export function calendarEffects(db:D1Database,policy:PolicyPort,admission:AdmissionPort,records:ReturnType<typeof createRecordServices>,execution:ReturnType<typeof createExecutionService>,origin:string){return async(ctx:RequestContext,d:Definition,recordId:string,commandId:string,restoring=false,paced=false)=>{
 const prior=await db.prepare("SELECT result_json FROM command_admissions WHERE command_id=? AND actor_id=? AND action='record.calendar.sync' AND state='committed'").bind(commandId,ctx.principal.id).first<{result_json:string}>();if(prior)return JSON.parse(prior.result_json);
 const definition=syncDefinition.parse(JSON.parse(d.definition_json)),ref={appId:d.app_id,entityId:d.entity_id,recordId},scope=await policy.scope(ctx,{appId:d.app_id,entityId:d.entity_id,purpose:'export'}),row=await records.reader.record(ctx,scope,ref)
 const event=await db.prepare('SELECT * FROM record_calendar_events WHERE definition_id=? AND record_id=?').bind(d.id,recordId).first<Event>()
 if(event?.last_record_version===row.version&&!restoring&&event.state==='synced')return {state:'unchanged'}
 if(event?.review_json&&!restoring)throw new AdmissionError('version_conflict','Resolve the calendar review before syncing this event.')
 if(event?.attempt_id){const attempt=await db.prepare('SELECT a.state,r.state AS run_state FROM execution_attempts a JOIN execution_runs r ON r.id=a.run_id WHERE a.id=?').bind(event.attempt_id).first<{state:string;run_state:string}>();if(attempt&&['queued','running','waiting','unknown','partial'].includes(attempt.run_state))throw new AdmissionError('version_conflict','The original calendar effect must settle before another effect can start.')}
 const value=(id:string|undefined)=>{const c=id?row.fields[id]:undefined;return c?.state==='value'?c.value:null}
 if(!scope.readableFieldIds.includes(definition.startFieldId))throw new AdmissionError('forbidden','Calendar sync is stopped because its date field is no longer readable.')
 const start=value(definition.startFieldId),cancel=row.lifecycle==='deleted'||!start
 if(cancel&&(!event?.event_id||event.state==='cancelled'))return {state:'unchanged'}
 if(!cancel&&typeof start!=='string')throw new AdmissionError('validation','The calendar date is invalid.')
 const operation=cancel?'cancel':event?.event_id&&event.state!=='cancelled'?'move':'create',generation=(event?.generation??0)+1,fieldIds=[definition.startFieldId,definition.endFieldId,definition.titleFieldId,...definition.fieldIds].filter((id):id is string=>!!id&&scope.readableFieldIds.includes(id))
 const end=value(definition.endFieldId),date=typeof start==='string'?start:'1970-01-01',isDate=date.length===10
 let until=typeof end==='string'?end:isDate?date:new Date(Date.parse(date)+3600000).toISOString()
 if(isDate){const exclusive=new Date(until+'T00:00:00Z');exclusive.setUTCDate(exclusive.getUTCDate()+1);until=exclusive.toISOString().slice(0,10)}
 if(!cancel&&Date.parse(date)>=Date.parse(until))throw new AdmissionError('validation','Calendar end must follow its start.')
 const title=value(definition.titleFieldId),summary=title===null?'':typeof title==='string'?title:String(title)
 const description=[`${origin}/app/records/${d.app_id}/${d.entity_id}/${recordId}`,...definition.fieldIds.filter(id=>scope.readableFieldIds.includes(id)).map(id=>`${records.descriptors.get(d.app_id,d.entity_id).fields.get(id)?.field.label}: ${value(id)??''}`)].join('\n')
 const connection=await db.prepare('SELECT version FROM provider_connections WHERE id=?').bind(d.connection_id).first<{version:number}>(),live=await db.prepare('SELECT release_id FROM live_app_releases WHERE app_id=?').bind(d.app_id).first<{release_id:string}>()
 if(!connection||!live)throw new AdmissionError('not_found','Calendar connection or adopted release is unavailable.')
 const request:EffectRequest={calendarBinding:{definitionId:d.id,definitionVersion:d.version,recordId,generation,operation},appId:d.app_id,action:'record.calendar.sync',provider:'google-calendar',connectionId:d.connection_id,connectionVersion:connection.version,input:{calendarId:d.calendar_id,operation,...(operation!=='create'?{eventId:event!.event_id!,etag:event!.etag!}:{}),summary,description,start:date,end:until,recordId,definitionId:d.id},fieldIds,expected:[{ref,version:row.version}],cost:[],grantId:null,grantVersion:null,releaseId:live.release_id,schemaVersion:row.schemaVersion,controlEpoch:d.version,caseId:null,definitionId:d.id,definitionVersion:d.version,trigger:`calendar:${commandId}`,causeRunIds:[],causeDefinitionIds:[],unknownDeadline:new Date(Date.now()+3600000).toISOString(),custodianId:d.owner_id,deadline:new Date(Date.now()+86400000).toISOString()}
 const originalReview=event?.review_json
 // Restore is an explicit resolution; the review is cleared atomically with effect admission.
 if(restoring&&originalReview){const external=JSON.parse(originalReview);if(external.status==='cancelled')throw new AdmissionError('validation','This calendar event was deleted. Apply the deletion, then explicitly sync a new generation.');request.calendarBinding!.reviewEtag=external.etag;request.input={...request.input as Record<string,string>,etag:external.etag}}
 const plan=await execution.prepareEffect(ctx,commandId,request,{idempotencyKey:`cradle/calendar/${d.id}/${recordId}/${generation}`})
 const now=new Date().toISOString(),rowEvent={id:event?.id??createUlid(),definition_id:d.id,record_id:recordId,generation,event_id:operation==='create'?null:event!.event_id,etag:operation==='create'?null:event!.etag,state:'queued',attempt_id:plan.committedResult.attemptId,review_json:null,last_record_version:row.version,created_at:event?.created_at??now,updated_at:now}
 const mutation:SqlMutation=event?{kind:'update',table:events,set:rowEvent,where:eq(events,'id',event.id),expectedRows:1}:{kind:'insert',table:events,row:rowEvent}
 return (await admission.commit(ctx,{...plan,guards:[...plan.guards,...(paced?[trustedPredicate("(SELECT count(*) FROM execution_attempts WHERE action='record.calendar.sync' AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds'))<10")]:[]),...(event?[trustedPredicate('EXISTS(SELECT 1 FROM record_calendar_events WHERE id=? AND generation=?)',[event.id,event.generation])]:[])],mutations:[...plan.mutations,mutation]})).result
}}
