import {referenceValue} from '../store-references'
import { orderImportRecords } from './record-order'
import { portableMetadataEffects } from './storage-metadata.server'
import type { SqlScalar } from '../../admission/ports'
import type { BasePreview } from './contracts'
import type { ImportMapping, Json, SourceBundle, SourceRecord, TargetEffect } from '../../../../vendor/base/modules/import-kit/src/types'
import { canonicalJson, sha256 } from '../../../../vendor/base/modules/import-kit/src/d1/index'
import type { DescriptorRegistry } from '../descriptors.server'
import { encodeValues } from '../codec.server'
import { validateCell } from '../validators'

export const mappingVersion='cradle-native-base-v1'
/** Immutable physical effects reuse the native codec and compiler descriptors. */
export function nativeSource(preview:BasePreview,registry:DescriptorRegistry,now:string,ownerId?:string):{source:SourceBundle;mapping:ImportMapping}{
 const records:SourceRecord[]=[],effects=new Map<string,TargetEffect[]>(),rejections=new Map<string,string>(),bySource=new Map(preview.records.map(r=>[r.tableKey+'\0'+r.rowKey,r])),byLink=new Map(preview.links.map(l=>[l.entityId+':'+l.recordId+':'+l.fieldId,l]))
 const append=(kind:string,sourceId:string,raw:Json,location:SourceRecord['location'],effect?:TargetEffect)=>{
  const artifact=preview.source.bundle.artifacts.find(a=>a.name===location.artifact);if(!artifact)throw new Error('Original source artifact is missing')
  const payload:Json={raw,...(effect?{native:effect.value}: {})},r:SourceRecord={namespace:preview.source.namespace,kind,sourceId,payload,payloadHash:sha256(canonicalJson(payload)),artifactHash:artifact.sha256,location};records.push(r);effects.set(kind+':'+sourceId,effect?[effect]:[])
 }
 const ordered=orderImportRecords({records:preview.records,links:preview.links,schemaDraft:{tables:registry.list(preview.identities.appId).map(d=>d.schema)}}),rank=new Map(ordered.map((r,i)=>[r.entityId+':'+r.recordId,i])),sourceRows=preview.source.tables.flatMap(table=>table.rows.map(raw=>({table,raw}))).sort((a,b)=>{const first=bySource.get(a.table.key+'\0'+a.raw.key),second=bySource.get(b.table.key+'\0'+b.raw.key);return (first?rank.get(first.entityId+':'+first.recordId)!:-1)-(second?rank.get(second.entityId+':'+second.recordId)!:-1)})
 for(const {table,raw} of sourceRows){
  const record=bySource.get(table.key+'\0'+raw.key),sourceId=table.key+':'+raw.key
  if(!record){append('row',sourceId,raw.values,raw.location);rejections.set('row:'+sourceId,'Rejected by reviewed conversion; see retained report.');continue}
  const d=registry.get(preview.identities.appId,record.entityId),values={...record.fields}
  for(const f of d.fields.values())if(f.field.type==='relation'){if(f.field.required){const link=byLink.get(record.entityId+':'+record.recordId+':'+f.field.id),refs=(link?.targetRecordIds??[]).map(recordId=>({appId:preview.identities.appId,entityId:f.field.relation!.entityId,recordId}));values[f.field.id]=f.join?refs:refs[0]??null}else delete values[f.field.id]}
  const row:Record<string,SqlScalar>={...encodeValues(d,values,true),id:record.recordId,version:1,created_at:now,updated_at:now,lifecycle:d.schema.lifecycle.initial,schema_version:d.schema.version}
  for(const f of d.fields.values())if(f.field.type==='relation'&&!f.field.required)delete row[f.column]
  append('row',sourceId,raw.values,raw.location,{targetKind:'record:'+record.entityId,targetId:record.recordId,value:{row:row as Record<string,Json>}})
 }
 // Every relation cell, including an empty cell, has its own exact native snapshot.
 for(const record of preview.records){const d=registry.get(preview.identities.appId,record.entityId)
  for(const f of d.fields.values())if(f.field.type==='attachment'||f.field.type==='multi_select'||f.field.type==='relation'&&(f.join||!f.field.required)){
   const link=byLink.get(record.entityId+':'+record.recordId+':'+f.field.id),ids=f.field.type==='attachment'?((record.fields[f.field.id] as unknown as {reference:import('../../../contracts/primitives').StoreReference}[])??[]).map(member=>referenceValue(member.reference)):f.field.type==='multi_select'?(record.fields[f.field.id] as string[]|null)??[]:link?.targetRecordIds??[]
   if(new Set(ids).size!==ids.length||!f.join&&ids.length>1)throw new Error('Invalid native relation cardinality')
   const refs=f.field.type==='attachment'?((record.fields[f.field.id]??[]) as Json[]):f.field.type==='multi_select'?ids:ids.map(recordId=>({appId:preview.identities.appId,entityId:f.field.relation!.entityId,recordId}));validateCell(f.field,f.join?refs:refs[0]??null)
   const value:Json=f.join?{recordVersion:1,values:ids.map((value,position)=>({id:record.recordId+':'+f.field.id+':'+position,record_id:record.recordId,value,position}))}:{recordVersion:1,value:ids[0]??null}
   append('link',record.entityId+':'+record.recordId+':'+f.field.id,ids,record.location,{targetKind:'link:'+record.entityId+':'+f.field.id,targetId:record.recordId,value})
  }
 }
 // Reviewed choices are inert source evidence inside the immutable Kit plan,
 // independent of both the uploaded proposals and the native identity effects.
 if(preview.correspondenceReview){const review=preview.correspondenceReview;append('review','csv-correspondence',{fingerprint:review.fingerprint,accepted:review.accepted,options:preview.options as unknown as Json,references:review.references.map(ref=>({tableKey:ref.tableKey,rowKey:ref.rowKey,columnKey:ref.columnKey,occurrence:ref.occurrence,referenceText:ref.token,state:ref.state,targetTableKey:ref.targetTableKey,selectedRowKey:ref.selectedRowKey})),cells:review.cells} as Json,{artifact:'correspondence.json',row:1})}
 for(const effect of portableMetadataEffects(preview,now,ownerId))append(effect.targetKind,effect.targetId,effect.value,{artifact:preview.source.bundle.artifacts[0]!.name,row:1},effect)
 return {source:{records,artifacts:preview.source.bundle.artifacts,diagnostics:preview.source.bundle.diagnostics},mapping:{version:mappingVersion,map:r=>({effects:effects.get(r.kind+':'+r.sourceId)??[],...(rejections.has(r.kind+':'+r.sourceId)?{rejection:rejections.get(r.kind+':'+r.sourceId)}:{})})}}
}
