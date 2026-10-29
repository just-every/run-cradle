import {interfaceImportEffects} from './interface-effects.server'
import type { BasePreview } from './contracts'
import type { Json,TargetEffect } from '../../../../vendor/base/modules/import-kit/src/types'
import { portableViewSchema,portableFormSchema } from './json-format'
import { canonical } from '../../admission/canonical'
/** Owner, native versions and timestamps are destination facts, never uploaded authority. */
export function portableMetadataEffects(preview:BasePreview,now:string,ownerId?:string):TargetEffect[]{const result:TargetEffect[]=[]
 if((preview.portableViews?.length||preview.portableForms?.length||preview.portableInterfaces?.length)&&!ownerId)throw new Error('Portable metadata requires the current destination owner')
 for(const raw of preview.portableViews??[]){const view=portableViewSchema.parse(raw),{tableId,...definition}=view,native={...definition,appId:preview.identities.appId,entityId:tableId,version:1,createdAt:now,updatedAt:now,shipped:false};result.push({targetKind:'view',targetId:view.id,value:{row:{id:view.id,app_id:native.appId,entity_id:tableId,owner_id:ownerId!,version:1,visibility:view.visibility,definition_json:canonical(native),created_at:now,updated_at:now}}})}
 for(const raw of preview.portableForms??[]){const form=portableFormSchema.parse(raw),{tableId,...definition}=form,native={...definition,appId:preview.identities.appId,entityId:tableId,version:1,createdAt:now,updatedAt:now};result.push({targetKind:'form',targetId:form.id,value:{row:{id:form.id,app_id:native.appId,entity_id:tableId,version:1,definition_json:canonical(native),created_at:now,updated_at:now}}})}
 result.push(...interfaceImportEffects(preview,now,ownerId!))
 return result
}
