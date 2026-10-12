import type {RequestContext} from '../authority/ports';
import type {AdmissionPort} from '../admission/ports';
/** Preflight existing immutable result before version/expiry checks; still independently authorizes visibility. */
export async function replay(db:D1Database,admission:AdmissionPort,ctx:RequestContext,commandId:string,inputHash:string,action:string){const row=await db.prepare('SELECT input_hash,action,actor_id FROM command_admissions WHERE command_id=?').bind(commandId).first<{input_hash:string;action:string;actor_id:string}>();if(!row)return null;if(row.input_hash!==inputHash||row.action!==action||row.actor_id!==ctx.principal.id)throw new Error('Command idempotency conflict');return admission.status(ctx,commandId);}
