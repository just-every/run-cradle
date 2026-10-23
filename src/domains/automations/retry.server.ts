import type {ServerFoundation} from '../../core/app/foundation.server'
import type {RequestContext} from '../authority/ports'
import {ownerDelegationSnapshot} from '../authority/delegation.server'
import {canonicalHash} from '../admission/canonical'
import {and,registerTable,trustedPredicate} from '../admission/sql.server'
import {AuthorityError} from '../authority/errors'
import {safeAutomationRetry} from './failure-details'
import {actionTable,runTable} from './storage.server'
const deliveries=registerTable('integration_deliveries',['namespace','id','state','next_at','max_attempts'])
export function createAutomationRetry(db:D1Database,foundation:ServerFoundation){return async(ctx:RequestContext,input:{id:string;runId:string;commandId:string})=>{
 const run=await db.prepare(`SELECT r.*,b.app_id,b.entity_id,b.owner_id FROM automation_runs r JOIN record_automation_bindings b ON b.automation_id=r.automation_id WHERE r.id=? AND r.automation_id=?`).bind(input.runId,input.id).first<{state:string;error_code:string|null;app_id:string;entity_id:string;owner_id:string;version:number}>()
 if(!run||run.owner_id!==ctx.principal.id)throw new AuthorityError('not_found','Run is unavailable.',404)
 const own=await ownerDelegationSnapshot(db,ctx,run.app_id),scope=await foundation.policy.scope(ctx,{appId:run.app_id,entityId:run.entity_id,purpose:'read'})
 const hash=await canonicalHash(input),prior=await foundation.admission.replay(ctx,input.commandId,'automation.retry',run.app_id,hash);if(prior)return prior
 if(!safeAutomationRetry(run.state,run.error_code))throw new AuthorityError('forbidden','This outcome cannot safely be retried.')
 const steps=await db.prepare("SELECT id,error_code FROM launch_automation_actions WHERE run_id=? AND state='Failed'").bind(input.runId).all<{id:string;error_code:string|null}>()
 if(steps.results.length!==1||steps.results[0].error_code!==run.error_code)throw new AuthorityError('forbidden','A retry requires one known safe failed action.')
 const step=steps.results[0],guard=and(own.guard,...scope.currentAuthorityGuards,trustedPredicate("EXISTS(SELECT 1 FROM automations WHERE id=? AND enabled=1) AND EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND version=? AND state='Failed' AND error_code=?) AND NOT EXISTS(SELECT 1 FROM launch_automation_actions WHERE run_id=? AND state IN ('Unknown','Running'))",[input.id,input.runId,run.version,run.error_code,input.runId]))
 const mutations:import('../admission/ports').SqlMutation[]=[]
 if(run.error_code==='delivery_retryable'){
  const delivery=await db.prepare("SELECT attempts FROM integration_deliveries WHERE namespace=? AND id=? AND state='rejected' AND EXISTS(SELECT 1 FROM integration_attempts a WHERE a.namespace=integration_deliveries.namespace AND a.delivery_id=integration_deliveries.id AND a.number=integration_deliveries.attempts AND json_extract(a.outcome,'$.kind')='retryable')").bind(run.app_id,step.id).first<{attempts:number}>()
  if(!delivery||delivery.attempts>=6)throw new AuthorityError('forbidden','No safe delivery attempt remains.')
  mutations.push({kind:'update',table:deliveries,set:{state:'queued',max_attempts:delivery.attempts+1,next_at:Date.parse(ctx.now)},where:trustedPredicate("namespace=? AND id=? AND state='rejected' AND attempts=?",[run.app_id,step.id,delivery.attempts]),expectedRows:1})
 }
 mutations.push({kind:'update',table:actionTable,set:{state:'Pending',error_code:null,started_at:null,finished_at:null,result_json:null},where:trustedPredicate("id=? AND state='Failed' AND error_code=?",[step.id,run.error_code]),expectedRows:1},{kind:'update',table:runTable,set:{state:'Queued',error_code:null,finished_at:null,version:run.version+1,updated_at:Date.parse(ctx.now)},where:trustedPredicate('id=? AND version=?',[input.runId,run.version]),expectedRows:1})
 return foundation.admission.commit(ctx,{commandId:input.commandId,action:'automation.retry',appId:run.app_id,canonicalInputHash:hash,permit:{actor:{id:ctx.principal.id,kind:'human'},action:'automation.retry',appId:run.app_id,grantId:null,grantVersion:null,policyVersion:scope.policyVersion,validUntil:ctx.principal.expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]},guards:[guard],mutations,audit:[{action:'automation.retry',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{runId:input.runId}})
}}
