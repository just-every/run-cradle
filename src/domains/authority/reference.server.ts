import type { Ref } from '../../contracts/primitives'
import type { PolicyPort, RequestContext } from './ports'
import type { EntityRegistry } from './scope.server'
import { and, identifier } from '../admission/sql.server'
import { denied } from './errors'
export const createReferenceAccess=(db:D1Database,policy:PolicyPort,registry:EntityRegistry)=>async(ctx:RequestContext,ref:Ref,fieldIds:readonly string[],purpose:'read'|'export'|'provider_context')=>{
  const scope=await policy.scope(ctx,{appId:ref.appId,entityId:ref.entityId,purpose}),entity=registry.get(ref.appId,ref.entityId)
  if(!entity||!fieldIds.every(f=>scope.readableFieldIds.includes(f)))return denied()
  const where=and(scope.rowPredicate,...scope.currentAuthorityGuards)
  const row=await db.prepare(`SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${where.sql})`).bind(ref.recordId,...where.values).first()
  if(!row)return denied()
  return scope
}
