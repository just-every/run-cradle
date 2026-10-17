import type { EntitySchema, View, Form } from '../contracts'
import type { SqlMutation } from '../../admission/ports'
import { canonical } from '../../admission/canonical'
import { trustedPredicate } from '../../admission/sql.server'
import { viewTable, formTable } from '../metadata.server'
import { currentSchemaView, currentSchemaForm } from '../metadata-schema'

export type ViewSnapshot = { id:string; version:number; definition_json:string; visibility?:string }

export async function snapshotViews(db:D1Database,appId:string){
 const expression="(SELECT COALESCE(json_group_array(json_object('id',id,'version',version,'definition_json',definition_json,'visibility',visibility)), '[]') FROM (SELECT id,version,definition_json,visibility FROM record_views WHERE app_id=? ORDER BY id))"
 const row=await db.prepare(`SELECT ${expression} AS snapshot`).bind(appId).first<{snapshot:string}>()
 const formsExpression=expression.replaceAll('record_views','record_forms').replace("'visibility',visibility","'visibility',NULL").replace('definition_json,visibility FROM','definition_json FROM'),forms=await db.prepare(`SELECT ${formsExpression} AS snapshot`).bind(appId).first<{snapshot:string}>()
 return {views:JSON.parse(row!.snapshot) as ViewSnapshot[],forms:JSON.parse(forms!.snapshot) as ViewSnapshot[],guards:[trustedPredicate(`${expression}=?`,[appId,row!.snapshot]),trustedPredicate(`${formsExpression}=?`,[appId,forms!.snapshot])]} 
}

export function prepareViewRemovals(views:ViewSnapshot[],schemas:EntitySchema[],removals:Record<string,string[]>,now:string):SqlMutation[]{
 const mutations:SqlMutation[]=[]
 for(const row of views){
  const view=JSON.parse(row.definition_json) as View,schema=schemas.find(s=>s.id===view.entityId),removed=new Set(removals[view.entityId]??[])
  if(!schema||!removed.size)continue
  const definition=currentSchemaView(view,schema)
  if(canonical(definition)===canonical(view))continue
  const next={...definition,version:row.version+1,updatedAt:now}
  mutations.push({kind:'update',table:viewTable,set:{definition_json:canonical(next),version:next.version,updated_at:now},where:trustedPredicate('id=? AND version=? AND definition_json=?',[row.id,row.version,row.definition_json]),expectedRows:1})
 }
 return mutations
}

export function prepareFormRemovals(forms:ViewSnapshot[],schemas:EntitySchema[],removals:Record<string,string[]>,now:string):SqlMutation[]{
 const mutations:SqlMutation[]=[]
 for(const row of forms){
  const form=JSON.parse(row.definition_json) as Form,schema=schemas.find(s=>s.id===form.entityId)
  if(!schema||!removals[form.entityId]?.length)continue
  const definition=currentSchemaForm(form,schema)
  if(canonical(definition)===canonical(form))continue
  const next={...definition,version:row.version+1,updatedAt:now}
  mutations.push({kind:'update',table:formTable,set:{definition_json:canonical(next),version:next.version,updated_at:now},where:trustedPredicate('id=? AND version=? AND definition_json=?',[row.id,row.version,row.definition_json]),expectedRows:1})
 }
 return mutations
}
