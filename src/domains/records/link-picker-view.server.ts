import type { RequestContext } from '../authority/ports'
import type { EntitySchema, View } from './contracts'
import type { createRecordServices } from './service.server'
import { AdmissionError } from '../admission/errors'
import { trustedPredicate } from '../admission/sql.server'

/** Read the live definition; deleted or invalid views never become an unrestricted picker. */
export async function pickerView(db:D1Database,services:ReturnType<typeof createRecordServices>,ctx:RequestContext,target:EntitySchema,id?:string){
 if(!id)return null
 const row=await db.prepare('SELECT id,app_id,entity_id,version,visibility,definition_json FROM record_views WHERE id=?').bind(id).first<{id:string;app_id:string;entity_id:string;version:number;visibility:string;definition_json:string}>()
 if(!row||row.visibility!=='app'||row.app_id!==target.appId||row.entity_id!==target.id)throw new AdmissionError('not_found','The picker’s shared view is unavailable. Ask the base owner to update its settings.')
 const view=JSON.parse(row.definition_json) as View
 if(view.id!==row.id||view.appId!==row.app_id||view.entityId!==row.entity_id||view.version!==row.version||view.visibility!=='app')throw new AdmissionError('schema_conflict','The picker’s shared view changed. Refresh the picker.')
 const {id:viewId,version,createdAt,updatedAt,...definition}=view
 await services.metadata.checkedView(ctx,definition)
 return {view,guard:trustedPredicate("EXISTS(SELECT 1 FROM record_views WHERE id=? AND version=? AND definition_json=? AND visibility='app')",[row.id,row.version,row.definition_json])}
}
