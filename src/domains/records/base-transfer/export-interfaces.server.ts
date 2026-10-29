import {definitionSchema} from '../interfaces/contracts'
import {requireBaseAuthor} from '../manual/base-access.server'
import type {RequestContext} from '../../authority/ports'
import type {createRecordMetadata} from '../metadata.server'
import {trustedPredicate} from '../../admission/sql.server'
import type {SqlPredicate} from '../../admission/ports'
import {AdmissionError} from '../../admission/errors'
import {portableInterfaceSchema,type PortableInterface,interfaceComponents} from './interface-portability'

/** Complete interface history is portable layout, never captured record values or authority. */
export async function exportInterfaces(db:D1Database,metadata:ReturnType<typeof createRecordMetadata>,ctx:RequestContext,appId:string){
 const expression="(SELECT COALESCE(json_group_array(json_array(id,version,definition_json)),'[]') FROM (SELECT id,version,definition_json FROM record_interfaces WHERE app_id=? AND deleted_at IS NULL ORDER BY id))"
 const captured=await db.prepare(`SELECT ${expression} AS snapshot`).bind(appId).first<{snapshot:string}>()
 const guards:SqlPredicate[]=[trustedPredicate(`${expression}=?`,[appId,captured!.snapshot])],items:PortableInterface[]=[]
 const rows=JSON.parse(captured!.snapshot) as [string,number,string][]
 if(!rows.length)return {items,guards}
 const author=await requireBaseAuthor(db,ctx,appId);if(!author)throw new AdmissionError('forbidden','Complete interface export requires a current base owner or creator.');guards.push(...author.guards)
 for(const [id,version,json]of rows){
  const definition=JSON.parse(json),input=definitionSchema.parse({appId,name:definition.name,pages:definition.pages,audience:definition.audience})
  const versionExpression="(SELECT COALESCE(json_group_array(json_array(version,definition_json)),'[]') FROM (SELECT version,definition_json FROM record_interface_versions WHERE interface_id=? ORDER BY version))"
  const history=await db.prepare(`SELECT ${versionExpression} AS snapshot`).bind(id).first<{snapshot:string}>();guards.push(trustedPredicate(`${versionExpression}=?`,[id,history!.snapshot]))
  const versions=(JSON.parse(history!.snapshot) as [number,string][]).map(([version,json])=>{const definition=JSON.parse(json);return {version,name:definition.name,pages:definition.pages,audience:definition.audience}})
  const item=portableInterfaceSchema.parse({id,version,name:input.name,pages:input.pages,audience:input.audience,versions})
  for(const retained of [item,...item.versions])for(const component of interfaceComponents(retained)){
   if(component.kind==='view'){const view=await metadata.readView(ctx,component.viewId);if(view.appId!==appId||view.visibility!=='app')throw new AdmissionError('forbidden','Interface export requires its current shared views.')}
   if(component.kind==='form'){const form=await metadata.readForm(ctx,component.formId);if(form.appId!==appId)throw new AdmissionError('forbidden','Interface export requires its current authenticated forms.')}
  }
  items.push(item)
 }
 return {items,guards}
}
