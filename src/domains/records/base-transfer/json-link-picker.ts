import { ImportInputError } from './input-error'
import type { PortableBase, PortableField } from './json-format'

/** Picker limits are application metadata, independent of stored link validity. */
export function validatePortableLinkPicker(field:PortableField,base:PortableBase['base']):void {
 const picker=field.linkPicker
 if(!picker)return
 const fail=(reason:string):never=>{throw new ImportInputError(`${field.label}: ${reason}`)}
 if(field.type!=='relation'||!field.relation)fail('picker settings require a linked-record field')
 const target=base.tables.find(table=>table.id===field.relation!.tableId)
 if(!target)fail('picker target table is missing')
 for(const ids of [picker.searchFieldIds,picker.displayFieldIds]){
  if(new Set(ids).size!==ids.length)fail('picker fields must not repeat')
  if(ids.some(id=>!target!.fields.some(field=>field.id===id)))fail('picker references a missing field or a field outside its target table')
 }
 const type=(id:string)=>{const field=target!.fields.find(field=>field.id===id)!;return field.type==='computed'?field.resultType:field.type}
 if(picker.searchFieldIds.some(id=>!['phone','text','url'].includes(type(id)??'')))fail('picker search fields must contain text or URLs')
 if(picker.displayFieldIds.some(id=>!['phone','text','url','number','date','instant','money','boolean','select','person'].includes(type(id)??'')))fail('picker display fields must contain scalar values')
 if(picker.viewId){
  const view=base.views.find(view=>view.id===picker.viewId)
  if(!view||view.tableId!==target!.id||view.visibility!=='app')fail('picker saved view must be included, shared with the app and belong to its target table')
 }
}

export function remapPortableLinkPicker(picker:NonNullable<PortableField['linkPicker']>,map:Map<string,string>):NonNullable<PortableField['linkPicker']> {
 const id=(source:string)=>{const target=map.get(source);if(!target)throw new ImportInputError(`Missing picker identity ${source}`);return target}
 return {searchFieldIds:picker.searchFieldIds.map(id),displayFieldIds:picker.displayFieldIds.map(id),...(picker.viewId?{viewId:id(picker.viewId)}:{})}
}
