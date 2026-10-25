import type {ServerFoundation} from '../../core/app/foundation.server'
import type {PlatformBindings} from '../../core/platform/bindings'
import {resolveBackgroundContext} from '../authority/background.server'
import type {RequestContext} from '../authority/ports'
import {NOTIFICATION_PRINCIPAL,NOTIFICATION_APP} from '../channels/mail-authority.server'
import {automationRecipient} from './recipients.server'
import {createChannelsIntegration} from '../channels/integration.server'
import {sendBuilderTestMail} from './test-mail.server'
import {delegationCommandId} from '../authority/user-delegation.server'
import {canonicalHash} from '../admission/canonical'
import {and,trustedPredicate} from '../admission/sql.server'
import {automationFailureCause,automationRunLink} from './failure-details'
import {runSnapshot,type AutomationRun} from './run-store.server'
import {AuthorityError} from '../authority/errors'
import {AdmissionError} from '../admission/errors'

/** Claim once before calling the installation sender. A lost acknowledgement is
 * never converted into another send, including after Worker restart. */
export function createAutomationFailureAlerts(env:PlatformBindings,foundation:ServerFoundation,origin:string,clock:()=>Date){
 const db=env.DB
 return {async tick(){
  // Owner-requested disable has no error code. Only product-fenced runs emit.
  const stopped=await db.prepare(`SELECT r.id,p.human_id AS operator_id FROM automation_runs r JOIN record_automation_bindings b ON b.automation_id=r.automation_id JOIN authority_principals p ON p.id=b.owner_id JOIN operators o ON o.id=p.human_id WHERE r.state='Cancelled' AND r.error_code IS NOT NULL AND p.state='active' AND o.active=1 AND NOT EXISTS(SELECT 1 FROM channel_events e WHERE e.event_id='automation-stop:'||r.id) ORDER BY r.finished_at,r.id LIMIT 100`).all<{id:string;operator_id:string}>()
  for(const run of stopped.results){
   const authority=await db.prepare('SELECT epoch FROM channel_mail_authority WHERE id=? AND active=1').bind(NOTIFICATION_PRINCIPAL).first<{epoch:number}>()
   if(!authority)throw new Error('Notification authority is unavailable')
   const now=clock().getTime(),ctx:RequestContext={principal:{id:NOTIFICATION_PRINCIPAL,kind:'system',humanId:null,sessionId:null,credentialId:null,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),authenticationEpoch:authority.epoch},requestId:run.id,now:new Date(now).toISOString(),ingress:'schedule'},eventId=`automation-stop:${run.id}`
   const notice=await createChannelsIntegration(db).notification(ctx,{kind:'outage',operatorId:run.operator_id,campaignId:null,subjectId:run.id,subjectType:'automation-stop',eventId})
   const guard=trustedPredicate("EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND state='Cancelled' AND error_code IS NOT NULL) AND EXISTS(SELECT 1 FROM channel_mail_authority WHERE id=? AND active=1 AND epoch=?)",[run.id,NOTIFICATION_PRINCIPAL,ctx.principal.authenticationEpoch])
   const action='automation.stop.notify'
   await foundation.admission.commit(ctx,{commandId:await delegationCommandId(run.id,'outage'),action,appId:NOTIFICATION_APP,canonicalInputHash:await canonicalHash({eventId}),permit:{actor:{id:ctx.principal.id,kind:ctx.principal.kind},action,appId:NOTIFICATION_APP,grantId:null,grantVersion:null,policyVersion:1,validUntil:ctx.principal.expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]},guards:notice.guards,mutations:notice.mutations,audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{runId:run.id}})
  }
  const settings=await db.prepare('SELECT timezone FROM workspace_settings ORDER BY id LIMIT 1').first<{timezone:string}>()
  if(!settings)throw new Error('Workspace timezone is required for failure alerts')
  let afterAt=-1,afterId='',sent=0
  while(sent<100){
  const rows=await db.prepare(`SELECT r.*,v.principal_id,v.credential_id,b.app_id,b.entity_id,p.human_id AS operator_id
   FROM automation_runs r JOIN record_automation_bindings b ON b.automation_id=r.automation_id
   JOIN authority_principals p ON p.id=b.owner_id
   JOIN record_automation_versions v ON v.automation_id=r.automation_id AND v.definition_version=r.definition_version
   WHERE r.state IN ('Failed','Unknown','Partial') AND (r.finished_at>? OR (r.finished_at=? AND r.id>?)) AND NOT EXISTS(SELECT 1 FROM command_admissions observed WHERE observed.command_id=r.id AND observed.action='automation.failure.observed') ORDER BY r.finished_at,r.id LIMIT 100`).bind(afterAt,afterAt,afterId).all<AutomationRun&{operator_id:string;error_code:string|null;finished_at:number}>()
  if(!rows.results.length)break
  for(const run of rows.results){
   const day=new Intl.DateTimeFormat('en-CA',{timeZone:settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(run.finished_at)
   const id=await delegationCommandId(run.automation_id,`failure:${run.operator_id}:${run.error_code}:${day}`)
   afterAt=run.finished_at;afterId=run.id
   if(sent>=100)break
   try{
    if(!run.credential_id)continue
    const current=await resolveBackgroundContext(db,{credentialId:run.credential_id,principalId:run.principal_id,requestId:id,audience:`${origin}/api/v1`,ingress:'schedule'})
    const ctx={...current,now:clock().toISOString()},ref=runSnapshot(run).event.ref
    const scope=await foundation.policy.scope(ctx,{appId:run.app_id,entityId:run.entity_id,purpose:'read'})
    const recipient=await automationRecipient(db,foundation.entities,ctx,{...ref,operatorId:run.operator_id})
    const title='Record automation failed',link=automationRunLink(run.app_id,run.automation_id,run.id)
    const body=`${automationFailureCause(run.error_code)} Open this run to review the failure.`
    const effects=await createChannelsIntegration(db,async()=>({guards:[recipient.guard],title,body})).notification(ctx,{kind:'record-automation',operatorId:run.operator_id,campaignId:null,subjectId:run.id,eventId:id,appId:run.app_id,subjectType:'automation-run',delivery:'in-app'})
    const guard=and(...scope.currentAuthorityGuards,recipient.guard,trustedPredicate("EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND state IN ('Failed','Unknown','Partial'))",[run.id]))
    const permit={actor:{id:ctx.principal.id,kind:ctx.principal.kind},action:'automation.failure.notify',appId:run.app_id,grantId:null,grantVersion:null,policyVersion:scope.policyVersion,validUntil:ctx.principal.expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]}
    async function observed(){await foundation.admission.commit(ctx,{commandId:run.id,action:'automation.failure.observed',appId:run.app_id,canonicalInputHash:await canonicalHash({runId:run.id}),permit:{...permit,action:'automation.failure.observed'},guards:[guard],mutations:[],audit:[],events:[],outbox:[],committedResult:{runId:run.id}})}
    if(await db.prepare("SELECT 1 FROM command_admissions WHERE command_id=? AND state='committed'").bind(id).first()){await observed();continue}
    const receipt=await foundation.admission.commit(ctx,{commandId:id,action:'automation.failure.notify',appId:run.app_id,canonicalInputHash:await canonicalHash({id}),permit:{actor:{id:ctx.principal.id,kind:ctx.principal.kind},action:'automation.failure.notify',appId:run.app_id,grantId:null,grantVersion:null,policyVersion:scope.policyVersion,validUntil:ctx.principal.expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]},guards:[guard,...effects.guards],mutations:effects.mutations,audit:[{action:'automation.failure.notify',subject:ref,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{runId:run.id}})
    if(receipt.result.state!=='committed')continue
    if(receipt.replay){await observed();continue}
    await sendBuilderTestMail(env,{id,email:recipient.email,subject:title,text:`${body} ${origin}${link}`},async()=>{
     if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new AuthorityError('forbidden','Failure alert authority changed before sending.')
    })
    sent++;await observed()
   }catch(error){
    if(!(error instanceof AuthorityError||error instanceof AdmissionError)||!['forbidden','grant_revoked','credential_expired','unconfigured','version_conflict'].includes(error.code))throw error
   }
  }
  if(rows.results.length<100)break
  }
 }}
}
