import type {RequestContext} from '../../authority/ports'
import {trustedPredicate,identifier} from '../../admission/sql.server'
const custodyContexts=new WeakSet<RequestContext>()
/** Only server-owned trash operations create this context; no transport field can opt in. */
export function trashContext(ctx:RequestContext){const current={...ctx};custodyContexts.add(current);return current}
export function liveRecord(ctx:RequestContext,appId:string,entityId:string,table:string,idColumn:string){
 return custodyContexts.has(ctx)?trustedPredicate('1'):trustedPredicate(`NOT EXISTS(SELECT 1 FROM record_trash t WHERE t.app_id=? AND t.entity_id=? AND t.record_id=${identifier(table)}.${identifier(idColumn)})`,[appId,entityId])
}
