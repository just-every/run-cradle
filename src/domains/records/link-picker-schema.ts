import type { EntitySchema, View } from './contracts'
import { AdmissionError } from '../admission/errors'
import { filterFields } from './filter.server'

export type PickerViewSnapshot={id:string;definition_json:string;visibility?:string}
export function validateLinkPickers(schemas:EntitySchema[],views:PickerViewSnapshot[]){
 for(const schema of schemas)for(const field of schema.fields){
  const config=field.linkPicker;if(!config)continue
  const fail=(message:string):never=>{throw new AdmissionError('validation',`${field.label}: ${message}`)}
  if(field.type!=='relation'||!field.relation)fail('picker settings require a linked-record field.')
  const target=schemas.find(table=>table.appId===field.relation!.ownerAppId&&table.id===field.relation!.entityId)
  if(!target)fail('picker target is unavailable.')
  const type=(id:string)=>{const value=target!.fields.find(field=>field.id===id);return value?.type==='computed'?value.resultType:value?.type}
  if(config.searchFieldIds.some(id=>!['text','url'].includes(type(id)??'')))fail('search fields must contain text or URLs in the target table.')
  if(config.displayFieldIds.some(id=>!['text','url','number','date','instant','money','boolean','select','person'].includes(type(id)??'')))fail('display fields must contain scalar values in the target table.')
  if(config.viewId){
   const row=views.find(view=>view.id===config.viewId),view=row&&JSON.parse(row.definition_json) as View|undefined
   if(!row||row.visibility!=='app'||!view||view.visibility!=='app'||view.appId!==target!.appId||view.entityId!==target!.id)fail('the saved view must be active, shared with this app and belong to the target table.')
   const dependencies=[...view!.fields,...view!.groupBy,...view!.sort.map(sort=>sort.fieldId),...filterFields(view!.filter),...Object.values(view!.layout)]
   if(dependencies.some(id=>!target!.fields.some(field=>field.id===id)))fail('the saved view references a removed field. Update it before changing this schema.')
  }
 }
}
