import {AdmissionError} from '../../admission/errors'
import {trustedPredicate} from '../../admission/sql.server'

/** Preserve every retained layout while its interface is live; deletion can follow interface Trash. */
export async function detachedInterfaceReference(db:D1Database,appId:string,kind:'view'|'form',id:string){
 const key=kind==='view'?'viewId':'formId'
 const condition=`NOT EXISTS(SELECT 1 FROM record_interfaces i WHERE i.app_id=? AND i.deleted_at IS NULL AND (EXISTS(SELECT 1 FROM json_tree(i.definition_json,'$.pages') WHERE key='${key}' AND atom=?) OR EXISTS(SELECT 1 FROM record_interface_versions v,json_tree(v.definition_json,'$.pages') WHERE v.interface_id=i.id AND key='${key}' AND atom=?)))`
 const guard=trustedPredicate(condition,[appId,id,id])
 if(!await db.prepare(`SELECT 1 WHERE ${condition}`).bind(...guard.values).first())throw new AdmissionError('validation',`A retained interface uses this ${kind}. Move the interface to Trash before deleting its referenced metadata.`)
 return guard
}
