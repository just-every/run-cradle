import type {RequestContext,AuthorityPermit} from '../../authority/ports'
import type {AdmissionPort,SqlMutation,SqlPredicate} from '../../admission/ports'
import type {createRecordServices} from '../service.server'
import type {CellValue,Ref} from '../../../contracts/primitives'
import {AdmissionError} from '../../admission/errors'
import {and,identifier,trustedPredicate} from '../../admission/sql.server'
import {canonicalHash} from '../../admission/canonical'
import {trashContext} from './authority.server'
import {trashTable,type TrashRow} from './storage.server'

export function recordTrashService(db:D1Database,services:ReturnType<typeof createRecordServices>,admission:AdmissionPort){
 const {policy,reader,writer,descriptors}=services
 function person(ctx:RequestContext){if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||ctx.principal.credentialId)throw new AdmissionError('forbidden','A current operator session is required to restore trash.')}
 async function authority(ctx:RequestContext,row:TrashRow){
  const ref={appId:row.app_id,entityId:row.entity_id,recordId:row.record_id},scope=await policy.scope(ctx,{appId:row.app_id,entityId:row.entity_id,purpose:'read'}),d=descriptors.get(row.app_id,row.entity_id)
  if(d.writePolicy?.delete===false)throw new AdmissionError('forbidden','This record requires its typed deletion action.')
  const record=await reader.record(ctx,scope,ref),permit=await policy.authorize(ctx,{appId:row.app_id,action:'record.delete',expected:[{ref,version:record.version}],cost:[],inputHash:await canonicalHash(ref)})
  return {ref,scope,d,record,permit}
 }
 return {
  async list(ctx:RequestContext,appId:string){person(ctx);const current=trashContext(ctx),rows=await db.prepare('SELECT * FROM record_trash WHERE app_id=? ORDER BY deleted_at,entity_id,record_id LIMIT 200').bind(appId).all<TrashRow>(),items=[]
   for(const row of rows.results){try{const {d,record}=await authority(current,row),primary=record.fields[d.schema.primaryFieldId??d.schema.fields[0]!.id];items.push({kind:'record',id:row.record_id,entityId:row.entity_id,entityLabel:d.schema.label,name:primary?.state==='value'?String(primary.value??''):'Record',version:record.version,deletedAt:new Date(row.deleted_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),restorable:row.expires_at>Date.parse(ctx.now),purgeState:row.purge_state})}catch(error){if(!(error instanceof Error&&'code'in error&&['forbidden','not_found'].includes(String(error.code))))throw error}}
   return {items}
  },
  async restore(ctx:RequestContext,input:{commandId:string;appId:string;entityId:string;recordId:string;version:number}){
   person(ctx);const current=trashContext(ctx),root=await db.prepare('SELECT * FROM record_trash WHERE app_id=? AND entity_id=? AND record_id=?').bind(input.appId,input.entityId,input.recordId).first<TrashRow>()
   if(!root)throw new AdmissionError('not_found','Trashed record not found')
   const rows=await db.prepare('SELECT * FROM record_trash WHERE group_id=? ORDER BY entity_id,record_id').bind(root.group_id).all<TrashRow>(),mutations:SqlMutation[]=[],guards:SqlPredicate[]=[],restored:Ref[]=[]
   const original=await authority(current,root);if(original.record.version!==input.version)throw new AdmissionError('version_conflict','The trashed record version changed.');
   let source:AuthorityPermit|undefined=original.permit
   for(const row of rows.results){
    if(row.expires_at<=Date.parse(ctx.now))throw new AdmissionError('invalid_transition','The 30-day restore window has expired; this record is awaiting permanent purge.')
    const {ref,d,scope,record,permit}=await authority(current,row);source??=permit
    if(record.version!==row.record_version||d.schema.version!==row.schema_version)throw new AdmissionError('version_conflict','The record or table schema changed after deletion; restore would overwrite a newer state.')
    if(!d.schema.lifecycle.states.includes(row.prior_lifecycle))throw new AdmissionError('schema_conflict','The prior record state is no longer available.')
    guards.push(...scope.currentAuthorityGuards,...permit.guards,trustedPredicate('EXISTS(SELECT 1 FROM record_trash WHERE app_id=? AND entity_id=? AND record_id=? AND record_version=? AND expires_at>?)',[row.app_id,row.entity_id,row.record_id,row.record_version,Date.parse(ctx.now)]))
    // Validate every retained outgoing link before changing any row.
    for(const [fieldId,storage] of d.fields)if(storage.field.type==='relation'){
     const cell=record.fields[fieldId];if(cell?.state!=='value')throw new AdmissionError('forbidden','A retained link is no longer readable.')
     for(const target of (Array.isArray(cell.value)?cell.value:cell.value?[cell.value]:[]) as Ref[]){const targetScope=await policy.scope(current,{appId:target.appId,entityId:target.entityId,purpose:'read'});if(!await reader.raw(current,targetScope,target))throw new AdmissionError('version_conflict','A retained link target was purged or is no longer available.');guards.push(...targetScope.currentAuthorityGuards)}
    }
    for(const link of JSON.parse(row.links_json) as {ref:Ref;fieldId:string;version:number;value:CellValue}[]){const linkedScope=await policy.scope(current,{appId:link.ref.appId,entityId:link.ref.entityId,purpose:'read'}),prepared=await writer.prepareChange(current,linkedScope,{ref:link.ref,expectedVersion:link.version,changes:{[link.fieldId]:link.value}}),allowed=await policy.authorize(current,{appId:link.ref.appId,action:'record.patch',expected:[{ref:link.ref,version:link.version}],fieldIds:[link.fieldId],cost:[],inputHash:await canonicalHash(link)});guards.push(...prepared.guards,...allowed.guards);mutations.push(...prepared.mutations)}
    mutations.push({kind:'update',table:d.table,set:{[d.lifecycleColumn]:row.prior_lifecycle,[d.versionColumn]:record.version+1,[d.updatedColumn]:ctx.now},where:trustedPredicate(`${identifier(d.idColumn)}=? AND ${identifier(d.versionColumn)}=? AND ${identifier(d.lifecycleColumn)}='deleted'`,[row.record_id,record.version]),expectedRows:1},{kind:'delete',table:trashTable,where:trustedPredicate('app_id=? AND entity_id=? AND record_id=? AND record_version=?',[row.app_id,row.entity_id,row.record_id,row.record_version]),expectedRows:1});restored.push(ref)
   }
   if(!source)throw new AdmissionError('not_found','Trash group not found')
   return admission.commit(ctx,{commandId:input.commandId,action:'record.restore',appId:root.app_id,canonicalInputHash:await canonicalHash(input),permit:{...source,action:'record.restore'},guards,mutations,audit:restored.map(subject=>({action:'record.restore',subject,changes:[],sourceIds:[],personalContentRefs:[]})),events:[],outbox:[],committedResult:{restored}})
  },
 }
}
