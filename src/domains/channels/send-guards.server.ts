import type { RequestContext } from '../authority/ports'
import { AdmissionError } from '../admission/errors'
import { trustedPredicate } from '../admission/sql.server'
import type { MailEnvelope } from './delivery.server'
import { notificationKinds, type ChannelEffects, type NotificationKind } from './ports'
import { legacyRecipientGuards } from './recipient.server'
import { deliveryTime } from './clock'
import { createLegacyDigestProjection } from './digest.server'
import {commentRecipientGuards} from './comment-recipient.server'
import type {EntityRegistry} from '../authority/scope.server'

const denied=():never=>{throw new AdmissionError('forbidden','Notification email authority does not match the durable event, recipient or content')}

/** Both mail transports recheck current recipient/content authority and fence it at admission. */
export async function notificationSendGuards(db:D1Database,ctx:RequestContext,ids:string[],operatorId:string,input:MailEnvelope,now:number,entities?:EntityRegistry):Promise<ChannelEffects['guards']>{
 const guards=[trustedPredicate('EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1 AND email=?)',[operatorId,input.to])]
 const settings=await db.prepare('SELECT id,version,timezone,quiet_hours_start,quiet_hours_end FROM workspace_settings ORDER BY id LIMIT 1').first<{id:string;version:number;timezone:string;quiet_hours_start:string;quiet_hours_end:string}>()
 if(!settings)return denied()
 guards.push(trustedPredicate('EXISTS(SELECT 1 FROM workspace_settings WHERE id=? AND version=?)',[settings.id,settings.version]))
 const pref=await db.prepare('SELECT version,timezone FROM channel_preferences WHERE operator_id=?').bind(operatorId).first<{version:number;timezone:string|null}>()
 guards.push(trustedPredicate(pref?'EXISTS(SELECT 1 FROM channel_preferences WHERE operator_id=? AND version=?)':'NOT EXISTS(SELECT 1 FROM channel_preferences WHERE operator_id=?)',pref?[operatorId,pref.version]:[operatorId]))
 const bodies:string[]=[]
 for(const id of ids){
  const n=await db.prepare('SELECT n.id,n.title,n.body,n.subject_id,n.version,c.app_id,c.subject_type,c.event_kind,c.campaign_id FROM channel_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN channel_notifications c ON c.notification_id=n.id WHERE d.id=? AND n.unavailable=0 AND n.operator_id=d.operator_id AND c.event_kind=d.kind').bind(id).first<{id:string;title:string;body:string;subject_id:string;version:number;event_kind:NotificationKind;campaign_id:string|null;app_id:string;subject_type:string}>()
  if(!n||!notificationKinds.includes(n.event_kind))return denied()
  // A record-thread mention keeps its own comment authority, with or without its Launch campaign.
  const access=n.event_kind==='comment-mentioned'&&/^[0-9A-HJKMNP-TV-Z]{26}$/.test(n.subject_type)
   ?await commentRecipientGuards(db,entities,{...ctx,now:new Date(now).toISOString()},{notificationId:n.id,appId:n.app_id,entityId:n.subject_type,recordId:n.subject_id,operatorId})
   :await legacyRecipientGuards(db,{kind:n.event_kind,operatorId,campaignId:n.campaign_id,subjectType:n.subject_type,subjectId:n.subject_id,eventId:n.id},new Date(now).toISOString())
  if(!access)return denied()
  guards.push(...access,trustedPredicate('EXISTS(SELECT 1 FROM notifications WHERE id=? AND version=? AND unavailable=0)',[n.id,n.version]))
  if(deliveryTime(now,pref?.timezone??settings.timezone,settings.quiet_hours_start,settings.quiet_hours_end,['decision-assigned','critical-risk-escalated','outage','weekly-digest'].includes(n.event_kind))>now)return denied()
  if(n.event_kind==='weekly-digest'){
   const projection=await createLegacyDigestProjection(db)(ctx,operatorId,{localDate:new Intl.DateTimeFormat('en-CA',{timeZone:settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now),now:ctx.now})
   if(projection.body!==n.body)return denied()
   guards.push(...projection.guards)
  }
  bodies.push(`${n.title}\n${n.body}`)
 }
 if(input.text!==bodies.join('\n\n')||input.subject!==(bodies.length===1?bodies[0]!.split('\n')[0]!:'Your Cradle notifications'))return denied()
 for(const id of ids)guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM channel_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.id=? AND d.operator_id=? AND d.state IN ('held','queued','dispatching','unknown') AND d.due_at<=? AND n.unavailable=0 AND (d.kind<>'weekly-digest' OR (EXISTS(SELECT 1 FROM automations WHERE shipped_key='weekly-digest' AND enabled=1) AND NOT EXISTS(SELECT 1 FROM channel_preferences WHERE operator_id=d.operator_id AND digest_enabled=0))) AND (d.campaign_id IS NULL OR EXISTS(SELECT 1 FROM campaigns c WHERE c.id=d.campaign_id AND c.archived_at IS NULL)) AND NOT EXISTS(SELECT 1 FROM channel_preferences p,json_each(p.muted_json) m WHERE p.operator_id=d.operator_id AND m.value=d.kind))`,[id,operatorId,now]))
 return guards
}
