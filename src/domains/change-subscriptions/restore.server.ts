import type {Cell,Ref} from '../../contracts/primitives'

/** Restore changes have no field delta of their own. The latest retained audit
 * after-cell per field reconstructs that commit's values without another log. */
export async function restoredCells(db:D1Database,ref:Ref,sequence:number){
 const rows=await db.prepare(`SELECT field_id,cell_json FROM (
  SELECT json_extract(delta.value,'$.fieldId') field_id,
   json_extract(delta.value,'$.after') cell_json,
   ROW_NUMBER() OVER (PARTITION BY json_extract(delta.value,'$.fieldId') ORDER BY audit.change_sequence DESC,audit.id DESC) ordinal
  FROM admission_audit audit,json_each(audit.changes_json) delta
  WHERE audit.app_id=? AND json_extract(audit.subject_json,'$.entityId')=?
   AND json_extract(audit.subject_json,'$.recordId')=? AND audit.change_sequence<?
 ) WHERE ordinal=1 ORDER BY field_id`).bind(ref.appId,ref.entityId,ref.recordId,sequence).all<{field_id:string;cell_json:string}>()
 return rows.results.map(row=>({fieldId:row.field_id,before:{state:'value',value:null} as Cell,after:JSON.parse(row.cell_json) as Cell}))
}
