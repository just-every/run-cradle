import {canonical} from '../../admission/canonical'
import {validateCell} from '../validators'
import {auditOperation} from '../../admission/operation-audit.server'
import type {RequestContext} from '../../authority/ports'
import type {createRecordServices} from '../service.server'
import type {PortableBase} from './json-format'
import type {Filter,View} from '../contracts'
import {AdmissionError} from '../../admission/errors'
import {assertGuards} from '../fence.server'
import {trustedPredicate,and,identifier} from '../../admission/sql.server'
import {portableField,portableValue} from './export-json.server'
import {exportStoreCell} from './export-store.server'
import {exportIndex} from './export-index'
import {encodeCsvRecord} from '../../portability/csv'

export type PortableTable=PortableBase['base']['tables'][number]
export type PortableRecord=PortableTable['records'][number]
/** A complete export keeps schema and one authorized page, never a raw-table snapshot. */
export async function prepareBaseStream(db:D1Database,services:ReturnType<typeof createRecordServices>,ctx:RequestContext,appId:string){
 const {descriptors,policy,reader,metadata}=services
 const base=await db.prepare('SELECT name,version,release_id FROM manual_record_bases WHERE id=?').bind(appId).first<{name:string;version:number;release_id:string}>()
 if(!base)throw new AdmissionError('not_found','Base export is available for records-builder bases.')
 const release=await db.prepare('SELECT detail_json FROM manual_record_releases WHERE id=? AND app_id=?').bind(base.release_id,appId).first<{detail_json:string}>()
 if(!release)throw new AdmissionError('schema_conflict','Base schema order is unavailable.')
 const schemas=(JSON.parse(release.detail_json) as {schemas:{id:string}[]}).schemas,ordered=schemas.map(schema=>descriptors.get(appId,schema.id))
 if(!ordered.length||new Set(schemas.map(s=>s.id)).size!==schemas.length)throw new AdmissionError('schema_conflict','Base schema order changed.')
 const revision=await reader.revision(),guards=[trustedPredicate('EXISTS(SELECT 1 FROM manual_record_bases WHERE id=? AND name=? AND version=? AND release_id=?)',[appId,base.name,base.version,base.release_id])]
 const scopes=new Map<string,Awaited<ReturnType<typeof policy.scope>>>()
 for(const d of ordered){const scope=await policy.scope(ctx,{appId,entityId:d.schema.id,purpose:'export'});if(!scope.unrestrictedRows||d.schema.fields.some(f=>!scope.readableFieldIds.includes(f.id)))throw new AdmissionError('forbidden','A complete base export requires export access to every row and field in every table.');scopes.set(d.schema.id,scope);guards.push(...scope.currentAuthorityGuards);for(const field of d.schema.fields)if(field.relation?.ownerAppId&&field.relation.ownerAppId!==appId)throw new AdmissionError('forbidden','A base export cannot include a relationship to another base.')}
 // Preserve the existing immediate refusal even when attachment projection
 // hides an unavailable uploaded file. The existence probe retains no rows.
 for(const d of ordered)for(const storage of d.fields.values())if(storage.field.type==='attachment'&&storage.join){
  const join=storage.join,invalid=await db.prepare(`SELECT 1 FROM ${identifier(join.table.tableId)} WHERE typeof(${identifier(join.valueColumn)})<>'text' OR substr(${identifier(join.valueColumn)},1,1)<>'{' LIMIT 1`).first()
  if(invalid)throw new AdmissionError('validation',`${storage.field.label}: uploaded attachment bytes have no base JSON representation.`)
 }
 async function check(){await assertGuards(db,guards);if(await reader.revision()!==revision)throw new AdmissionError('version_conflict','Records changed during base export. Export again.')}
 const tables:PortableTable[]=ordered.map(d=>{const schema=d.schema as typeof d.schema&{incomingRelations?:PortableTable['incomingRelations']};return {id:schema.id,label:schema.label,primaryFieldId:schema.primaryFieldId??schema.fields[0]!.id,fields:schema.fields.map(field=>portableField(field,schema,descriptors)),incomingRelations:structuredClone(schema.incomingRelations??[]),...(schema.validationRules?{validationRules:structuredClone(schema.validationRules)}:{}),records:[]}})
 const views:PortableBase['base']['views']=[],forms:PortableBase['base']['forms']=[]
 for(const kind of ['record_views','record_forms'] as const){
  const entries=await db.prepare(`SELECT id,definition_json FROM ${kind} WHERE app_id=? AND deleted_at IS NULL ${kind==='record_views'?"AND visibility<>'deleted'":''} ORDER BY id`).bind(appId).all<{id:string;definition_json:string}>()
  for(const entry of entries.results){
   if(kind==='record_views'){
    const view=await metadata.readView(ctx,entry.id),stored=JSON.parse(entry.definition_json) as View
    const baseline=stored.timelineBaseline
    const baselineRecords:NonNullable<View['timelineBaseline']>['records']=[]
    if(view.display==='timeline'&&baseline&&baseline.startFieldId===view.layout.startFieldId&&baseline.endFieldId===view.layout.endFieldId){for(const record of baseline.records)if(await reader.raw(ctx,scopes.get(view.entityId)!,{appId,entityId:view.entityId,recordId:record.recordId}))baselineRecords.push(record)}
    views.push({id:view.id,tableId:view.entityId,name:view.name,display:view.display,fields:[...view.fields],filter:structuredClone(view.filter) as Filter,sort:view.sort.map(s=>({fieldId:s.fieldId,direction:s.direction})),groupBy:[...view.groupBy],layout:{...view.layout},...(view.timelineZoom?{timelineZoom:view.timelineZoom}:{}),...(view.display==='timeline'&&baseline&&baseline.startFieldId===view.layout.startFieldId&&baseline.endFieldId===view.layout.endFieldId?{timelineBaseline:{...baseline,records:baselineRecords}}:{}),...(view.coverFit?{coverFit:view.coverFit}:{}),visibility:view.visibility,...(view.position!==undefined?{position:view.position}:{}),...(view.locked!==undefined?{locked:view.locked}:{}),...(view.summaries?{summaries:structuredClone(view.summaries)}:{}),...(view.formatting?{formatting:structuredClone(view.formatting)}:{})})
   }else{const form=await metadata.readForm(ctx,entry.id);if(form.submitAction!=='record.create')throw new AdmissionError('validation','A source-mapped form cannot be exported as a portable base form.');forms.push({id:form.id,tableId:form.entityId,title:form.title,fields:structuredClone(form.fields),submitAction:'record.create',authenticated:true})}
  }
 }
 const snapshot:PortableBase={format:'cradle-base',version:1,envelope:{capturedAt:ctx.now},base:{id:appId,name:base.name,tables,views,forms}}
 async function* rows(table:PortableTable):AsyncGenerator<PortableRecord>{
  let cursor:string|undefined
  do{
   await check();const pageCtx={...ctx,now:new Date().toISOString()},scope=await policy.scope(pageCtx,{appId,entityId:table.id,purpose:'export'}),original=scopes.get(table.id)!
   if(!scope.unrestrictedRows||scope.policyVersion!==original.policyVersion||table.fields.some(f=>!scope.readableFieldIds.includes(f.id)))throw new AdmissionError('forbidden','Base export authority changed. Export again.')
   const page=await reader.query(pageCtx,scope,{fields:table.fields.map(f=>f.id),includeArchived:true,limit:50,cursor},'export'),records:PortableRecord[]=[]
   for(const row of page.items){if(row.lifecycle!=='active')throw new AdmissionError('validation','This base contains a lifecycle state not represented by base JSON.');const values:PortableRecord['values']={},calculationErrors:NonNullable<PortableRecord['calculationErrors']>={}
    for(const field of descriptors.get(appId,table.id).schema.fields){const cell=row.fields[field.id];if(cell?.state==='unavailable'&&field.type==='computed'){const {state,...error}=cell;calculationErrors[field.id]=error;values[field.id]=null;continue}if(cell?.state!=='value')throw new AdmissionError('forbidden','A base export contains a restricted or unavailable value.');
     if(!['relation','attachment'].includes(field.type)&&!(field.type==='computed'&&field.resultType==='array')){const native=field.type==='computed'&&field.resultType&&field.resultType!=='array'?{...field,type:field.resultType,required:false}:field;if(canonical(validateCell(native,cell.value))!==canonical(cell.value))throw new AdmissionError('validation',`${field.label}: value is not canonical.`)}
     values[field.id]=field.type==='attachment'?await exportStoreCell(db,field.label,cell.value):portableValue(field,cell.value)}
    records.push({id:row.id,values,...(Object.keys(calculationErrors).length?{calculationErrors}:{})})
   }
   await check();await assertGuards(db,scope.currentAuthorityGuards)
   for(const record of records)yield record
   cursor=page.nextCursor??undefined
  }while(cursor)
 }
 const scalar=exportIndex(snapshot.base).scalar
 async function primary(tableId:string,recordId:string){const table=tables.find(t=>t.id===tableId);if(!table)throw new AdmissionError('validation','Linked table is not in the exported base.');const raw=await reader.raw(ctx,scopes.get(tableId)!,{appId,entityId:tableId,recordId});if(!raw)throw new AdmissionError('version_conflict','A linked record changed during export.');const d=descriptors.get(appId,tableId),rendered=await reader.render(ctx,scopes.get(tableId)!,d,raw,[table.primaryFieldId],new Set(),'export'),cell=rendered.fields[table.primaryFieldId];if(cell?.state!=='value')throw new AdmissionError('forbidden','Linked primary value is unavailable.');return scalar(table.fields.find(f=>f.id===table.primaryFieldId)!,cell.value)}
 function fields(table:PortableTable){return [table.fields.find(f=>f.id===table.primaryFieldId)!,...table.fields.filter(f=>f.id!==table.primaryFieldId)]}
 function headers(table:PortableTable){const used=new Set<string>();return [...fields(table).map(f=>f.label),...table.incomingRelations.map(i=>i.label)].map(label=>{let result=label,n=2;while(used.has(result))result=`${label} (${n++})`;used.add(result);return result})}
 async function displayed(table:PortableTable,row:PortableRecord){
  const values:string[]=[],references:{columnId:string;targetTableId:string;targetRecordId:string;referenceText:string;occurrence:number}[]=[]
  const list=(items:string[])=>items.map(item=>'"'+item.replaceAll('"','""')+'"').join(',')
  for(const field of fields(table)){
   if(!field.relation){values.push(scalar(field,row.values[field.id]));continue}
   const value=row.values[field.id],ids=value===null?[]:Array.isArray(value)?value:[value],labels:string[]=[]
   for(const [occurrence,id]of ids.entries()){const referenceText=await primary(field.relation.tableId,String(id));labels.push(referenceText);references.push({columnId:field.id,targetTableId:field.relation.tableId,targetRecordId:String(id),referenceText,occurrence})}values.push(list(labels))
  }
  for(const incoming of table.incomingRelations){
   const d=descriptors.get(appId,incoming.sourceEntityId),field=d.fields.get(incoming.sourceFieldId)!,source=tables.find(t=>t.id===incoming.sourceEntityId)!,sourcePrimary=source.fields.find(f=>f.id===source.primaryFieldId)!,scope=scopes.get(incoming.sourceEntityId)!,labels:string[]=[];let cursor:string|undefined
   const edge=field.join?trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(field.join.table.tableId)} edge WHERE edge.record_id=${identifier(d.table.tableId)}.${identifier(d.idColumn)} AND edge.value=?)`,[row.id]):trustedPredicate(`${identifier(d.table.tableId)}.${identifier(field.column)}=?`,[row.id]),restricted={...scope,rowPredicate:and(scope.rowPredicate,edge)}
   do{const page=await reader.query(ctx,restricted,{fields:[source.primaryFieldId],limit:200,cursor},'export');for(const record of page.items){const cell=record.fields[source.primaryFieldId];if(cell?.state!=='value')throw new AdmissionError('forbidden','An incoming linked primary value is unavailable.');const referenceText=scalar(sourcePrimary,cell.value);references.push({columnId:incoming.id,targetTableId:incoming.sourceEntityId,targetRecordId:record.id,referenceText,occurrence:labels.length});labels.push(referenceText)}cursor=page.nextCursor??undefined}while(cursor)
   values.push(list(labels))
  }
  return {values,references}
 }
 async function* csv(table:PortableTable){const encoder=new TextEncoder();yield encoder.encode(encodeCsvRecord(headers(table)));for await(const row of rows(table)){const display=await displayed(table,row);yield encoder.encode(encodeCsvRecord(display.values))}await check()}
 await check()
 await auditOperation(db,ctx,'base.export',appId)
 return {snapshot,rows,check,fields,headers,displayed,csv,scalar}
}
export type BaseStreamSource=Awaited<ReturnType<typeof prepareBaseStream>>
