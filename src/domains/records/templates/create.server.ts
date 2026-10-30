import type { CellValue, CommandInput, Ref } from '../../../contracts/primitives'
import type { RequestContext } from '../../authority/ports'
import type { AdmissionPlan, SqlPredicate } from '../../admission/ports'
import type { PreparedAttachmentCopy, RecordAttachmentPort } from '../attachments.server'
import type { TemplateDependencies } from './snapshot.server'
import { createUlid } from '../../../core/shared/ids'
import { canonicalHash } from '../../admission/canonical'
import { AdmissionError } from '../../admission/errors'
import { RECORD_SCHEMA_ENTITY_ID, RECORD_FORM_ENTITY_ID } from '../contracts'
import { and,eq,exists,trustedPredicate } from '../../admission/sql.server'
import { referenceValue } from '../store-references'

export type TemplateCreateRow = {entityId:string;values:Record<string,CellValue>;sourceRef:Ref;parentFieldId?:string}
export function templateCreatePlanner(db:D1Database,deps:TemplateDependencies,attachments?:RecordAttachmentPort){
 return async function prepare(ctx:RequestContext,command:CommandInput<unknown>,action:string,appId:string,rows:TemplateCreateRow[],guards:SqlPredicate[]=[]):Promise<AdmissionPlan<unknown>>{
  const parent=deps.descriptors.get(appId,rows[0]!.entityId)
  if(!command.expected.some(e=>e.ref.appId===appId&&e.ref.entityId===RECORD_SCHEMA_ENTITY_ID&&e.ref.recordId===parent.schema.id&&e.version===parent.schema.version))throw new AdmissionError('schema_conflict','Current schema version required.')
  const hash=await canonicalHash({action,input:command.input,expected:command.expected,controlEpoch:command.controlEpoch??null})
  const pending=rows.map(row=>({appId,entityId:row.entityId,recordId:createUlid()})),prepared=[],permits=[],copies:PreparedAttachmentCopy[]=[]
  try{
   for(const expected of command.expected){
    if([RECORD_SCHEMA_ENTITY_ID,RECORD_FORM_ENTITY_ID,'00000000000000000000000004'].includes(expected.ref.entityId))continue
    const d=deps.descriptors.get(expected.ref.appId,expected.ref.entityId),scope=await deps.policy.scope(ctx,{...expected.ref,purpose:'read'}),record=await deps.reader.record(ctx,scope,expected.ref)
    if(record.version!==expected.version||['deleted','archived'].includes(record.lifecycle))throw new AdmissionError('version_conflict','An expected record changed.')
    guards.push(...scope.currentAuthorityGuards,exists(d.table,and(scope.rowPredicate,eq(d.table,d.idColumn,expected.ref.recordId),eq(d.table,d.versionColumn,expected.version))))
   }
   for(const [index,input]of rows.entries()){
    const descriptor=deps.descriptors.get(appId,input.entityId),scope=await deps.policy.scope(ctx,{appId,entityId:input.entityId,purpose:'read'}),ref=pending[index]!,values:Record<string,CellValue>={},verified=new Map<string,readonly SqlPredicate[]>()
    for(const [id,value]of Object.entries(input.values)){
     const field=descriptor.fields.get(id)?.field
     if(!field)throw new AdmissionError('schema_conflict','A template field is no longer available.')
     if(field.readOnly||field.type==='computed'||descriptor.writePolicy?.protectedFieldIds?.includes(id)||!scope.writableFieldIds.includes(id))continue
     values[id]=structuredClone(value)
     if(field.type==='person'&&value!==null){
      const guard=trustedPredicate('EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1)',[String(value)])
      if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new AdmissionError('validation','Preset person is unavailable.')
      guards.push(guard)
     }
     if(field.type==='attachment'&&Array.isArray(value)){
      const members=[]
      for(const member of value){
       if(member&&typeof member==='object'&&'fileId'in member){
        if(!attachments?.prepareCopy)throw new AdmissionError('unconfigured','Attachment copying is unavailable.')
        const copy=await attachments.prepareCopy(ctx,String(member.fileId),input.sourceRef,ref,id);copies.push(copy);verified.set('file:'+copy.fileId,copy.guards);members.push({fileId:copy.fileId})
       }else if(member&&typeof member==='object'&&'reference'in member){
        // Existing references retain their captured custody. Copying never reconnects
        // or fetches a provider, and still requires the original record's authority.
        const proof=await deps.reader.projectCell(ctx,scope,input.sourceRef,id,{state:'value',value:[member]})
        if(proof.state!=='value'||!Array.isArray(proof.value)||proof.value.length!==1)throw new AdmissionError('forbidden','Preset attachment is unavailable.')
        verified.set(referenceValue(member.reference),[]);members.push(member)
       }
      }
      values[id]=members
     }
    }
    if(input.parentFieldId){
     const field=descriptor.fields.get(input.parentFieldId)?.field
     if(field?.type!=='relation'||field.relation?.ownerAppId!==appId||field.relation.entityId!==parent.schema.id||!scope.writableFieldIds.includes(field.id))throw new AdmissionError('forbidden','The child parent link is not writable.')
     values[field.id]=field.relation.cardinality==='many'?[pending[0]!]:pending[0]!
    }
    const change=await deps.writer.prepareCreate(ctx,scope,values,ref.recordId,{pending,verified})
    const insertion=change.mutations.find(m=>m.kind==='insert'&&m.table.tableId===descriptor.table.tableId)
    if(!insertion||insertion.kind!=='insert')throw new AdmissionError('internal','Template insertion is missing.')
    permits.push(await deps.policy.authorize(ctx,{appId,action:'record.create',targetEntityId:input.entityId,expected:[],proposedRows:[{entityId:input.entityId,row:insertion.row}],fieldIds:change.audit.flatMap(f=>f.changes.map(c=>c.fieldId)),cost:[],inputHash:hash,commandId:command.commandId}))
    prepared.push(change)
   }
   const permit=permits[0]!
   return {commandId:command.commandId,appId,action,canonicalInputHash:hash,permit:{...permit,action},guards:[...guards,...prepared.flatMap(p=>p.guards),...permits.slice(1).flatMap(p=>p.guards),...copies.flatMap(c=>c.guards)],mutations:[...copies.flatMap(c=>c.mutations),...prepared.flatMap(p=>p.mutations),...permits.slice(1).flatMap(p=>p.reservationMutations)],audit:prepared.flatMap(p=>p.audit),events:[],outbox:[],changed:prepared.map(p=>({ref:p.next.ref,version:p.next.version})),committedResult:prepared[0]!.next,
    ...(copies.length?{async commitAtomic(statements){try{await db.batch(statements.map(s=>db.prepare(s.sql).bind(...s.values)))}catch(error){await Promise.all(copies.map(c=>c.discard()));throw error}}}:{})}
  }catch(error){await Promise.all(copies.map(c=>c.discard()));throw error}
 }
}
