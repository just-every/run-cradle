import type {AdmissionPlan} from '../admission/ports';
/** A parent admission owns the commit; child authorization and every durable effect travel with it. */
export function includePreparedEffects<T>(parent:AdmissionPlan<T>,children:readonly AdmissionPlan<unknown>[]):AdmissionPlan<T>{
 for(const child of children){if(child.commandId!==parent.commandId||child.appId!==parent.appId||child.permit.actor.id!==parent.permit.actor.id||child.permit.actor.kind!==parent.permit.actor.kind)throw new Error('Prepared effect must share the original parent command, app and actor');if(child.permit.validUntil<parent.permit.validUntil)parent.permit={...parent.permit,validUntil:child.permit.validUntil};parent.guards=[...parent.guards,...child.permit.guards,...child.guards];parent.mutations=[...parent.mutations,...child.permit.reservationMutations,...child.mutations];parent.audit=[...parent.audit,...child.audit];parent.events=[...parent.events,...child.events];parent.outbox=[...parent.outbox,...child.outbox];parent.changed=[...(parent.changed??[]),...(child.changed??[])];}
 return parent;
}
