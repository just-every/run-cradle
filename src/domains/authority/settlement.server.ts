import { trustedPredicate } from '../admission/sql.server'
import type { SqlPredicate, SqlMutation } from '../admission/ports'
import { settleReservation, reconcileReleasedReservation, type BudgetReconciliation } from './budget.server'
import type { RequestContext } from './ports'
export type ReleasedReadback={receiptId:string;previousReceiptId:string;releaseReceiptId:string}
export type ReadbackBudgetReconciliation=BudgetReconciliation&ReleasedReadback
/** Unknown/partial outcomes retain the full reservation. Confirmed metering is supplied by the adapter's validated receipt. */
export const prepareSettlement=async(db:D1Database,ctx:RequestContext,reservationIds:readonly string[],outcome:{state:'confirmed'|'refused'|'partial'|'unknown';actualByUnit?:ReadonlyMap<string,string>;definitiveNonEffect?:boolean;releasedReadback?:ReleasedReadback})=>{
 const guards:SqlPredicate[]=[],mutations:SqlMutation[]=[],reconciliations:ReadbackBudgetReconciliation[]=[]
 if(outcome.state==='unknown'||outcome.state==='partial'||outcome.state==='refused'&&!outcome.definitiveNonEffect)return {guards,mutations,reconciliations}
 for(const id of reservationIds){
  const row=await db.prepare('SELECT unit,amount,state FROM authority_reservations WHERE id=?').bind(id).first<{unit:string;amount:string;state:string}>();if(!row)throw new Error('Reservation is missing.')
  const actual=outcome.state==='refused'?'0':outcome.actualByUnit?.get(row.unit);if(actual===undefined)continue
  const plan:{guards:SqlPredicate[];mutations:SqlMutation[];reconciliation?:BudgetReconciliation|null}=row.state==='released'&&outcome.releasedReadback?await reconcileReleasedReservation(db,id,actual,Date.parse(ctx.now)):await settleReservation(db,id,actual,Date.parse(ctx.now))
  if(plan.reconciliation)reconciliations.push({...plan.reconciliation,...outcome.releasedReadback!})
  guards.push(...plan.guards);mutations.push(...plan.mutations)
 }
 return {guards,mutations,reconciliations}
}
export const prepareBoundSettlement=async(db:D1Database,ctx:RequestContext,binding:{originCommandId:string;attemptId:string;reservationIds:readonly string[];inputHash:string},outcome:Parameters<typeof prepareSettlement>[3])=>{
 const ownership:SqlPredicate[]=[]
 if(new Set(binding.reservationIds).size!==binding.reservationIds.length)throw new Error('Duplicate reservation identity.')
 for(const id of binding.reservationIds){const guard=trustedPredicate('EXISTS(SELECT 1 FROM authority_reservations WHERE id=? AND command_id=? AND attempt_id=? AND input_hash=?)',[id,binding.originCommandId,binding.attemptId,binding.inputHash]);if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new Error('Settlement does not own the prepared reservation.');ownership.push(guard)}
 const result=await prepareSettlement(db,ctx,binding.reservationIds,outcome)
 return {...result,guards:[...ownership,...result.guards]}
}
