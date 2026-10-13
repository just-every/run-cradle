import type {LegacyAutomationPorts} from './automation-runtime.server'
import type {PlatformBindings} from '../../core/platform/bindings'
import type {LaunchContext} from './domain.server'
import {emptyChange,ref,load} from './domain.server'
import {LAUNCH_APP_ID,launchEntities,decisionFields} from './contracts'
import {launchFieldIds} from './descriptors.server'
import {activityTable} from './storage.server'
import {prepareRecord} from './records.server'
import {legacyRecipientGuards} from '../../domains/channels/recipient.server'
import {createMailSender} from '../../../vendor/base/modules/mail/index.mjs'
import {localMailEnabled} from '../../core/platform/local-auth.server'
import {registerTable,and,trustedPredicate} from '../../domains/admission/sql.server'
import {canonicalHash} from '../../domains/admission/canonical'
import {createUlid} from '../../core/shared/ids'
import {ApiError} from '../../core/registry/errors'
import {z} from 'zod'
import type {Json} from '../../contracts/primitives'
const outbox=registerTable('rer_mail_development_outbox',['id','created_at','message'])
const message=z.object({campaignId:z.string().optional(),operatorId:z.string(),subject:z.string().min(1).max(200),text:z.string().min(1).max(10000)}).strict()
/** Prepared business effects and actual configured mail share each saved action key. */
export function createLaunchAutomationEffects(env:PlatformBindings,scoped:LegacyAutomationPorts['context']):LegacyAutomationPorts['external']{
 return async(ctx,input)=>{
  const context=await scoped(ctx,input.run),db=context.db,raw=input.input as Record<string,unknown>,campaignId=String(raw.campaignId??input.run.subjectIds[0]??''),campaign=await load(db,'campaign',campaignId)
  const permit=await context.policy.authorize(ctx,{appId:LAUNCH_APP_ID,action:'launch.campaign.patch',expected:[{ref:ref('campaign',campaignId),version:campaign.version}],fieldIds:Object.values(launchFieldIds.campaign),cost:[],inputHash:await canonicalHash(input.input),commandId:ctx.requestId}),guards=[...permit.guards,trustedPredicate('EXISTS(SELECT 1 FROM campaigns WHERE id=? AND version=? AND archived_at IS NULL)',[campaignId,campaign.version])]
  if(input.action==='create-decision'){
   const fields=decisionFields.parse({...raw,campaignId}),plan=await prepareRecord(context,ctx,{commandId:createUlid(),expected:[],input:{fields}},'decision','create')
   return{guards:[...guards,...plan.guards],mutations:[...plan.mutations],outbox:[...plan.outbox],state:'Complete',result:plan.committedResult}
  }
  if(input.action==='add-activity'){
   const text=z.string().min(1).max(10000).parse(raw.message)
   return{guards,mutations:[{kind:'insert',table:activityTable,row:{id:createUlid(),created_at:Date.parse(ctx.now),updated_at:Date.parse(ctx.now),version:1,campaign_id:campaignId,subject_id:campaignId,actor_id:null,automation_run_id:input.run.id,type:'automation.activity',field_name:null,previous_value:null,next_value:null,message:text}}],outbox:[],state:'Complete',result:{activity:true}}
  }
  if(input.action==='notify-operator'){
   const operatorId=z.string().parse(raw.operatorId),notification=await context.integration.notification!(ctx,{kind:'record-automation',operatorId,campaignId,subjectId:campaignId,eventId:input.idempotencyKey,runId:input.run.id,delivery:'in-app'})
   return{guards:[...guards,...notification.guards],mutations:[...notification.mutations],outbox:[],state:'Complete',result:{notificationId:notification.notificationId??null}}
  }
  if(input.action!=='send-email')throw new ApiError('unconfigured',`Automation action ${input.action} is not configured`)
  const mail=message.parse({...raw,campaignId}),recipient=await db.prepare('SELECT email FROM operators WHERE id=? AND active=1').bind(mail.operatorId).first<{email:string}>(),access=await legacyRecipientGuards(db,{kind:'record-automation',operatorId:mail.operatorId,campaignId,subjectId:campaignId,eventId:input.idempotencyKey},ctx.now)
  if(!recipient||!access)throw new ApiError('forbidden','Mail recipient no longer has campaign access')
  guards.push(...access,trustedPredicate('EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1 AND email=?)',[mail.operatorId,recipient.email]))
  if(!env.MAIL_PROVIDER||!env.MAIL_FROM||env.MAIL_PROVIDER==='development'&&!localMailEnabled(env)||env.MAIL_PROVIDER!=='development'&&!env.MAIL_PROVIDER_API_KEY)throw new ApiError('unconfigured','Configure the installation mail sender before using email actions')
  const envelope={deliveryId:input.idempotencyKey,from:env.MAIL_FROM,to:[recipient.email],subject:mail.subject,text:mail.text,html:undefined,headers:undefined}
  if(env.MAIL_PROVIDER==='development'){
   const old=await db.prepare('SELECT id FROM rer_mail_development_outbox WHERE id=?').bind(input.idempotencyKey).first()
   return{guards,mutations:old?[]:[{kind:'insert',table:outbox,row:{id:input.idempotencyKey,created_at:Date.parse(ctx.now),message:JSON.stringify(envelope)}}],outbox:[],state:'Complete',result:{deliveryId:input.idempotencyKey,status:'development'}}
  }
  const old=await db.prepare('SELECT state,result_json,attempts FROM launch_action_effects WHERE effect_key=?').bind(input.idempotencyKey).first<{state:string;result_json:string|null;attempts:number}>()
  if(old?.state==='Complete')return{guards,mutations:[],outbox:[],state:'Complete',result:JSON.parse(old.result_json!)}
  if(old?.state==='Unknown')return{guards,mutations:[],outbox:[],state:'Unknown',result:{deliveryId:input.idempotencyKey,status:'uncertain'}}
  if(old?.state==='Sending')throw new ApiError('version_conflict','Original mail delivery is already dispatching')
  const guard=and(...guards),now=Date.parse(ctx.now)
  const claim=old?await db.prepare(`UPDATE launch_action_effects SET state='Sending',attempts=attempts+1,updated_at=? WHERE effect_key=? AND state='Failed' AND attempts=? AND (${guard.sql})`).bind(now,input.idempotencyKey,old.attempts,...guard.values).run():await db.prepare(`INSERT INTO launch_action_effects(effect_key,run_id,state,attempts,updated_at) SELECT ?,?,'Sending',1,? WHERE (${guard.sql})`).bind(input.idempotencyKey,input.run.id,now,...guard.values).run()
  if(!claim.meta.changes)throw new ApiError('forbidden','Mail authority changed before dispatch')
  const result=await createMailSender({provider:env.MAIL_PROVIDER,mode:'production',apiKey:env.MAIL_PROVIDER_API_KEY}).send(envelope)
  const state=result.status==='accepted'?'Complete':result.status==='uncertain'?'Unknown':'Failed'
  await db.prepare('UPDATE launch_action_effects SET state=?,result_json=?,updated_at=? WHERE effect_key=?').bind(state,JSON.stringify(result),Date.parse(ctx.now),input.idempotencyKey).run()
  if(result.status==='rate_limited')throw new ApiError('rate_limited','Mail provider rate limited this delivery')
  if(state==='Failed')throw new ApiError('provider_refused',`Mail provider ${result.status}`)
  return{guards,mutations:[],outbox:[],state,result:result as unknown as Json}
 }
}
