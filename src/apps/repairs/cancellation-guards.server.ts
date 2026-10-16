import {AdmissionError} from '../../domains/admission/errors';
import {trustedPredicate} from '../../domains/admission/sql.server';
import type {ExecutionGuardIdentity} from '../../domains/execution/ports';
import type {RepairContext} from './context.server';
import {terminalRefusal} from './effect-state';
import {str} from './repository.server';

export async function cancellationObservations(c:RepairContext,visitId:string){
 const prior=(await c.repo.list(c.ctx,'cancellations',trustedPredicate('visit_id=?',[visitId])))[0];
 c.guards.push(prior?c.repo.version('cancellations',prior):trustedPredicate('NOT EXISTS(SELECT 1 FROM repair_cancellations WHERE visit_id=?)',[visitId]));
 const history=await c.d.execution.cancellationAttempts(c.ctx,visitId);
 c.guards.push(...history.guards);
 const ids=[...new Set([...(prior?[str(prior,'attempt_id')]:[]),...history.attemptIds])];
 const observed=await Promise.all(ids.map(id=>c.d.execution.read(c.ctx,id)));
 for(const item of observed)c.guards.push(...item.guards);
 return {prior,observed};
}

/** Both completion and a replacement need every previous cancellation to be terminal. */
export async function refusedCancellations(c:RepairContext,visitId:string,identity?:ExecutionGuardIdentity){
 const history=await cancellationObservations(c,visitId),retained=history.prior?history.observed[0]:null;
 if(identity?.attemptId&&retained?.attempt.idempotencyKey!==identity.idempotencyKey)throw new AdmissionError('stale_evidence','The original cancellation has been superseded');
 for(const observed of history.observed){
  if(identity?.idempotencyKey===observed.attempt.idempotencyKey)continue;
  if(!terminalRefusal(observed))throw new AdmissionError('unknown_outcome','A cancelled or unresolved cancellation must be reconciled before continuing');
 }
 return history.prior;
}
