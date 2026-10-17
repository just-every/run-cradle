import type { D1Database, D1TargetAdapter } from '../../../../vendor/base/modules/import-kit/src/d1/types'
import type { D1UndoDependency, D1UndoEffect, D1UndoEntity, D1UndoSnapshot } from '../../../../vendor/base/modules/import-kit/src/d1/undo-types'
import type { Json, TargetRow } from '../../../../vendor/base/modules/import-kit/src/types'
import type { DescriptorRegistry, EntityDescriptor, FieldStorage } from '../descriptors.server'
import { metadataUndoObservation } from './undo-metadata.server'
import { incomingUndoRows, nativeUndoMarkerGuards } from './undo-guards.server'

const key = (kind:string,id:string) => kind+'\0'+id
const value = (row:TargetRow) => row.value as Record<string,Json>
/** A relation owns its cell/tuples. A scalar edit increments the enclosing row's
 * version without editing that separately attributed relation. Strict Kit use
 * still compares the entire original snapshot, including recordVersion. */
export function nativeOwnedContent(row:TargetRow):Json {
 if(!row.targetKind.startsWith('link:'))return row.value
 const {recordVersion:_,...owned}=value(row)
 return owned
}

/** Supplies facts and exact guards to the official Kit. The Kit alone chooses,
 * persists and executes dispositions, owns provenance, and advances the job. */
export function nativePreservedUndo(registry:DescriptorRegistry,target:D1TargetAdapter) {
 return async(db:D1Database,destination:string,effects:D1UndoEffect[]):Promise<D1UndoSnapshot>=>{
  const rows=await target.list(db,destination),byTarget=new Map(rows.map(row=>[key(row.targetKind,row.targetId),row])),byEffect=new Map(effects.map(effect=>[key(effect.expected.targetKind,effect.expected.targetId),effect])),dependencies:D1UndoDependency[]=[]
  const guards=target.matchesMany!(rows,destination)
  const markers=(await db.prepare('SELECT target_kind,record_id,revision FROM record_import_revisions WHERE app_id=? ORDER BY target_kind,record_id').bind(destination).all<{target_kind:string;record_id:string;revision:string}>()).results,byMarker=new Map(markers.map(marker=>[key(marker.target_kind,marker.record_id),marker.revision]))
  guards.push(...nativeUndoMarkerGuards(destination,markers))
  const entity=(d:EntityDescriptor,id:string,f?:FieldStorage,targetId?:string):D1UndoEntity=>({table:d.schema.id,recordId:id,...(f?{field:f.field.id}:{}),...(targetId?{targetId}:{})})
  const describe=(d:EntityDescriptor,id:string,f?:FieldStorage):Record<string,Json>=>{
   const row=byTarget.get(key('record:'+d.schema.id,id)),applied=byEffect.get(key('record:'+d.schema.id,id))?.expected,primary=d.schema.primaryFieldId?d.fields.get(d.schema.primaryFieldId):undefined
   const cells=row?(value(row).row as Record<string,Json>):undefined,old=applied?(value(applied).row as Record<string,Json>):undefined
   const cell=f?byTarget.get(key('link:'+d.schema.id+':'+f.field.id,id)):undefined,content=cell?value(cell):undefined
   return {tableLabel:d.schema.label,primaryFieldId:d.schema.primaryFieldId??null,recordPrimary:primary?cells?.[primary.column]??old?.[primary.column]??null:null,appliedRecordVersion:old?.version??null,observedRecordVersion:cells?.version??null,...(f?{fieldLabel:f.field.label,required:f.field.required,cardinality:f.field.relation?.cardinality??'many',...(f.field.relation?{targetTableId:f.field.relation.entityId,targetTableLabel:registry.get(f.field.relation.ownerAppId,f.field.relation.entityId).schema.label}:{}),observedTargetIds:content?(f.join?(content.values as {value:string}[]).map(tuple=>tuple.value):content.value===null?[]:[content.value!]):[]}:{})}
  }
  const observations=effects.map(effect=>{
   const expected=effect.expected,current=byTarget.get(key(expected.targetKind,expected.targetId))??null,[kind,entityId,fieldId]=expected.targetKind.split(':')
   if(byMarker.get(key(expected.targetKind,expected.targetId))!==expected.revision)throw new Error('IMPORT_NATIVE_ATTRIBUTION_CHANGED: native import revision changed')
   if(kind==='view'||kind==='form')return metadataUndoObservation(registry,effect,current)
   if(kind!=='record'&&kind!=='link')throw new Error('Unknown native undo effect')
   const d=registry.get(destination,entityId!),f=fieldId?d.fields.get(fieldId):undefined
   return {effectId:effect.provenance.id,current,entity:entity(d,expected.targetId,f),evidence:describe(d,expected.targetId,f)}
  })
  const dependency=(required:D1UndoEffect|undefined,dependent:D1UndoEffect|undefined,cause:D1UndoEntity,evidence:Record<string,Json>,ordering:'dependent-first'|'retention-only'='dependent-first')=>{
   if(!required||required===dependent)return
   dependencies.push({requiredEffectId:required.provenance.id,...(dependent?{dependentEffectId:dependent.provenance.id}:{}),cause,evidence,...(ordering==='retention-only'?{order:false as const}:{})})
  }
  // Each native link cell is independent from its owning record. Even empty
  // imported cells reverse before that record; retained changed links protect it.
  for(const row of rows){
   if(!row.targetKind.startsWith('link:'))continue
   const [,entityId,fieldId]=row.targetKind.split(':'),d=registry.get(destination,entityId!),f=d.fields.get(fieldId!)!,owner=byEffect.get(key('record:'+entityId,row.targetId)),link=byEffect.get(key(row.targetKind,row.targetId)),cell=value(row)
   const ids=f.join?(cell.values as {value:string}[]).map(tuple=>tuple.value):cell.value===null?[]:[String(cell.value)]
   // An unattributed empty cell carries no native data to protect.
   if(link||ids.length)dependency(owner,link,entity(d,row.targetId,f),{...describe(d,row.targetId,f),rule:'link-owner'})
   if(f.field.required&&link)dependency(link,owner,entity(d,row.targetId,f),{...describe(d,row.targetId,f),rule:'required-many-nonempty'},'retention-only')
   if(f.field.type==='relation')for(const id of ids)dependency(byEffect.get(key('record:'+f.field.relation!.entityId,id)),link,entity(d,row.targetId,f,id),{...describe(d,row.targetId,f),rule:'incoming-link'})
  }
  // Required ONE values belong to the row effect. An edited child protects its
  // parent; an edited parent does not prevent removing an unchanged child.
  for(const row of rows){
   if(!row.targetKind.startsWith('record:'))continue
   const d=registry.get(destination,row.targetKind.slice(7)),cells=value(row).row as Record<string,Json>,owner=byEffect.get(key(row.targetKind,row.targetId))
   for(const f of d.fields.values())if(f.field.type==='relation'&&f.field.required&&!f.join&&cells[f.column]!=null){const id=String(cells[f.column]);dependency(byEffect.get(key('record:'+f.field.relation!.entityId,id)),owner,entity(d,row.targetId,f,id),{...describe(d,row.targetId,f),rule:'required-one'})}
  }
  // Relations from other apps are outside the import's native set. Read and
  // fence every incoming tuple, including absence, before publishing decisions.
  const records=effects.filter(e=>e.expected.targetKind.startsWith('record:'))
  for(const d of registry.list())if(d.schema.appId!==destination)for(const f of d.fields.values())if(f.field.type==='relation'&&f.field.relation!.ownerAppId===destination){
   const targets=records.filter(e=>e.expected.targetKind==='record:'+f.field.relation!.entityId),ids=targets.map(e=>e.expected.targetId)
   if(!ids.length)continue
   const {rows:incoming,guards:incomingGuards}=await incomingUndoRows(db,d,f,ids)
   guards.push(...incomingGuards)
   for(const row of incoming)dependency(byEffect.get(key('record:'+f.field.relation!.entityId,String(row.value))),undefined,entity(d,String(row.record_id),f,String(row.value)),{tableLabel:d.schema.label,fieldLabel:f.field.label,rule:'outside-incoming-link',ownerAppId:d.schema.appId,observedRecordVersion:row.version!})
  }
  // Required MANY validity spans the row and its independently attributed joins.
  // They must disappear in one transaction: a later edit cannot retain an owner
  // after a previous bounded batch has already cleared its required links.
  const atomicGroups:string[][]=[]
  for(const effect of records){const d=registry.get(destination,effect.expected.targetKind.slice(7)),required=[...d.fields.values()].filter(f=>f.field.required&&f.join).map(f=>byEffect.get(key('link:'+d.schema.id+':'+f.field.id,effect.expected.targetId))).filter((link):link is D1UndoEffect=>!!link);if(required.length)atomicGroups.push([effect.provenance.id,...required.map(link=>link.provenance.id)])}
  return {observations,dependencies,guards,atomicGroups,nativeRows:rows}
 }
}
