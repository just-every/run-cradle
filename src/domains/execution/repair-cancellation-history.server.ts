import {REPAIRS_APP_ID,REPAIR_ENTITIES} from '../../apps/repairs/model';
import {trustedPredicate} from '../admission/sql.server';

/** The mutable cancellation projection does not erase earlier provider identities. */
export function repairCancellationHistory(db:D1Database){return async(visitId:string)=>{
 const where="a.action='repair.cancel-visit' AND r.app_id=? AND EXISTS(SELECT 1 FROM json_each(r.request_json,'$.expected') e WHERE json_extract(e.value,'$.ref.entityId')=? AND json_extract(e.value,'$.ref.recordId')=?)";
 const values=[REPAIRS_APP_ID,REPAIR_ENTITIES.visits,visitId];
 const rows=(await db.prepare(`SELECT a.id,a.idempotency_key FROM execution_attempts a JOIN execution_runs r ON r.id=a.run_id WHERE ${where} ORDER BY a.created_at,a.id`).bind(...values).all<{id:string;idempotency_key:string}>()).results;
 const originals=new Map<string,string>();for(const row of rows)if(!originals.has(row.idempotency_key))originals.set(row.idempotency_key,row.id);
 return {attemptIds:[...originals.values()],guards:[trustedPredicate(`NOT EXISTS(SELECT 1 FROM execution_attempts a JOIN execution_runs r ON r.id=a.run_id WHERE ${where} AND a.id NOT IN(SELECT value FROM json_each(?)))`,[...values,JSON.stringify(rows.map(row=>row.id))])]};
};}
