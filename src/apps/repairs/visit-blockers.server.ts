import type {RequestContext} from '../../domains/authority/ports';
import {trustedPredicate} from '../../domains/admission/sql.server';
import type {RepairDependencies} from './ports';
import {str,type Row,type RepairRepository} from './repository.server';
import {terminalRefusal} from './effect-state';

/** Visit lifecycle is a projection; original provider identities determine current risk. */
export async function visitBlockers(ctx:RequestContext,d:RepairDependencies,repo:RepairRepository,visits:Row[]){
 const blockers:string[]=[];
 for(const visit of visits){
  const [retained,history]=await Promise.all([
   repo.list(ctx,'cancellations',trustedPredicate('visit_id=?',[visit.id])),
   d.execution.cancellationAttempts(ctx,visit.id)
  ]);
  const ids=[...new Set([...retained.map(row=>str(row,'attempt_id')),...history.attemptIds])];
  const cancellations=await Promise.all(ids.map(id=>d.execution.read(ctx,id)));
  // As in reconciliation, any confirmed cancellation closes this event even if
  // another cancellation was refused or its mutable projection has not caught up.
  if(cancellations.some(result=>result.attempt.state==='confirmed'))continue;
  for(const result of cancellations){
   if(terminalRefusal(result))continue;
   blockers.push(['unknown','dispatching','partial'].includes(result.attempt.state)
    ?'Visit cancellation outcome is unknown; reconcile the original request.'
    :'Visit cancellation is pending; check the original request before continuing.');
  }
  const booking=await d.execution.read(ctx,str(visit,'attempt_id'));
  if(['unknown','dispatching','partial'].includes(booking.attempt.state))blockers.push('Unknown booking outcome; reconcile the original request.');
  else if(booking.attempt.state==='prepared'||booking.attempt.state==='refused'&&!terminalRefusal(booking))blockers.push('Booking request is pending; check the original request before continuing.');
  else if(booking.attempt.state==='confirmed'&&!booking.contractorAccepted)blockers.push('Calendar event exists; contractor agreement is not confirmed.');
 }
 return blockers;
}
