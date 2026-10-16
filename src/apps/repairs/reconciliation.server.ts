import {AdmissionError} from '../../domains/admission/errors';
import type {RepairContext} from './context.server';
import {revision} from './context.server';
import {str} from './repository.server';
import type {RepairActionInput} from './contracts';
import {terminalRefusal} from './effect-state';
import {cancellationObservations} from './cancellation-guards.server';

/** Project already-observed X receipts. Network reconciliation belongs to X's original attempt. */
export async function reconcileEffect(c:RepairContext,input:RepairActionInput<'repair.reconcile-effect'>){
 const entity=input.kind==='visit'?'visits':'handoffs',row=await c.repo.load(c.ctx,entity,input.id);
 c.requireExpected(entity,row);
 const work=await c.repo.load(c.ctx,'workOrders',str(row,'work_order_id'));
 c.guards.push(c.repo.version('workOrders',work));
 if(work.case_id)c.guards.push(...await c.d.cases.guards(c.ctx,str(work,'case_id'),c.command.controlEpoch));
 const history=input.kind==='visit'?await cancellationObservations(c,row.id):null;
 const cancellation=history?.prior;
 // A superseded cancellation can still have succeeded at the provider. Its receipt
 // takes precedence over a later refusal in the mutable cancellation projection.
 const cancellationResult=history?.observed.find(item=>item.attempt.state==='confirmed')
  ??history?.observed.find(item=>!terminalRefusal(item))??history?.observed[0];
 const cancelled=!!cancellationResult,observed=cancellationResult??await c.d.execution.read(c.ctx,str(row,'attempt_id'));
 c.guards.push(...observed.guards);
 if(observed.attempt.state==='prepared')throw new AdmissionError('invalid_transition','Effect has not been dispatched');
 if(observed.attempt.state==='refused'&&!terminalRefusal(observed))throw new AdmissionError('invalid_transition','The original effect is waiting for its scheduled retry');
 const state=observed.attempt.state==='confirmed'?(cancelled?'cancelled':input.kind==='visit'?'confirmed':observed.accountingReadback?'handed_off':'unknown'):terminalRefusal(observed)?(cancelled?'confirmed':'refused'):'unknown';
 const changes:Record<string,string|number|null>={lifecycle:state};
 if(cancelled){
  if(cancellation)c.update('cancellations',cancellation,{lifecycle:observed.attempt.state==='confirmed'?'cancelled':terminalRefusal(observed)?'refused':'unknown'});
  if(terminalRefusal(observed)){
   const booking=await c.d.execution.read(c.ctx,str(row,'attempt_id'));c.guards.push(...booking.guards);
   if(booking.attempt.state!=='confirmed')throw new AdmissionError('stale_evidence','Original booking is no longer confirmed');
   changes.receipt_id=booking.receiptId;changes.external_id=booking.externalId;changes.contractor_accepted=booking.contractorAccepted?1:0;
  }else if(observed.attempt.state==='confirmed')changes.contractor_accepted=0;
 }else{
  changes.receipt_id=observed.receiptId;changes.external_id=observed.externalId;
  if(input.kind==='visit')changes.contractor_accepted=observed.contractorAccepted?1:0;
  else changes.readback_verified=observed.accountingReadback?1:0;
 }
 c.update(entity,row,changes);
 return c.finish({id:row.id,state,receiptId:changes.receipt_id??row.receipt_id,externalId:changes.external_id??row.external_id,paymentStatus:'not_asserted'},revision(entity,row));
}
