import type { PlatformBindings } from '../../core/platform/bindings'
import type { AdmissionPlan, AdmissionPort, SqlMutation } from '../admission/ports'
import type { RequestContext } from '../authority/ports'
import { AdmissionError } from '../admission/errors'
import { createNotificationMailAuthority,NOTIFICATION_APP } from './mail-authority.server'
import { registerTable,trustedPredicate } from '../admission/sql.server'
import { deliveries } from './tables.server'
import { canonicalHash } from '../admission/canonical'
import { createUlid } from '../../core/shared/ids'
const outbox=registerTable('rer_mail_development_outbox',['id','created_at','message'])
/** Local notification capture stays available to installed development workflows; demos retain no payload. */
export function createLocalChannelDelivery(env:PlatformBindings,admission:AdmissionPort){
 const db=env.DB,authority=createNotificationMailAuthority(db)
 async function prepare(ctx:RequestContext,id:string):Promise<AdmissionPlan<{deliveryId:string;state:string}>>{
   if(!env.MAIL_FROM?.trim())throw new AdmissionError('unconfigured','Local notification mail requires MAIL_FROM')
   const now=Date.parse(ctx.now),{envelope,permit}=await authority.authorizeLocal(ctx,id,env.MAIL_FROM),guards=[],mutations:SqlMutation[]=[]
   for(const row of envelope.rows){
    guards.push(trustedPredicate("EXISTS(SELECT 1 FROM channel_deliveries WHERE id=? AND version=? AND state IN ('queued','held') AND run_id IS NULL AND due_at<=?)",[row.id,row.version,now]))
    mutations.push({kind:'update',table:deliveries,set:{state:'delivered',version:row.version+1,updated_at:now,attempts:row.attempts+1,receipt_id:`development:${id}`},where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1})
   }
   const message={deliveryId:id,from:env.MAIL_FROM,to:[envelope.to],subject:envelope.subject,text:envelope.text}
   if(env.RER_DEMO!=='1')mutations.push({kind:'insert',table:outbox,row:{id:`notification:${id}`,created_at:now,message:JSON.stringify(message)}})
   return {commandId:createUlid(),appId:NOTIFICATION_APP,action:'notification.email.send',canonicalInputHash:await canonicalHash(message),permit,guards,mutations,audit:[],events:[],outbox:[],committedResult:{deliveryId:id,state:'delivered'}}
 }
 return{async scheduled(now=Date.now()){
  const due=await db.prepare("SELECT id FROM channel_deliveries WHERE state IN ('queued','held') AND run_id IS NULL AND due_at<=? ORDER BY due_at,id LIMIT 100").bind(now).all<{id:string}>()
  for(const item of due.results){
   if(!await db.prepare("SELECT 1 FROM channel_deliveries WHERE id=? AND state IN ('queued','held') AND run_id IS NULL AND due_at<=?").bind(item.id,now).first())continue
   const ctx=await authority.context(item.id);ctx.now=new Date(now).toISOString();ctx.principal.expiresAt=new Date(now+60000).toISOString()
   let plan:AdmissionPlan<{deliveryId:string;state:string}>
   try{plan=await prepare(ctx,item.id)}catch(error){
    if(!(error instanceof AdmissionError)||!['forbidden','unconfigured','validation'].includes(error.code))throw error
    // No send has occurred. Record this item's preparation failure, then keep draining due work.
    plan=await authority.prepareFailure(ctx,item.id)
   }
   // Database/admission failures still propagate; a failed commit is never reported as delivered.
   await admission.commit(ctx,plan)
  }
 }}
}
