import {canonical} from '../../admission/canonical'
import type {Json,TargetEffect} from '../../../../vendor/base/modules/import-kit/src/types'
import type {BasePreview} from './contracts'
import {portableInterfaceSchema} from './interface-portability'

/** Imported attribution and audience belong to the destination owner, never uploaded authority. */
export function interfaceImportEffects(preview:BasePreview,now:string,ownerId:string):TargetEffect[]{
 return (preview.portableInterfaces??[]).map(raw=>{
  const item=portableInterfaceSchema.parse(raw)
  const native=(version:typeof item.versions[number])=>({id:item.id,appId:preview.identities.appId,name:version.name,pages:version.pages,audience:{roles:['owner'],people:[]},version:version.version,authorId:ownerId,createdAt:now,updatedAt:now})
  const current=native(item),versions=item.versions.map(version=>({interface_id:item.id,version:version.version,author_id:ownerId,definition_json:canonical(native(version)),created_at:now}))
  return {targetKind:'interface',targetId:item.id,value:{row:{id:item.id,app_id:preview.identities.appId,author_id:ownerId,version:item.version,definition_json:canonical(current),created_at:now,updated_at:now,deleted_at:null,expires_at:null},versions} as Json}
 })
}
