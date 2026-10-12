import type { DescriptorRegistry } from './descriptors.server'
import type { PolicyPort, PolicyScope, RequestContext } from '../authority/ports'
import type { Query, RecordRow } from './contracts'
import type { Page, Ref } from '../../contracts/primitives'
import { and, identifier, trustedPredicate } from '../admission/sql.server'
import { assertGuards } from './fence.server'
/** Incoming sections share the canonical edge and both ends' current policies. */
export async function readIncomingRelations(db:D1Database,registry:DescriptorRegistry,policy:PolicyPort,query:(ctx:RequestContext,scope:PolicyScope,q:Query)=>Promise<Page<RecordRow>>,ctx:RequestContext,scope:PolicyScope,ref:Ref){
 const target=registry.get(ref.appId,ref.entityId)
 if(scope.appId!==ref.appId||scope.entityId!==ref.entityId)throw new Error('Incoming relationship scope mismatch')
 const visibility=trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(target.table.tableId)} WHERE id=? AND (${scope.rowPredicate.sql}))`,[ref.recordId,...scope.rowPredicate.values])
 const result:{id:string;label:string;sourceEntityId:string;sourceFieldId:string;page:Page<RecordRow>}[]=[],guards=[...scope.currentAuthorityGuards,visibility]
 await assertGuards(db,guards)
 for(const incoming of registry.get(ref.appId,ref.entityId).schema.incomingRelations??[]){
  const source=registry.get(ref.appId,incoming.sourceEntityId),field=source.fields.get(incoming.sourceFieldId)
  if(field?.field.relation?.ownerAppId!==ref.appId||field.field.relation.entityId!==ref.entityId)throw new Error('Invalid incoming relationship metadata')
  let allowed:PolicyScope
  try{allowed=await policy.scope(ctx,{appId:ref.appId,entityId:incoming.sourceEntityId,purpose:'read'})}catch(error){if(error instanceof Error&&'code'in error&&['forbidden','not_found'].includes(String(error.code)))continue;throw error}
  if(!allowed.discoverableRelations.includes(incoming.sourceFieldId)||!allowed.readableFieldIds.includes(incoming.sourceFieldId))continue
  const edge=field.join?trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(field.join.table.tableId)} edge WHERE edge.record_id=${identifier(source.table.tableId)}.id AND edge.value=?)`,[ref.recordId]):trustedPredicate(`${identifier(source.table.tableId)}.${identifier(field.column)}=?`,[ref.recordId])
  result.push({...incoming,page:await query(ctx,{...allowed,rowPredicate:and(allowed.rowPredicate,edge)},{limit:200})});guards.push(...allowed.currentAuthorityGuards)
 }
 await assertGuards(db,guards)
 return result
}
