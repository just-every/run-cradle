import type { RequestContext } from '../../domains/authority/ports'
import { trustedPredicate } from '../../domains/admission/sql.server'
import type { RepairDependencies } from './ports'
import { createRepairRepository, str, json } from './repository.server'
import { revision } from './context.server'
import { REPAIRS_APP_ID } from './model'
import type { EvidenceLink } from '../../domains/evidence/contracts'
/** Current, policy-scoped operation inputs and durable external identities for the detail screen. */
export function createRepairOperationRead(d:RepairDependencies){const repo=createRepairRepository(d)
 return async(ctx:RequestContext,id:string)=>{
  const work=await repo.load(ctx,'workOrders',id),store=await repo.load(ctx,'stores',str(work,'store_id')),current=await d.cases.get(ctx,str(work,'case_id'))
  const visits=await repo.list(ctx,'visits',trustedPredicate('work_order_id=?',[id])),invoices=await repo.list(ctx,'invoices',trustedPredicate('work_order_id=?',[id])),handoffs=await repo.list(ctx,'handoffs',trustedPredicate('work_order_id=?',[id]))
  const connections=await d.db.prepare('SELECT id,version,adapter_id,name,state FROM provider_connections WHERE app_id=? ORDER BY name,id').bind(REPAIRS_APP_ID).all<{id:string;version:number;adapter_id:string;name:string;state:string}>()
  const visible: typeof connections.results=[]
  for(const connection of connections.results){try{await d.policy.authorize(ctx,{appId:REPAIRS_APP_ID,action:'connection.read',expected:[],cost:[],connectionId:connection.id,inputHash:''});visible.push(connection)}catch(error){if(!(error instanceof Error)||!('code'in error)||!['forbidden','not_found','grant_revoked'].includes(String(error.code)))throw error}}
  const effects=[]
  for(const [kind,rows] of [['visit',visits],['handoff',handoffs]] as const)for(const row of rows){
   const cancellation=kind==='visit'?(await repo.list(ctx,'cancellations',trustedPredicate('visit_id=?',[row.id])))[0]:null
   const cancellationResult=cancellation?await d.execution.read(ctx,str(cancellation,'attempt_id')):null
   const failedCancellation=cancellationResult?.attempt.state==='refused'?cancellationResult.attempt:null
   const observed=cancellationResult&&!failedCancellation?cancellationResult:await d.execution.read(ctx,str(row,'attempt_id'))
   effects.push({kind,record:revision(kind==='visit'?'visits':'handoffs',row),state:row.lifecycle,cancellation:!!cancellation&&!failedCancellation,failedCancellation,attempt:observed.attempt,receiptId:observed.receiptId,externalId:observed.externalId,contractorAccepted:observed.contractorAccepted})
  }
  const selected=work.quote_id?await repo.load(ctx,'quotes',str(work,'quote_id')):null
  const agreements=selected?await repo.list(ctx,'agreements',trustedPredicate('quote_id=? AND quote_version=?',[selected.id,String(selected.version)])):[]
  const mappingRows=await d.db.prepare('SELECT connection_id,version,mapping_json FROM repair_accounting_mappings WHERE connection_id IN (SELECT id FROM provider_connections WHERE app_id=?)').bind(REPAIRS_APP_ID).all<{connection_id:string;version:number;mapping_json:string}>()
  return {workOrder:revision('workOrders',work),store:revision('stores',store),scopeHash:str(work,'scope_hash'),controlEpoch:current.controlEpoch,caseState:current.state,acceptanceId:work.acceptance_id as string|null,selectedQuote:selected?{id:selected.id,version:selected.version,approvalId:selected.approval_id as string|null,payeeId:str(selected,'payee_id'),evidence:json<EvidenceLink[]>(selected,'evidence')}:null,agreementIds:agreements.map(r=>r.id),connections:visible,effects,invoices:invoices.map(r=>({id:r.id,version:r.version,sourceId:str(r,'source_id'),number:str(r,'invoice_number'),payeeId:str(r,'payee_id'),total:{minor:str(r,'minor'),currency:str(r,'currency'),scale:Number(r.scale)}})),mappings:mappingRows.results.filter(r=>visible.some(c=>c.id===r.connection_id)).map(r=>({connectionId:r.connection_id,version:r.version,...JSON.parse(r.mapping_json) as {contacts:Record<string,string>;allowedAccountCodes:string[];allowedTaxTypes:string[]}}))}
 }
}
export type RepairOperations=Awaited<ReturnType<ReturnType<typeof createRepairOperationRead>>>
