import { z } from 'zod'
import type { CommandRegistry } from '../../core/registry/commands'
import { commandSchema } from '../../core/registry/validation'
import type { RequestContext } from '../../domains/authority/ports'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { canonicalHash } from '../../domains/admission/canonical'
import { AdmissionError } from '../../domains/admission/errors'
import { createUlid } from '../../core/shared/ids'
import { createRepairWorkContext, type RepairOpenDependencies } from './context.server'
import { repairActionSchemas } from './contracts'
import { assignContractor } from './quotes.server'
import {noRepairExecution} from './manual-runtime.server'
import { eligible } from './eligibility.server'
import { retainCaseEvidence } from './case-evidence.server'
import { str } from './repository.server'
import { REPAIRS_APP_ID,REPAIR_ENTITIES,repairRef } from './model'
export function registerRepairContractorCommand(registry:CommandRegistry,d:RepairOpenDependencies){
 const input=repairActionSchemas['repair.assign-contractor']
 registry.register({action:'repair.assign-contractor',description:'Select a currently eligible contractor without contacting them',inputSchema:z.toJSONSchema(input) as never,input:commandSchema(input),visible:async ctx=>{try{await d.policy.scope(ctx,{appId:REPAIRS_APP_ID,entityId:REPAIR_ENTITIES.workOrders,purpose:'read'});return ctx.principal.kind==='human'}catch{return false}},replayIdentity:async(_ctx,command)=>({appId:REPAIRS_APP_ID,canonicalInputHash:await canonicalHash(command)}),prepare:async(ctx,command)=>{
  if(ctx.principal.kind!=='human')throw new AdmissionError('forbidden','A person must select the contractor')
  const c=createRepairWorkContext(d,ctx,command,'repair.assign-contractor'),work=await c.repo.expected(ctx,'workOrders',command.input.workOrder)
  if(!['triage','quotes','rework'].includes(work.lifecycle))throw new AdmissionError('invalid_transition','Review current commitments before changing the contractor')
  const current=await d.cases.get(ctx,str(work,'case_id'))
  const executionGuard=noRepairExecution(REPAIRS_APP_ID,current.id,work.id)
  if(!await d.db.prepare(`SELECT 1 WHERE ${executionGuard.sql}`).bind(...executionGuard.values).first())throw new AdmissionError('unconfigured','Retained provider runs need full runtime reconciliation before contractor changes')
  c.guards.push(executionGuard)
  await retainCaseEvidence(c,[...(current.sourceIds??[]) as string[],...command.input.eligibilityEvidence.map(link=>link.sourceId)])
  return assignContractor(c,command.input)
 }})
}
export function createRepairContractorRead(d:RepairOpenDependencies){return async(ctx:RequestContext,id:string)=>{
 const c=createRepairWorkContext(d,ctx,{commandId:createUlid(),input:{},expected:[]},'repair.read'),work=await c.repo.load(ctx,'workOrders',id),current=await d.cases.get(ctx,str(work,'case_id'))
 const contractors=await c.repo.list(ctx,'contractors',trustedPredicate('active=1')),items=[]
 for(const contractor of contractors){try{
  const credentials=await eligible(c,work,contractor)
  const evidence=credentials.map(row=>({sourceId:str(row,'source_id'),sourceVersion:Number(row.source_version),locator:{kind:'field' as const,path:'credential'},observedAt:ctx.now}))
  items.push({contractor:{ref:repairRef('contractors',contractor.id),version:contractor.version},name:str(contractor,'name'),evidence})
 }catch(error){if(!(error instanceof Error)||!('code'in error)||!['invalid_transition','forbidden','not_found','stale_evidence'].includes(String(error.code)))throw error}}
 return {workOrder:{ref:repairRef('workOrders',work.id),version:work.version},controlEpoch:current.controlEpoch,caseState:current.state,items}
}}
export type ContractorReview=Awaited<ReturnType<ReturnType<typeof createRepairContractorRead>>>
