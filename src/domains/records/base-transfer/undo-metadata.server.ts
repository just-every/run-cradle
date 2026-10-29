import type { D1UndoEffect, D1UndoObservation } from '../../../../vendor/base/modules/import-kit/src/d1/undo-types'
import type { Json, TargetRow } from '../../../../vendor/base/modules/import-kit/src/types'
import type { DescriptorRegistry } from '../descriptors.server'

/** Metadata owns the complete native definition, revision and visibility. It has
 * no record-data dependency because imported schema deliberately survives undo. */
export function metadataUndoObservation(registry:DescriptorRegistry,effect:D1UndoEffect,current:TargetRow|null):D1UndoObservation {
 const expected=effect.expected,kind=expected.targetKind
 if(kind==='interface'){const applied=(expected.value as {row:Record<string,Json>}).row,row=current?(current.value as {row:Record<string,Json>}).row:null,definition=JSON.parse(String((row??applied).definition_json));return {effectId:effect.provenance.id,current,entity:{table:'00000000000000000000000004',recordId:expected.targetId},evidence:{tableLabel:'Interfaces',recordPrimary:definition.name,metadataKind:kind,appliedRecordVersion:applied.version,observedRecordVersion:row?.version??null}}}
 if(kind!=='view'&&kind!=='form')throw new Error('Unknown metadata undo effect')
 const applied=(expected.value as {row:Record<string,Json>}).row,row=current?(current.value as {row:Record<string,Json>}).row:null,entityId=String(applied.entity_id),descriptor=registry.get(expected.destination,entityId),definition=JSON.parse(String((row??applied).definition_json)) as Record<string,Json>
 return {effectId:effect.provenance.id,current,entity:{table:entityId,recordId:expected.targetId},evidence:{tableLabel:descriptor.schema.label,recordPrimary:definition[kind==='view'?'name':'title']??null,metadataKind:kind,appliedRecordVersion:applied.version??null,observedRecordVersion:row?.version??null}}
}
