import type { RequestContext } from '../../domains/authority/ports'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { AdmissionError } from '../../domains/admission/errors'
import { createUlid } from '../../core/shared/ids'
import { createRepairWorkContext, revision, type RepairOpenDependencies } from './context.server'
import { quoteDTO } from './quotes.server'
import { eligible } from './eligibility.server'
import { retainCaseEvidence } from './case-evidence.server'
import { str } from './repository.server'
import { REPAIRS_APP_ID, REPAIR_ENTITIES, repairRef } from './model'

export function createRepairQuoteRead(d:RepairOpenDependencies){return async(ctx:RequestContext,id:string)=>{
 const c=createRepairWorkContext(d,ctx,{commandId:createUlid(),input:{},expected:[]},'repair.read'),work=await c.repo.load(ctx,'workOrders',id),current=await d.cases.get(ctx,str(work,'case_id'))
 await retainCaseEvidence(c,(current.sourceIds??[]) as string[])
 const store=await c.repo.load(ctx,'stores',str(work,'store_id'))
 const contractor=work.contractor_id?await c.repo.load(ctx,'contractors',str(work,'contractor_id')):null
 let eligibilityCurrent=false
 if(contractor){try{await eligible(c,work,contractor);eligibilityCurrent=true}catch(error){if(!(error instanceof AdmissionError)||!['invalid_transition','stale_evidence'].includes(error.code))throw error}}

 const rows=await c.repo.list(ctx,'quotes',trustedPredicate('work_order_id=?',[id])),items=[]
 for(const row of rows){
  const quote=quoteDTO(row),issues:string[]=[]
  if(quote.scopeHash!==work.scope_hash)issues.push('Work or scope changed since this quote was recorded.')
  if(!contractor||quote.contractor.ref.recordId!==contractor.id||quote.contractor.version!==contractor.version||row.payee_id!==contractor.payee_id)issues.push('Contractor or payee changed since this quote was recorded.')
  if(!eligibilityCurrent)issues.push('Current licence and insurance eligibility requires review.')
  if(quote.expiresAt<=ctx.now)issues.push('Quote expired.')
  if(quote.state!=='received')issues.push('This retained quote is not an unselected current offer.')
  if(quote.total.currency!=='AUD'||quote.total.scale!==2||!quote.taxIncluded)issues.push('A tax-inclusive AUD total at cent precision is required for a comparable review.')
  // Check actual source custody as well as the retained version. Authorization failures are never softened into a review warning.
  await retainCaseEvidence(c,quote.evidence.map(link=>link.sourceId))
  try{await c.evidence(quote.evidence)}catch(error){if(!(error instanceof AdmissionError)||error.code!=='stale_evidence')throw error;issues.push('Supporting source version changed; review the conflicting evidence.')}
  items.push({quote,issues,approvalRequired:quote.total.currency==='AUD'&&quote.total.scale===2&&BigInt(quote.total.minor)>200000n})
 }
 return {workOrder:revision('workOrders',work),scopeHash:str(work,'scope_hash'),store:repairRef('stores',store.id),contractor:contractor?revision('contractors',contractor):null,contractorName:contractor?str(contractor,'name'):null,controlEpoch:current.controlEpoch,canCapture:eligibilityCurrent&&['quotes','rework'].includes(work.lifecycle)&&['active','waiting','blocked'].includes(current.state),items}
}}
export type QuoteReview=Awaited<ReturnType<ReturnType<typeof createRepairQuoteRead>>>
