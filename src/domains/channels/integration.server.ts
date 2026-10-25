import {legacyRecipientGuards} from './recipient.server'
import type { RequestContext } from '../authority/ports'
import { trustedPredicate } from '../admission/sql.server'
import { createUlid } from '../../core/shared/ids'
import type { ChannelEffects, NotificationInput, RecipientProjection } from './ports'
import { deliveryTime } from './clock'
import * as t from './tables.server'
import {createAdmissionService} from '../admission/service.server'
import {canonicalHash} from '../admission/canonical'
import {delegationCommandId} from '../authority/user-delegation.server'
import {NOTIFICATION_PRINCIPAL,NOTIFICATION_APP} from './mail-authority.server'
import {createNotificationReplay} from './replay.server'
import {erasureAdmissionGuard} from '../lifecycle/file-writes.server'
import type {SqlPredicate} from '../admission/ports'
const empty=():ChannelEffects=>({guards:[],mutations:[]})
const labels:Record<string,string>={'decision-assigned':'A decision was assigned to you','critical-risk-escalated':'A critical risk was escalated','readiness':'Launch readiness requested','comment-mentioned':'You were mentioned in a comment','automation-failed':'An automation failed','decision-overdue':'A decision is overdue','outage':'An operational outage needs attention','progress':'Progress update','weekly-digest':'Weekly portfolio digest','record-automation':'A record automation ran'}
export function createChannelsIntegration(db:D1Database,project?:RecipientProjection){
 async function notification(ctx:RequestContext,input:NotificationInput):Promise<ChannelEffects>{
  if(input.operatorId===(input.actorId===undefined?(ctx.principal.humanId??ctx.principal.id):input.actorId))return empty()
  const oldEvent=await db.prepare('SELECT notification_id FROM channel_events WHERE event_id=? AND operator_id=?').bind(input.eventId,input.operatorId).first<{notification_id:string}>()
  if(oldEvent)return {...empty(),notificationId:oldEvent.notification_id}
  const active=await db.prepare('SELECT id FROM operators WHERE id=? AND active=1').bind(input.operatorId).first();if(!active)return empty()
  const appId=input.appId??'00000000000000000000000700',now=Date.parse(ctx.now),effects=empty()
  effects.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1)',[input.operatorId]),trustedPredicate('NOT EXISTS(SELECT 1 FROM channel_events WHERE event_id=? AND operator_id=?)',[input.eventId,input.operatorId]))
  if(input.campaignId)effects.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM campaigns WHERE id=? AND archived_at IS NULL)',[input.campaignId]))
  // Legacy notification text contains no arbitrary record fields. Nonlegacy messages require an authorized recipient projection.
  let text={title:labels[input.kind],body:'Open your notification inbox to review this event.'}
  if(project){const p=await project(ctx,input);effects.guards.push(...p.guards);text=p}
  else if(appId!=='00000000000000000000000700')throw new Error('Scoped notification recipient projection is required')
  else {const access=await legacyRecipientGuards(db,input,ctx.now);if(!access)return empty();effects.guards.push(...access)}
  if(input.kind==='record-automation'&&input.title!==undefined&&input.body!==undefined)text={title:input.title,body:input.body}
  if(input.kind==='weekly-digest'){if(!input.body)throw new Error('Digest requires authorized portfolio projection');text={title:'Weekly portfolio digest',body:input.body}}
  if(input.kind==='progress'){
   if(!input.progressOutcome||!['base-import','warehouse-export'].includes(input.subjectType??''))throw new Error('Progress requires its job source and outcome')
   const name=input.subjectType==='base-import'?'Import':'Export'
   text={title:`${name} ${input.progressOutcome==='failed'?'needs attention':'completed'}`,body:input.progressOutcome==='failed'?`The ${name.toLowerCase()} you started did not finish. Open Settings to review it.`:`The ${name.toLowerCase()} you started has finished. Open Settings to review it.`}
  }
  const prefs=await db.prepare('SELECT version,timezone,muted_json,progress_enabled FROM channel_preferences WHERE operator_id=?').bind(input.operatorId).first<{version:number;timezone:string|null;muted_json:string;progress_enabled:number}>()
  effects.guards.push(trustedPredicate(prefs?'EXISTS(SELECT 1 FROM channel_preferences WHERE operator_id=? AND version=?)':'NOT EXISTS(SELECT 1 FROM channel_preferences WHERE operator_id=?)',prefs?[input.operatorId,prefs.version]:[input.operatorId]))
  if(input.kind==='progress'&&input.progressOutcome!=='failed'&&!prefs?.progress_enabled)return effects
  const settings=await db.prepare('SELECT id,version,timezone,quiet_hours_start,quiet_hours_end FROM workspace_settings ORDER BY id LIMIT 1').first<{id:string;version:number;timezone:string;quiet_hours_start:string;quiet_hours_end:string}>();if(!settings)throw new Error('Workspace notification settings are required')
  effects.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM workspace_settings WHERE id=? AND version=?)',[settings.id,settings.version]))
  const repeat=await db.prepare(`SELECT n.id,n.version FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.operator_id=? AND n.subject_id=? AND c.app_id=? AND c.event_kind=? AND c.last_event_at>? AND n.unavailable=0 AND NOT EXISTS(SELECT 1 FROM notification_reads r WHERE r.notification_id=n.id AND r.operator_id=n.operator_id) ORDER BY c.last_event_at DESC LIMIT 1`).bind(input.operatorId,input.subjectId,appId,input.kind,now-3600000).first<{id:string;version:number}>()
  const id=repeat?.id??createUlid(now);effects.notificationId=id
  if(repeat){effects.mutations.push({kind:'update',table:t.notifications,set:{title:text.title,body:text.body,updated_at:now,version:repeat.version+1},where:trustedPredicate('id=? AND version=? AND NOT EXISTS(SELECT 1 FROM notification_reads WHERE notification_id=?)',[id,repeat.version,id]),expectedRows:1},{kind:'update',table:t.metadata,set:{last_event_at:now},where:trustedPredicate('notification_id=?',[id]),expectedRows:1})}
  else {
   effects.guards.push(trustedPredicate(`NOT EXISTS(SELECT 1 FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.operator_id=? AND n.subject_id=? AND c.app_id=? AND c.event_kind=? AND c.last_event_at>? AND n.unavailable=0 AND NOT EXISTS(SELECT 1 FROM notification_reads r WHERE r.notification_id=n.id AND r.operator_id=n.operator_id))`,[input.operatorId,input.subjectId,appId,input.kind,now-3600000]))
   effects.mutations.push({kind:'insert',table:t.notifications,row:{id,created_at:now,updated_at:now,version:1,operator_id:input.operatorId,kind:input.kind,subject_id:input.subjectId,title:text.title,body:text.body,unavailable:0}},{kind:'insert',table:t.metadata,row:{notification_id:id,app_id:appId,campaign_id:input.campaignId,subject_type:input.subjectType??input.kind.split('-')[0],event_kind:input.kind,last_event_at:now,failure:null}})
   const muted=(JSON.parse(prefs?.muted_json??'[]') as string[]).includes(input.kind),due=deliveryTime(now,prefs?.timezone??settings.timezone,settings.quiet_hours_start,settings.quiet_hours_end,['decision-assigned','critical-risk-escalated','outage','weekly-digest'].includes(input.kind))
   if(input.delivery!=='in-app')effects.mutations.push({kind:'insert',table:t.deliveries,row:{id:createUlid(now),notification_id:id,operator_id:input.operatorId,campaign_id:input.campaignId,kind:input.kind,state:muted?'muted':due>now?'held':'queued',due_at:due,created_at:now,updated_at:now,version:1,run_id:null,automation_run_id:input.runId??null,attempts:0}})
  }
  effects.mutations.push({kind:'insert',table:t.events,row:{event_id:input.eventId,operator_id:input.operatorId,notification_id:id}});return effects
 }
 async function withdraw(ctx:RequestContext,condition:string,values:string[],remove=false):Promise<ChannelEffects>{
  const effects=empty(),rows=await db.prepare(`SELECT d.id,d.version FROM channel_deliveries d WHERE ${condition} AND d.state IN ('held','queued','muted')`).bind(...values).all<{id:string;version:number}>()
  effects.guards.push(trustedPredicate(`(SELECT count(*) FROM channel_deliveries d WHERE ${condition} AND d.state IN ('held','queued','muted'))=?`,[...values,rows.results.length]))
  for(const row of rows.results)effects.mutations.push({kind:'update',table:t.deliveries,set:{state:'cancelled',version:row.version+1,updated_at:Date.parse(ctx.now)},where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1})
  const selector=condition.replaceAll('d.','c.').replace('c.operator_id','n.operator_id'),notifications=await db.prepare(`SELECT n.id,n.version FROM notifications n LEFT JOIN channel_notifications c ON c.notification_id=n.id WHERE ${selector}`).bind(...values).all<{id:string;version:number}>();effects.guards.push(trustedPredicate(`(SELECT count(*) FROM notifications n LEFT JOIN channel_notifications c ON c.notification_id=n.id WHERE ${selector})=?`,[...values,notifications.results.length]))
  for(const row of notifications.results)effects.mutations.push(remove?{kind:'delete',table:t.notifications,where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1}:{kind:'update',table:t.notifications,set:{unavailable:1,version:row.version+1,updated_at:Date.parse(ctx.now)},where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1})
  return effects
 }
 return {notification,withdrawCampaign:(ctx:RequestContext,id:string)=>withdraw(ctx,'d.campaign_id=?',[id]),deleteCampaign:(ctx:RequestContext,id:string)=>withdraw(ctx,'d.campaign_id=?',[id],true),withdrawNotification:(ctx:RequestContext,id:string)=>withdraw(ctx,'d.notification_id=?',[id]),async prepareRemoval(ctx:RequestContext,id:string){return {...await withdraw(ctx,'d.operator_id=?',[id]),blockers:[]}},async prepareErasure(ctx:RequestContext,id:string,_label:string){const effects=await withdraw(ctx,'d.operator_id=?',[id],true),pref=await db.prepare('SELECT version FROM channel_preferences WHERE operator_id=?').bind(id).first<{version:number}>();if(pref)effects.mutations.push({kind:'delete',table:t.preferences,where:trustedPredicate('operator_id=? AND version=?',[id,pref.version]),expectedRows:1});return effects}}
}

/** Async job facts use the same admission, recipient and delivery rules as other notices. */
export async function publishProgress(db:D1Database,input:{subjectType:'base-import'|'warehouse-export';subjectId:string;starterId:string;eventId:string;outcome:'completed'|'failed';guard:SqlPredicate;ingress:RequestContext['ingress']}){
 const starter=await db.prepare('SELECT human_id FROM authority_principals WHERE id=?').bind(input.starterId).first<{human_id:string|null}>()
 if(!starter?.human_id)throw new Error('Progress requires the retained human starter')
 const authority=await db.prepare('SELECT epoch FROM channel_mail_authority WHERE id=? AND active=1').bind(NOTIFICATION_PRINCIPAL).first<{epoch:number}>()
 if(!authority)throw new Error('Notification authority is unavailable')
 const now=Date.now(),commandId=await delegationCommandId(input.eventId,'progress'),ctx:RequestContext={requestId:commandId,now:new Date(now).toISOString(),ingress:input.ingress,principal:{id:NOTIFICATION_PRINCIPAL,kind:'system',humanId:null,sessionId:null,credentialId:input.eventId,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),authenticationEpoch:authority.epoch}}
 const effects=await createChannelsIntegration(db).notification(ctx,{kind:'progress',operatorId:starter.human_id,campaignId:null,subjectId:input.subjectId,subjectType:input.subjectType,eventId:input.eventId,actorId:null,progressOutcome:input.outcome})
 const action='progress.notify',guard=trustedPredicate('EXISTS(SELECT 1 FROM channel_mail_authority WHERE id=? AND active=1 AND epoch=?)',[NOTIFICATION_PRINCIPAL,authority.epoch]),value={eventId:input.eventId,subjectId:input.subjectId,subjectType:input.subjectType,starterId:input.starterId,operatorId:starter.human_id,outcome:input.outcome,notificationId:effects.notificationId??null}
 const admission=createAdmissionService(db,{authorizeReplay:createNotificationReplay(db),additionalGuards:current=>[trustedPredicate("NOT EXISTS(SELECT 1 FROM portability_fences WHERE name IN ('restore','snapshot'))",[]),erasureAdmissionGuard(current.now)]})
 // A no-op completion is recorded too, so opting in never replays old success.
 await admission.commit(ctx,{commandId,action,appId:NOTIFICATION_APP,canonicalInputHash:await canonicalHash({eventId:input.eventId,subjectId:input.subjectId,subjectType:input.subjectType,starterId:input.starterId,outcome:input.outcome}),permit:{actor:{id:ctx.principal.id,kind:'system'},action,appId:NOTIFICATION_APP,grantId:null,grantVersion:null,policyVersion:1,validUntil:ctx.principal.expiresAt,guards:[guard,input.guard],reservationMutations:[],reservationIds:[]},guards:effects.guards,mutations:effects.mutations,audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:value})
}
