import {canonical} from '../admission/canonical'
/** Compare the committed write's existing audit facts, never queue payloads or
 * a later record version. Unavailable/write-only values do not start a send. */
export async function namedAutomationFieldsChanged(db:D1Database,input:{command_id:string;app_id:string;entity_id:string;record_id:string},fields:string[]){
 const rows=await db.prepare("SELECT changes_json FROM admission_audit WHERE command_id=? AND app_id=? AND json_extract(subject_json,'$.entityId')=? AND json_extract(subject_json,'$.recordId')=?").bind(input.command_id,input.app_id,input.entity_id,input.record_id).all<{changes_json:string}>()
 return rows.results.some(row=>(JSON.parse(row.changes_json) as {fieldId:string;before:{state:string;value?:unknown};after:{state:string;value?:unknown}}[]).some(change=>fields.includes(change.fieldId)&&change.before.state==='value'&&change.after.state==='value'&&canonical(change.before.value)!==canonical(change.after.value)))
}
