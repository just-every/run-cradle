import type { RequestContext } from '../../domains/authority/ports'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { AdmissionError } from '../../domains/admission/errors'
import { createUlid } from '../../core/shared/ids'
import { createRepairWorkContext, type RepairOpenDependencies } from './context.server'
import { eligible } from './eligibility.server'
import { retainCaseEvidence } from './case-evidence.server'
import { str } from './repository.server'
import { REPAIRS_APP_ID,REPAIR_ENTITIES,repairRef } from './model'
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
