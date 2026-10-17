import { ImportInputError } from './input-error'
import { Buffer } from 'node:buffer'
import { createUlid } from '../../../core/shared/ids'
import { parsePortableBase } from './json-validation'
import type { PortableBase } from './json-format'
import type { PreparedSource,ImportIdentities,UploadedArtifact } from './contracts'
import type { Json } from '../../../../vendor/base/modules/import-kit/src/types'
import { canonical,hash } from './format'
/** Original JSON bytes remain an artifact; parsed portable records remain source provenance. */
export function prepareJsonSource(artifact:UploadedArtifact):PreparedSource {
 let snapshot:PortableBase;try{snapshot=parsePortableBase(artifact.bytes)}catch(error){throw new ImportInputError(`${artifact.filename}: ${error instanceof Error?error.message:'Invalid base JSON'}`)}
 const namespace='cradle-base-v1',sha256=hash(artifact.bytes)
 return {format:'cradle-base-v1',namespace,portableBase:snapshot as unknown as Json,bundle:{artifacts:[{name:artifact.filename,sha256,size:artifact.bytes.length,original:{status:'available',base64:Buffer.from(artifact.bytes).toString('base64')}}],diagnostics:[],records:snapshot.base.tables.flatMap(table=>table.records.map((row,index)=>({namespace,kind:table.id,sourceId:row.id,payload:row as unknown as Json,payloadHash:hash(canonical(row)),artifactHash:sha256,location:{artifact:artifact.filename,row:index+1}})))},tables:snapshot.base.tables.map(table=>({key:table.id,label:table.label,primaryColumnKey:table.primaryFieldId,columns:table.fields.map(field=>({key:field.id,label:field.label,sourceType:field.type,...(field.options?{options:field.options.map(o=>o.label)}:{}),...(field.relation?{relationTableKey:field.relation.tableId}:{}),...(field.lookup?{lookup:{relationColumnKey:field.lookup.relationFieldId,valueColumnKey:field.lookup.valueFieldId}}:{})})),rows:table.records.map((row,index)=>({key:row.id,values:row.values,location:{artifact:artifact.filename,row:index+1}}))}))}
}
/** Called only after read-only collision preflight; either preserve every ID or replace every ID. */
export function allocateJsonIdentities(snapshot:PortableBase,mode:'preserve'|'copy'):ImportIdentities {
 const allocate=(id:string)=>mode==='preserve'?id:createUlid(),ids:ImportIdentities={appId:allocate(snapshot.base.id),tables:{},views:{},forms:{},incomingRelations:{},validationRules:{}}
 for(const table of snapshot.base.tables){for(const rule of table.validationRules??[])ids.validationRules![rule.id]=allocate(rule.id);ids.tables[table.id]={entityId:allocate(table.id),fields:Object.fromEntries(table.fields.map(f=>[f.id,allocate(f.id)])),records:Object.fromEntries(table.records.map(r=>[r.id,allocate(r.id)])),options:Object.fromEntries(table.fields.filter(f=>(f.type==='select'||f.type==='multi_select')).map(f=>[f.id,Object.fromEntries(f.options!.map(o=>[o.label,allocate(o.id)]))]))};for(const incoming of table.incomingRelations)ids.incomingRelations![incoming.id]=allocate(incoming.id)}
 for(const view of snapshot.base.views)ids.views![view.id]=allocate(view.id);for(const form of snapshot.base.forms)ids.forms![form.id]=allocate(form.id)
 return ids
}
