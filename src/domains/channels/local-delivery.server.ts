import type { PlatformBindings } from '../../core/platform/bindings'
import type { AdmissionPort } from '../admission/ports'
import { createNotificationMailAuthority,NOTIFICATION_APP,NOTIFICATION_PRINCIPAL } from './mail-authority.server'
import { legacyRecipientGuards } from './recipient.server'
import { registerTable,trustedPredicate } from '../admission/sql.server'
import { deliveries } from './tables.server'
import { canonicalHash } from '../admission/canonical'
import { createUlid } from '../../core/shared/ids'
import type { NotificationKind } from './ports'
const outbox=registerTable('rer_mail_development_outbox',['id','created_at','message'])
/** Explicit local mail selection writes the same Base outbox used by sign-in, atomically with delivery. */
export function createLocalChannelDelivery(env:PlatformBindings,admission:AdmissionPort){
 const db=env.DB,authority=createNotificationMailAuthority(db)
 return{async scheduled(now=Date.now()){
  const due=await db.prepare("SELECT id FROM channel_deliveries WHERE state IN ('queued','held') AND run_id IS NULL AND due_at<=? ORDER BY due_at,id LIMIT 100").bind(now).all<{id:string}>()
  for(const item of due.results){
   const ctx=await authority.context(item.id);ctx.now=new Date(now).toISOString();ctx.principal.expiresAt=new Date(now+60000).toISOString()
   const envelope=await authority.envelope(item.id,now),guards=[...envelope.guards],mutations:import('../admission/ports').SqlMutation[]=[]
   for(const row of envelope.rows){
    const n=await db.prepare('SELECT subject_id FROM notifications WHERE id=? AND unavailable=0').bind(row.notification_id).first<{subject_id:string}>()
    const access=n?await legacyRecipientGuards(db,{kind:row.kind as NotificationKind,operatorId:row.operator_id,campaignId:row.campaign_id,subjectId:n.subject_id,eventId:row.id},ctx.now):null
    if(!access)throw new Error('Notification recipient no longer has source access')
    guards.push(...access,trustedPredicate("EXISTS(SELECT 1 FROM channel_deliveries WHERE id=? AND version=? AND state IN ('queued','held') AND run_id IS NULL AND due_at<=?)",[row.id,row.version,now]))
    mutations.push({kind:'update',table:deliveries,set:{state:'delivered',version:row.version+1,updated_at:now,attempts:row.attempts+1,receipt_id:`development:${item.id}`},where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1})
   }
   const message={deliveryId:item.id,from:env.MAIL_FROM!,to:[envelope.to],subject:envelope.subject,text:envelope.text}
   mutations.push({kind:'insert',table:outbox,row:{id:`notification:${item.id}`,created_at:now,message:JSON.stringify(message)}})
   const action='notification.email.send';await admission.commit(ctx,{commandId:createUlid(),appId:NOTIFICATION_APP,action,canonicalInputHash:await canonicalHash(message),permit:{actor:{id:NOTIFICATION_PRINCIPAL,kind:'system'},action,appId:NOTIFICATION_APP,grantId:null,grantVersion:null,policyVersion:1,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]},guards:[],mutations,audit:[],events:[],outbox:[],committedResult:{deliveryId:item.id,state:'delivered'}})
  }
 }}
}
