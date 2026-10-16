import {AdmissionError} from '../../domains/admission/errors';
import {trustedPredicate} from '../../domains/admission/sql.server';
import type {ExecutionGuardIdentity} from '../../domains/execution/ports';
import type {RepairContext} from './context.server';
import {terminalRefusal} from './effect-state';
import {str} from './repository.server';

/** A visit projection cannot release the original provider key while its run can retry. */
export async function availableBooking(c:RepairContext,workId:string,identity?:ExecutionGuardIdentity){
 const visits=await c.repo.list(c.ctx,'visits',trustedPredicate('work_order_id=?',[workId]));
 const setGuard=trustedPredicate('NOT EXISTS(SELECT 1 FROM repair_visits WHERE work_order_id=? AND id NOT IN(SELECT value FROM json_each(?)))',[workId,JSON.stringify(visits.map(row=>row.id))]);
 if(!await c.d.db.prepare(`SELECT 1 WHERE ${setGuard.sql}`).bind(...setGuard.values).first())throw new AdmissionError('unknown_outcome','Current bookings must be reviewed before another request');
 c.guards.push(setGuard);
 let originalFound=false;
 for(const visit of visits){
  c.guards.push(c.repo.version('visits',visit));
  const observed=await c.d.execution.read(c.ctx,str(visit,'attempt_id'));
  c.guards.push(...observed.guards);
  if(identity?.idempotencyKey===observed.attempt.idempotencyKey){
   if(visit.lifecycle==='cancelled')throw new AdmissionError('invalid_transition','A cancelled visit cannot be booked again with its original key');
   originalFound=true;
  }else if(visit.lifecycle!=='cancelled'&&(visit.lifecycle!=='refused'||!terminalRefusal(observed))){
   throw new AdmissionError('unknown_outcome','Reconcile the existing booking before any new request');
  }
 }
 if(identity?.attemptId&&!originalFound)throw new AdmissionError('stale_evidence','The original repair visit is no longer available for dispatch');
}
