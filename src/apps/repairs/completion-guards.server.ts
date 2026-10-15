import {AdmissionError} from '../../domains/admission/errors';
import {trustedPredicate} from '../../domains/admission/sql.server';
import type {RepairContext} from './context.server';
import {json,str,type Row} from './repository.server';

/** A completion remains usable only while its original visit and evidence are current. */
export async function currentCompletion(c:RepairContext,work:Row,claim:Row){
 if(claim.work_order_id!==work.id||claim.id!==work.completion_claim_id||claim.scope_hash!==work.scope_hash)throw new AdmissionError('stale_evidence','The completion claim no longer covers this repair');
 const visit=await c.repo.load(c.ctx,'visits',str(claim,'visit_id'));
 if(visit.work_order_id!==work.id||visit.quote_id!==work.quote_id||visit.lifecycle!=='confirmed')throw new AdmissionError('stale_evidence','Completion requires the current confirmed visit');
 const cancellation=(await c.repo.list(c.ctx,'cancellations',trustedPredicate('visit_id=?',[visit.id])))[0];
 if(cancellation){
  const observed=await c.d.execution.read(c.ctx,str(cancellation,'attempt_id'));
  if(observed.attempt.state!=='refused')throw new AdmissionError('invalid_transition','A cancelled or unresolved cancellation cannot establish accepted completion');
  c.guards.push(c.repo.version('cancellations',cancellation),...observed.guards);
 }else c.guards.push(trustedPredicate('NOT EXISTS(SELECT 1 FROM repair_cancellations WHERE visit_id=?)',[visit.id]));
 const booking=await c.d.execution.read(c.ctx,str(visit,'attempt_id'));
 if(booking.attempt.state!=='confirmed'||!booking.contractorAccepted)throw new AdmissionError('stale_evidence','The original booking and contractor agreement must remain confirmed');
 await c.evidence(json(claim,'evidence'));
 c.guards.push(c.repo.version('completionClaims',claim),c.repo.version('visits',visit),...booking.guards);
}

/** Cancellation and accounting dispatch fence each other at their atomic admission. */
export async function cancellableAccounting(c:RepairContext,work:Row){
 const handoffs=await c.repo.list(c.ctx,'handoffs',trustedPredicate('work_order_id=?',[work.id]));
 const setGuard=trustedPredicate('NOT EXISTS(SELECT 1 FROM repair_handoffs WHERE work_order_id=? AND id NOT IN(SELECT value FROM json_each(?)))',[work.id,JSON.stringify(handoffs.map(row=>row.id))]);
 if(!await c.d.db.prepare(`SELECT 1 WHERE ${setGuard.sql}`).bind(...setGuard.values).first())throw new AdmissionError('stale_evidence','Current accounting handoffs must be reviewed before cancelling');
 c.guards.push(setGuard);
 for(const handoff of handoffs){
  const observed=await c.d.execution.read(c.ctx,str(handoff,'attempt_id'));
  if(!['prepared','refused'].includes(observed.attempt.state))throw new AdmissionError('unknown_outcome','An accounting handoff has been dispatched; resolve its original outcome before cancelling');
  c.guards.push(c.repo.version('handoffs',handoff),...observed.guards);
 }
}
