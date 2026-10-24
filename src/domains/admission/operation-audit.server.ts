import {createUlid} from '../../core/shared/ids'
import type {RequestContext} from '../authority/ports'
/** Call only after the door has checked its current authority. No data, names,
 * filter terms, destination addresses or secret material enters this store. */
export async function auditOperation(db:D1Database,ctx:RequestContext,action:string,appId:string|null,feature:string|null=null){
 await db.prepare('INSERT INTO operation_audit(id,actor_id,app_id,action,feature,created_at) VALUES(?,?,?,?,?,?)').bind(createUlid(),ctx.principal.kind==='system'?null:ctx.principal.id,appId,action,feature,ctx.now).run()
}
