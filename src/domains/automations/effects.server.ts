import {smsDispatch} from '../sms/dispatch.server'
import type {createRecordReader} from '../records/query.server'
import type {DescriptorRegistry} from '../records/descriptors.server'
import type { RequestContext,AuthorityPermit,PolicyScope,PolicyPort } from '../authority/ports'
import type { AdmissionPort,SqlPredicate } from '../admission/ports'
import type { CommandRegistry } from '../../core/registry/commands'
import type { EntityRegistry } from '../authority/scope.server'
import type { PlatformBindings } from '../../core/platform/bindings'
import { createChannelsIntegration } from '../channels/integration.server'
import { automationRecipient } from './recipients.server'
import { canonicalHash } from '../admission/canonical'
import { AuthorityError } from '../authority/errors'
import { createMailSender, MailValidationError } from '../../../vendor/base/modules/mail/index.mjs'
import {hostedMailConfigured,hostedMailConfig} from '../../core/platform/hosted-mail.server'
import { localMailEnabled } from '../../core/platform/local-auth.server'
import { IntegrationsRepository } from '../../../vendor/base/modules/integrations/core/repository.ts'
import { D1SqlDatabase } from '../../../vendor/base/modules/integrations/core/database.ts'
import { renderSlackEvent,serializeSlackMessage } from '../../../vendor/base/modules/integrations/slack/message.ts'
import type { createAutomationDestinations } from './destinations.server'
import type { AutomationRun,AutomationActionRun } from './run-store.server'
import { runSnapshot } from './run-store.server'
import type { RecordAutomationAction } from './contracts'

type Outcome={state:'Complete'|'Failed'|'Unknown';result:unknown;errorCode?:string}
export function createAutomationEffects(deps:{env:PlatformBindings;entities:EntityRegistry;admission:AdmissionPort;
 policy:PolicyPort;appOrigin:string;reader:ReturnType<typeof createRecordReader>;descriptors:DescriptorRegistry;commands:CommandRegistry;destinations:ReturnType<typeof createAutomationDestinations>}) {
 const db=deps.env.DB
 return {
  async execute(ctx:RequestContext,run:AutomationRun,step:AutomationActionRun,action:RecordAutomationAction,
   scope:PolicyScope,subjectGuard:SqlPredicate,recordVersion:number,authorize:()=>Promise<void>):Promise<Outcome> {
   const saved=runSnapshot(run),ref=saved.event.ref,commandId=step.idempotency_key
   if(action.kind==='update') {
    const command=deps.commands.get('record.patch')
    if(!command)throw new AuthorityError('unconfigured','Record patch is unavailable.',503)
    const receipt=await command.execute(ctx,{commandId,expected:[{ref,version:recordVersion}],input:{ref,changes:{[action.fieldId]:action.value}}})
    return receipt.result.state==='committed'?{state:'Complete',result:{commandId,recordVersion:recordVersion+1}}:
     {state:'Unknown',result:{commandId},errorCode:'admission_unknown'}
   }
   if(action.kind==='notify') {
    const recipient=await automationRecipient(db,deps.entities,ctx,{...ref,operatorId:action.operatorId})
    const integration=createChannelsIntegration(db,async()=>({guards:[recipient.guard],title:action.title,body:'Open the record to review this automation.'}))
    const effects=await integration.notification(ctx,{kind:'record-automation',operatorId:action.operatorId,
     campaignId:null,subjectId:ref.recordId,eventId:step.id,appId:ref.appId,subjectType:ref.entityId,
     runId:run.id,delivery:'in-app'})
    const guards=[...scope.currentAuthorityGuards,subjectGuard,...effects.guards]
    // The saved user approval permits this finite notification effect, bounded by
    // current delegation, subject and recipient authority in the atomic admission.
    const permit:AuthorityPermit={actor:{id:ctx.principal.id,kind:ctx.principal.kind},action:'automation.notify',
     appId:ref.appId,grantId:null,grantVersion:null,policyVersion:scope.policyVersion,validUntil:ctx.principal.expiresAt,
     guards,reservationMutations:[],reservationIds:[]}
    const receipt=await deps.admission.commit(ctx,{commandId,action:'automation.notify',appId:ref.appId,
     canonicalInputHash:await canonicalHash({runId:run.id,position:step.position,action}),permit,guards,
     mutations:effects.mutations,audit:[{action:'automation.notify',subject:ref,changes:[],sourceIds:[],personalContentRefs:[]}],
     events:[],outbox:[],committedResult:{notificationId:effects.notificationId??null}})
    return {state:receipt.result.state==='committed'?'Complete':'Unknown',result:{commandId},
     ...(receipt.result.state==='committed'?{}:{errorCode:'admission_unknown'})}
   }
   if(action.kind==='sms')return smsDispatch(deps.env,deps.appOrigin,deps.reader,deps.descriptors,deps.policy)(ctx,run,step,action,scope,authorize)
   if(action.kind==='email') {
    const recipient=await automationRecipient(db,deps.entities,ctx,{...ref,operatorId:action.operatorId})
    const env=deps.env,local=env.RER_DEMO==='1'||localMailEnabled(env)
    if(!(env.MAIL_PROVIDER==='development'&&local&&env.MAIL_FROM)&&!hostedMailConfigured(env))
     throw new AuthorityError('unconfigured','Configure the installation mail sender before using email actions.',503)
    try {
     const mail=env.MAIL_PROVIDER==='development'?createMailSender({provider:'development',mode:'development'}):createMailSender(hostedMailConfig(env)!)
     await authorize()
     if(!await db.prepare(`SELECT 1 WHERE ${recipient.guard.sql}`).bind(...recipient.guard.values).first())
      throw new AuthorityError('forbidden','Recipient authority changed before dispatch.')
     const result=await mail.send({deliveryId:step.id,from:env.MAIL_FROM!,to:[recipient.email],subject:action.subject,
      text:action.text})
     return {state:['accepted','development'].includes(result.status)?'Complete':result.status==='uncertain'?'Unknown':'Failed',
      result:{deliveryId:step.id,status:result.status,provider:result.provider,providerMessageId:result.providerMessageId,
       ...(result.code?{code:result.code}:{})},...(['accepted','development'].includes(result.status)?{}:{errorCode:'mail_'+result.status})}
    } catch(error) {
     // Base validates before dispatch. A malformed envelope is a known failure,
     // not evidence that a provider might have accepted an effect.
     if(error instanceof MailValidationError)return {state:'Failed',result:{deliveryId:step.id},errorCode:'mail_'+error.code}
     throw error
    }
   }
   const delivery=deps.destinations.delivery(ref.appId,authorize)
   await authorize()
   const body=action.kind==='slack'?serializeSlackMessage(renderSlackEvent('record.changed',action.text,
    {'record.changed':text=>({summary:text,sections:[text]})})):JSON.stringify({event:saved.event.event,
     record:ref,version:saved.event.version,deliveryId:step.id})
   if(!await delivery.get(step.id))await delivery.enqueue({id:step.id,tenant:ref.appId,destinationId:action.destinationId,
    event:'record.'+saved.event.event,protocol:action.kind==='slack'?'slack.incoming-webhook.v1':'webhook',
    body},{maxAttempts:1,retryDelaysMs:[]})
   const result=await delivery.dispatch(step.id)
   const attempts=await delivery.log(step.id),safe=attempts.at(-1)?.outcome?.kind==='retryable'
   return result?.state==='accepted'?{state:'Complete',result:{deliveryId:step.id,status:result.state}}:
    result?.state==='rejected'?{state:'Failed',result:{deliveryId:step.id,status:result.state},errorCode:safe?'delivery_retryable':'delivery_rejected'}:
    {state:'Unknown',result:{deliveryId:step.id,status:result?.state??'unknown'},errorCode:'delivery_unknown'}
  },
  async recover(run:AutomationRun,step:AutomationActionRun,action:RecordAutomationAction):Promise<Outcome|null> {
   if(!step.started_at||Date.now()-step.started_at<60000)return null
   if(action.kind==='update'||action.kind==='notify') {
    const receipt=await db.prepare("SELECT 1 FROM command_admissions WHERE command_id=? AND state='committed'").bind(step.idempotency_key).first()
    return receipt?{state:'Complete',result:{commandId:step.idempotency_key,reconciled:true}}:
     {state:'Failed',result:{commandId:step.idempotency_key},errorCode:'interrupted_before_commit'}
   }
   if(action.kind==='sms'){
    const receipt=await db.prepare('SELECT status,provider_sid FROM sms_messages WHERE id=?').bind(step.id).first<{status:string;provider_sid:string|null}>()
    return receipt&&receipt.status!=='unknown'?{state:receipt.status==='failed'?'Failed':'Complete',result:{deliveryId:step.id,smsStatus:receipt.status,providerMessageId:receipt.provider_sid}}:{state:'Unknown',result:{deliveryId:step.id},errorCode:'sms_acknowledgement_unknown'}
   }
   if(action.kind==='email') {
    if(localMailEnabled(deps.env)&&deps.env.MAIL_PROVIDER==='development') {
     const receipt=await db.prepare("SELECT 1 FROM rer_mail_development_outbox WHERE json_extract(message,'$.deliveryId')=?").bind(step.id).first()
     if(receipt)return {state:'Complete',result:{deliveryId:step.id,reconciled:true}}
    }
    return {state:'Unknown',result:{deliveryId:step.id},errorCode:'mail_acknowledgement_unknown'}
   }
   const repository=new IntegrationsRepository(new D1SqlDatabase(db),run.app_id)
   await repository.recoverExpired(Date.now())
   const delivery=await repository.get(step.id)
   if(delivery?.state==='sending')return null
   return delivery?.state==='accepted'?{state:'Complete',result:{deliveryId:step.id,reconciled:true}}:
    delivery?.state==='rejected'?{state:'Failed',result:{deliveryId:step.id},errorCode:'delivery_rejected'}:
    {state:'Unknown',result:{deliveryId:step.id},errorCode:'delivery_acknowledgement_unknown'}
  },
 }
}
