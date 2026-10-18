import type { CommandInput } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { AdmissionError } from '../../domains/admission/errors'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { createUlid } from '../../core/shared/ids'
import { actionTable,runTable } from './automations.server'
import { emptyChange,plan,fail,type LaunchContext } from './domain.server'
import { currentLaunchVersion } from './version-dependencies.server'

type Row=Record<string,string|number|null>
/** A retry copies unfinished work; the original run and completed receipts stay immutable. */
export async function prepareAutomationRetry(context:LaunchContext,ctx:RequestContext,input:CommandInput<Record<string,unknown>>) {
 if(!context.releaseId)fail('Automation retry requires the mounted source release')
 const run=await context.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(String(input.input.runId)).first<Row>()
 if(!run)throw new AdmissionError('not_found','Run was not found')
 if(input.input.version!==Number(run.version))throw new AdmissionError('version_conflict',`Automation run has current version ${run.version}`,Number(run.version))
 if(run.state!=='Failed')fail('Only a Failed run can be retried')
 const set=emptyChange(),id=createUlid(),now=Date.parse(ctx.now)
 set.guards.push(trustedPredicate("EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND version=? AND state='Failed')",[String(run.id),Number(run.version)]))
 set.mutations.push({kind:'insert',table:runTable,row:{...run,id,created_at:now,updated_at:now,version:1,state:'Queued',queued_at:now,started_at:null,finished_at:null,error_code:null,error_message:null,retry_of:String(run.id),initiated_by_id:ctx.principal.humanId}})
 const actions=await context.db.prepare('SELECT * FROM launch_automation_actions WHERE run_id=? ORDER BY position').bind(String(run.id)).all<Row>()
 for(const action of actions.results)set.mutations.push({kind:'insert',table:actionTable,row:{...action,id:createUlid(),run_id:id,...action.state==='Complete'?{}:{state:'Pending',started_at:null,finished_at:null,error_code:null,error_message:null}}})
 const prepared=await plan(context,ctx,input,'launch.automation.retry',set,{runId:id,retryOf:String(run.id),state:'Queued'},'automation')
 return {...prepared,versionDependencies:[...prepared.versionDependencies??[],{label:'Automation run',version:Number(run.version),async current(){
  if(await currentLaunchVersion(context,ctx,'automation',String(run.automation_id))===null)return null
  return (await context.db.prepare('SELECT version FROM automation_runs WHERE id=?').bind(String(run.id)).first<{version:number}>())?.version??null
 }}],outbox:[{action:'launch.automation.execute',version:1,input:{runId:id},notBefore:ctx.now,grantId:prepared.permit.grantId,subject:null,sourceReleaseId:context.releaseId!,causeRunIds:[...JSON.parse(String(run.cause_run_ids_json)),id]}]}
}
