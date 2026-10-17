import type { PolicyPort,RequestContext } from '../authority/ports'
import type { DescriptorRegistry } from '../records/descriptors.server'
import { resolveBackgroundContext } from '../authority/background.server'
import { automationEmailDue } from './email-timing.server'
import { AuthorityError } from '../authority/errors'
import { AdmissionError } from '../admission/errors'
import { and,identifier,trustedPredicate } from '../admission/sql.server'
import { createAutomationRunStore,runSnapshot,type AutomationRun } from './run-store.server'
import type { createAutomationEffects } from './effects.server'

export function createRecordAutomationRuntime(deps:{db:D1Database;appOrigin:string;policy:PolicyPort;
 descriptors:DescriptorRegistry;effects:ReturnType<typeof createAutomationEffects>;clock?:()=>Date}) {
 const store=createAutomationRunStore(deps.db)
 async function context(run:AutomationRun,ingress:'queue'|'schedule'):Promise<RequestContext> {
  if(!run.credential_id)throw new AuthorityError('grant_revoked','Automation approval is unavailable.')
  const ctx=await resolveBackgroundContext(deps.db,{credentialId:run.credential_id,principalId:run.principal_id,
   requestId:run.id,audience:`${deps.appOrigin}/api/v1`,ingress})
  return {...ctx,causeRunIds:[...JSON.parse(run.cause_run_ids_json),run.id]}
 }
 async function execute(run:AutomationRun,ingress:'queue'|'schedule') {
  const saved=runSnapshot(run)
  const actions=await store.actions(run.id)
  for(const step of actions) {
   const action=saved.definition.actions[step.position]
   if(!action)throw new Error('Stored automation action is unavailable')
   if(step.state==='Complete')continue
   if(step.state==='Failed'||step.state==='Unknown') {
    await store.finish(run.id,step.state,step.state==='Unknown'?'effect_unknown':'action_failed');return
   }
   if(step.state==='Running') {
    const recovered=await deps.effects.recover(run,step,action)
    if(!recovered)return
    await store.actionFinished(step.id,recovered.state,recovered.result,recovered.errorCode??null)
    if(recovered.state!=='Complete'){await store.finish(run.id,recovered.state,recovered.errorCode??null);return}
    continue
   }
   let claimed=false
   try {
    const ctx=await context(run,ingress),ref=saved.event.ref
    const scope=await deps.policy.scope(ctx,{appId:ref.appId,entityId:ref.entityId,
     purpose:['email','webhook','slack'].includes(action.kind)?'export':'read'})
    const descriptor=deps.descriptors.get(ref.appId,ref.entityId)
    const subject=trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(descriptor.table.tableId)}
     WHERE ${identifier(descriptor.idColumn)}=? AND (${scope.rowPredicate.sql}))`,[ref.recordId,...scope.rowPredicate.values])
    const guard=and(...scope.currentAuthorityGuards,subject,
     trustedPredicate('EXISTS(SELECT 1 FROM automations WHERE id=? AND enabled=1)',[run.automation_id]))
    const row=await deps.db.prepare(`SELECT ${identifier(descriptor.versionColumn)} AS version
     FROM ${identifier(descriptor.table.tableId)} WHERE ${identifier(descriptor.idColumn)}=? AND (${guard.sql})`)
     .bind(ref.recordId,...guard.values).first<{version:number}>()
    if(!row)throw new AuthorityError('forbidden','Triggering record is no longer available.')
    const authorize=async()=>{
     if(!await deps.db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())
      throw new AuthorityError('grant_revoked','Automation authority changed before dispatch.')
    }
    if(action.kind==='update'&&!scope.writableFieldIds.includes(action.fieldId))
     throw new AuthorityError('forbidden','Automation field is no longer writable.')
    if(action.kind==='email') {
     const now=(deps.clock?.()??new Date()).getTime(),due=await automationEmailDue(deps.db,now)
     if(due>now){await store.hold(step.id,due);return}
    }
    claimed=await store.claim(run,step,guard)
    if(!claimed)return
    const outcome=await deps.effects.execute(ctx,run,step,action,scope,subject,row.version,authorize)
    await store.actionFinished(step.id,outcome.state,outcome.result,outcome.errorCode??null)
    if(outcome.state!=='Complete'){await store.finish(run.id,outcome.state,outcome.errorCode??null);return}
   } catch(error) {
    const validation=error instanceof AdmissionError&&error.code==='validation'
    const code=error instanceof AuthorityError||validation?error.code:'automation_effect_failed'
    const uncertain=claimed&&!(error instanceof AuthorityError)&&['email','webhook','slack'].includes(action.kind)
    if(claimed)await store.actionFinished(step.id,uncertain?'Unknown':'Failed',validation?{message:error.message}:{},code)
    await store.finish(run.id,uncertain?'Unknown':error instanceof AuthorityError?'Cancelled':'Failed',code)
    return
   }
  }
  await store.finish(run.id,'Complete')
 }
 return {
  async tick(commandId?:string,ingress:'queue'|'schedule'='schedule') {
   await store.stage(commandId)
   for(const run of await store.pending())await execute(run,ingress)
  },
 }
}
