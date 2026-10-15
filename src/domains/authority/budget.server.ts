import type { SqlMutation, SqlPredicate } from '../admission/ports'
import { registerTable, trustedPredicate } from '../admission/sql.server'
import { AuthorityError } from './errors'
const budgets=registerTable('authority_budgets',['grant_id','unit','ceiling','consumed','reserved','version'])
const reservations=registerTable('authority_reservations',['id','grant_id','grant_version','command_id','unit','amount','state','created_at','updated_at','app_id','action','owner_principal_id','attempt_id','input_hash','binding_hash'])
export const canonicalInteger=(value:string)=>{if(!/^(0|[1-9][0-9]{0,77})$/.test(value))throw new AuthorityError('validation','Amount must be a nonnegative canonical integer.',400);return BigInt(value)}
export const reserveBudgets=async(db:D1Database,input:{grantId:string;grantVersion:number;commandId:string;now:number;amounts:ReadonlyMap<string,string>;binding?:{appId:string;action:string;principalId:string;attemptId:string;inputHash:string;hash:string}})=>{
  const guards:SqlPredicate[]=[],mutations:SqlMutation[]=[],ids:string[]=[]
  for(const[unit,amount]of input.amounts){
    const amountN=canonicalInteger(amount);if(amountN===0n)continue
    const row=await db.prepare('SELECT ceiling,consumed,reserved,version FROM authority_budgets WHERE grant_id=? AND unit=?').bind(input.grantId,unit).first<{ceiling:string;consumed:string;reserved:string;version:number}>()
    if(!row||canonicalInteger(row.consumed)+canonicalInteger(row.reserved)+amountN>canonicalInteger(row.ceiling))throw new AuthorityError('budget_exhausted','The action exceeds its remaining authority budget.',409)
    const where=trustedPredicate('grant_id=? AND unit=? AND version=? AND ceiling=? AND consumed=? AND reserved=?',[input.grantId,unit,row.version,row.ceiling,row.consumed,row.reserved])
    guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM authority_budgets WHERE ${where.sql})`,where.values))
    const id=`${input.commandId}:${input.grantId}:${unit}`;ids.push(id)
    mutations.push({kind:'update',table:budgets,set:{reserved:(canonicalInteger(row.reserved)+amountN).toString(),version:row.version+1},where,expectedRows:1},{kind:'insert',table:reservations,row:{id,grant_id:input.grantId,grant_version:input.grantVersion,command_id:input.commandId,unit,amount,state:'reserved',created_at:input.now,updated_at:input.now,...(input.binding?{app_id:input.binding.appId,action:input.binding.action,owner_principal_id:input.binding.principalId,attempt_id:input.binding.attemptId,input_hash:input.binding.inputHash,binding_hash:input.binding.hash}:{})}})
  }
  return {guards,mutations,ids}
}
export const settleReservation=async(db:D1Database,id:string,actual:string,now:number)=>{
  const row=await db.prepare('SELECT r.*,b.ceiling,b.consumed,b.reserved,b.version AS budget_version FROM authority_reservations r JOIN authority_budgets b ON b.grant_id=r.grant_id AND b.unit=r.unit WHERE r.id=?').bind(id).first<{grant_id:string;unit:string;amount:string;state:string;ceiling:string;consumed:string;reserved:string;budget_version:number}>()
  if(!row||row.state!=='reserved')throw new AuthorityError('version_conflict','Reservation is no longer unsettled.',409)
  const actualN=canonicalInteger(actual),held=canonicalInteger(row.amount)
  if(actualN>held)throw new AuthorityError('budget_exhausted','Settlement exceeds the admitted reservation.',409)
  const where=trustedPredicate('grant_id=? AND unit=? AND version=? AND consumed=? AND reserved=?',[row.grant_id,row.unit,row.budget_version,row.consumed,row.reserved])
  const guards=[trustedPredicate(`EXISTS(SELECT 1 FROM authority_budgets WHERE ${where.sql})`,where.values),trustedPredicate(`EXISTS(SELECT 1 FROM authority_reservations WHERE id=? AND state='reserved')`,[id])]
  const mutations:SqlMutation[]=[{kind:'update',table:budgets,set:{reserved:(canonicalInteger(row.reserved)-held).toString(),consumed:(canonicalInteger(row.consumed)+actualN).toString(),version:row.budget_version+1},where,expectedRows:1},{kind:'update',table:reservations,set:{state:actualN===0n?'released':'consumed',updated_at:now},where:trustedPredicate(`id=? AND state='reserved'`,[id]),expectedRows:1}]
  return {guards,mutations}
}

export type BudgetReconciliation={reservationId:string;grantId:string;unit:string;actual:string;consumedBefore:string;consumedAfter:string;reserved:string;ceiling:string;overrun:string}
/** Account for an observed effect after its capacity was released. This grants no dispatch authority.
 * Other actions keep their reservations; any resulting overrun remains visible and blocks new admission. */
export const reconcileReleasedReservation=async(db:D1Database,id:string,actual:string,now:number)=>{
 const row=await db.prepare('SELECT r.*,b.ceiling,b.consumed,b.reserved,b.version AS budget_version FROM authority_reservations r JOIN authority_budgets b ON b.grant_id=r.grant_id AND b.unit=r.unit WHERE r.id=?').bind(id).first<{grant_id:string;unit:string;amount:string;state:string;ceiling:string;consumed:string;reserved:string;budget_version:number}>()
 if(!row||row.state!=='released')throw new AuthorityError('version_conflict','Released reservation changed before readback reconciliation.',409)
 const actualN=canonicalInteger(actual)
 if(actualN>canonicalInteger(row.amount))throw new AuthorityError('budget_exhausted','Readback settlement exceeds the original admitted amount.',409)
 const reservation=trustedPredicate("id=? AND state='released' AND grant_id=? AND unit=? AND amount=?",[id,row.grant_id,row.unit,row.amount])
 const guards=[trustedPredicate(`EXISTS(SELECT 1 FROM authority_reservations WHERE ${reservation.sql})`,reservation.values)],mutations:SqlMutation[]=[]
 if(actualN===0n)return {guards,mutations,reconciliation:null}
 const consumed=canonicalInteger(row.consumed)+actualN,overrun=consumed+canonicalInteger(row.reserved)-canonicalInteger(row.ceiling)
 const where=trustedPredicate('grant_id=? AND unit=? AND version=? AND ceiling=? AND consumed=? AND reserved=?',[row.grant_id,row.unit,row.budget_version,row.ceiling,row.consumed,row.reserved])
 guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM authority_budgets WHERE ${where.sql})`,where.values))
 mutations.push({kind:'update',table:budgets,set:{consumed:consumed.toString(),version:row.budget_version+1},where,expectedRows:1},{kind:'update',table:reservations,set:{state:'consumed',updated_at:now},where:reservation,expectedRows:1})
 const reconciliation:BudgetReconciliation={reservationId:id,grantId:row.grant_id,unit:row.unit,actual,consumedBefore:row.consumed,consumedAfter:consumed.toString(),reserved:row.reserved,ceiling:row.ceiling,overrun:(overrun>0n?overrun:0n).toString()}
 return {guards,mutations,reconciliation}
}
