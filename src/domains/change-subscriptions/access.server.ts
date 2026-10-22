import type {RequestContext,PolicyPort,PolicyScope} from '../authority/ports'
import type {createRecordServices} from '../records/service.server'
import {AuthorityError} from '../authority/errors'
import {assertCurrentScopeAuthority} from '../authority/guards.server'
import {matchesFilter} from '../records/evaluated-query'
import type {Ref,Cell} from '../../contracts/primitives'
import type {ChangeItem} from './schema'
import {restoredCells} from './restore.server'
import type {Subscription,Change} from './storage.server'

export function subscriptionAccess(db:D1Database,policy:PolicyPort,services:ReturnType<typeof createRecordServices>){
 async function key(ctx:RequestContext){
  const row=ctx.principal.credentialId&&await db.prepare("SELECT issuer_id FROM authority_delegations WHERE principal_id=? AND kind='api-key' AND revoked_at IS NULL").bind(ctx.principal.id).first<{issuer_id:string}>()
  if(!row)throw new AuthorityError('forbidden','A current scoped user API key is required.')
  return row
 }
 async function scopes(ctx:RequestContext,scope:{app_id:string;entity_id:string|null;view_id:string|null}){
  await key(ctx)
  const view=scope.view_id?await services.metadata.readView(ctx,scope.view_id):null
  if(view&&(view.appId!==scope.app_id||scope.entity_id&&view.entityId!==scope.entity_id))throw new AuthorityError('validation','View does not belong to this scope.',400)
  const entityId=view?.entityId??scope.entity_id
  const candidates=services.descriptors.list().filter(d=>d.schema.appId===scope.app_id&&(!entityId||d.schema.id===entityId)),allowed:PolicyScope[]=[]
  for(const d of candidates){try{const current=await policy.scope(ctx,{appId:scope.app_id,entityId:d.schema.id,purpose:'read'});await assertCurrentScopeAuthority(db,ctx,current);allowed.push(current)}catch(error){if(entityId||!(error instanceof Error&&'code'in error&&['forbidden','not_found'].includes(String(error.code))))throw error}}
  if(!allowed.length)throw new AuthorityError('forbidden','The API key cannot read this scope.')
  return {scopes:allowed,view}
 }
 async function project(ctx:RequestContext,subscription:Subscription,change:Change):Promise<ChangeItem|{kind:'resync_required'}|null>{
  const ref=JSON.parse(change.subject_json) as Ref|null
  if(!ref)return change.action==='record.delete'?{kind:'resync_required'}:null
  if(ref.appId!==subscription.app_id||subscription.entity_id&&ref.entityId!==subscription.entity_id)return null
  const access=await scopes(ctx,subscription),scope=access.scopes.find(s=>s.entityId===ref.entityId)
  if(access.view&&ref.entityId!==access.view.entityId)return null
  if(change.action==='record.delete'){
   // No tombstone identity crosses a policy we cannot establish on a deleted row.
   // This scope-level sentinel is collapsed to one range marker by the fetch door.
   if(!scope||!scope.unrestrictedRows||access.view)return {kind:'resync_required'}
   return {id:change.id,sequence:change.change_sequence,kind:'delete',recordId:ref.recordId}
  }
  if(!scope||!['record.create','record.patch','record.undo','record.restore'].includes(change.action))return null
  const restoring=change.action==='record.restore'
  const retained=JSON.parse(change.changes_json) as {fieldId:string;before:Cell;after:Cell}[]
  if(!restoring&&!retained.some(c=>JSON.stringify(c.before)!==JSON.stringify(c.after)))return null
  try{
   const current=await services.reader.record(ctx,scope,ref)
   if(access.view){const descriptor=services.descriptors.get(ref.appId,ref.entityId),numeric=new Set(descriptor.schema.fields.filter(f=>['number','currency','percent','duration'].includes(f.type)).map(f=>f.id));if(!matchesFilter(current,access.view.filter,numeric,ctx.now))return null}
   // Keep restore values at their commit while current authority still narrows
   // every fetch and ordinary relation/file projection protects retained cells.
   const changes=restoring?await restoredCells(db,ref,change.change_sequence):retained
   const fields=changes.filter(c=>scope.readableFieldIds.includes(c.fieldId)&&(!access.view||access.view.fields.includes(c.fieldId)))
   if(!fields.length&&!restoring)return null
   const projected=await Promise.all(fields.map(async c=>({fieldId:c.fieldId,before:await services.reader.projectCell(ctx,scope,ref,c.fieldId,c.before),after:await services.reader.projectCell(ctx,scope,ref,c.fieldId,c.after)})))
   await assertCurrentScopeAuthority(db,ctx,scope)
   return {id:change.id,sequence:change.change_sequence,kind:restoring?'restore':change.action==='record.create'?'create':'update',recordId:ref.recordId,entityId:ref.entityId,changes:projected}
  }catch(error){if(error instanceof Error&&'code'in error&&['forbidden','not_found'].includes(String(error.code)))return null;throw error}
 }
 return {key,scopes,project}
}
