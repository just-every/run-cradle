import { z } from 'zod'
import type { CommandRegistry } from '../../core/registry/commands'
import { commandSchema } from '../../core/registry/validation'
import { controlInput } from '../../domains/operations/validators'
import type { OperationsRepository, OperationsProjectionDependencies } from '../../domains/operations/repository.server'
import type { Case, Wake } from '../../domains/operations/contracts'
import type { RequestContext } from '../../domains/authority/ports'
import type { CommandInput, AllowedAction } from '../../contracts/primitives'
import { AdmissionError } from '../../domains/admission/errors'
import { canonicalHash } from '../../domains/admission/canonical'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { createUlid } from '../../core/shared/ids'
import { REPAIRS_APP_ID, REPAIR_ENTITIES, repairRef } from './model'
import { createRepairOpenContext, type RepairOpenDependencies } from './context.server'
import { retainCaseEvidence } from './case-evidence.server'
const actions = ['case.pause', 'case.takeover', 'case.resume', 'case.cancel'] as const
export function createRepairCaseControls(d: RepairOpenDependencies, operations: OperationsRepository<OperationsProjectionDependencies>) {
  function unavailable(value: Case, action: typeof actions[number]) {
    if (['verified','cancelled','failed','abandoned'].includes(value.state)) return 'This work has reached a terminal state.'
    if (action === 'case.resume' && !['paused','taken_over','blocked','needs_decision'].includes(value.state)) return 'This work is not stopped.'
    return null
  }
  async function prepare(ctx: RequestContext, action: typeof actions[number], command: CommandInput<{caseId:string;caseVersion:number;reason:string}>) {
    if (ctx.principal.kind !== 'human') throw new AdmissionError('forbidden','A person must explicitly change repair control')
    const value=await operations.getCase(ctx,command.input.caseId)
    if(value.appId!==REPAIRS_APP_ID||value.subject.entityId!==REPAIR_ENTITIES.workOrders)throw new AdmissionError('not_found','Repair case not found')
    if(value.version!==command.input.caseVersion||value.controlEpoch!==command.controlEpoch)throw new AdmissionError('version_conflict','Refresh the current case version and control epoch')
    const reason=unavailable(value,action);if(reason)throw new AdmissionError('invalid_transition',reason)
    const context=createRepairOpenContext(d,ctx,command,action),work=await context.repo.load(ctx,'workOrders',value.subject.recordId)
    if(work.case_id!==value.id)throw new AdmissionError('invalid_transition','Repair and case ownership disagree')
    const guards=[operations.caseGuard(value),context.repo.version('workOrders',work),...context.guards]
    if(action==='case.resume'){
      const mandate=await operations.getMandate(ctx,value.mandateId)
      if(mandate.state!=='active'||mandate.version!==value.mandateVersion)throw new AdmissionError('version_conflict','Review the changed mandate before resuming')
      if(!await d.db.prepare("SELECT 1 FROM authority_principals WHERE id=? AND kind='human' AND state='active'").bind(value.accountableId).first())throw new AdmissionError('invalid_transition','A current accountable human is required before resuming')
      // Resume changes the epoch. Previously admitted effects remain fenced and must
      // be reconciled using their original keys; resumption grants no new authority.
      guards.push(trustedPredicate("EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND kind='human' AND state='active')",[value.accountableId]),operations.mandateGuard(mandate))
    }
    await retainCaseEvidence(context,value.sourceIds)
    const state:Case['state']=action==='case.resume'?'active':action==='case.takeover'?'taken_over':action==='case.cancel'?'cancelled':'paused'
    const next:Case={...value,allowedActions:[],version:value.version+1,updatedAt:ctx.now,controlEpoch:value.controlEpoch+1,state,stopReason:action==='case.resume'?null:command.input.reason,nextWakeAt:null,nextStep:action==='case.resume'?'Review the repair scope and current evidence before selecting the next action.':command.input.reason}
    const mutations=[operations.mutation('cases',value.appId,next,value.version)]
    const wakes=await d.db.prepare("SELECT data_json FROM operation_wakes WHERE case_id=? AND state IN ('queued','leased')").bind(value.id).all<{data_json:string}>()
    for(const row of wakes.results){const wake=JSON.parse(row.data_json) as Wake;mutations.push(operations.mutation('wakes',value.appId,{...wake,version:wake.version+1,updatedAt:ctx.now,state:'blocked',leaseOwner:null,leaseUntil:null,failure:'control_epoch_changed'},wake.version))}
    const plan=await operations.plan(ctx,command.commandId,action,value.appId,command,next,mutations,[...guards,...context.guards],undefined,[{ref:repairRef('workOrders',work.id),version:work.version}])
    plan.accessSubjects=context.accessSubjects
    plan.audit=[{action,subject:value.subject,changes:[],sourceIds:[...context.sources],personalContentRefs:[...context.sources]}]
    return plan
  }
  return { prepare,
    register(registry:CommandRegistry){for(const action of actions){const input=controlInput.required({caseVersion:true});registry.register({action,description:action.replace('.',' '),inputSchema:z.toJSONSchema(input) as never,input:commandSchema(input),visible:async ctx=>{try{await d.policy.scope(ctx,{appId:REPAIRS_APP_ID,entityId:REPAIR_ENTITIES.workOrders,purpose:'read'});return ctx.principal.kind==='human'}catch{return false}},replayIdentity:async(_ctx,command)=>({appId:REPAIRS_APP_ID,canonicalInputHash:await canonicalHash(command)}),prepare:(ctx,command)=>prepare(ctx,action,command)})}},
    async allowed(ctx:RequestContext,value:Case):Promise<AllowedAction[]>{return Promise.all(actions.map(async action=>{let reason=unavailable(value,action);if(ctx.principal.kind!=='human')reason='A person must change repair control';if(!reason)try{await d.policy.authorize(ctx,{appId:value.appId,action,targetEntityId:value.subject.entityId,expected:[{ref:value.subject,version:(await d.db.prepare('SELECT version FROM repair_work_orders WHERE id=?').bind(value.subject.recordId).first<{version:number}>())!.version}],cost:[],inputHash:await canonicalHash(value.id),commandId:createUlid()});if(action==='case.resume'){const m=await operations.getMandate(ctx,value.mandateId);if(m.version!==value.mandateVersion||m.state!=='active')reason='Review the changed mandate before resuming';}}catch{reason='Current authority does not permit this action'}return {action,enabled:reason===null,reason,requiredDecisionId:null}}))},
  }
}
