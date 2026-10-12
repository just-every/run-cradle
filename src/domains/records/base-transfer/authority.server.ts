import type { RequestContext, PolicyPort } from '../../authority/ports'
import type { SqlPredicate } from '../../admission/ports'
import type { EntitySchema } from '../contracts'
import { manualAuthority, manualOwnerGuards, manualBaseOwnerGuard } from '../manual/authority.server'
import { membershipPolicyGuard } from '../../authority/policy.server'
import { principalGuards } from '../../authority/guards.server'
import { canonical } from '../../admission/canonical'
import { AdmissionError } from '../../admission/errors'
import { bindExpression } from '../../admission/batch.server'
import { and, trustedPredicate } from '../../admission/sql.server'
import type { D1Sql } from '../../../../vendor/base/modules/import-kit/src/d1/types'

type SchemaFence={id:string;schema_json:string}
function schemaGuard(appId:string,schema:SchemaFence){return trustedPredicate('EXISTS(SELECT 1 FROM record_schemas WHERE id=? AND app_id=? AND schema_json=?)',[schema.id,appId,schema.schema_json])}
function predicate(guards:SqlPredicate[],appId:string,count:number):D1Sql {
 const p=and(...guards,trustedPredicate('(SELECT COUNT(*) FROM record_schemas WHERE app_id=?)=?',[appId,count]))
 return {sql:`EXISTS(SELECT 1 FROM (SELECT ? AS permission_values) WHERE ${bindExpression(p.sql,i=>`json_extract(permission_values,'$[${i}]')`)})`,params:[JSON.stringify(p.values)]}
}
export function authoritySize(value:D1Sql){return {sqlBytes:new TextEncoder().encode(value.sql).length,boundBytes:(value.params??[]).reduce((n,p)=>n+(typeof p==='string'?new TextEncoder().encode(p).length:8),0),parameters:value.params?.length??0}}
/** Capacity only, never runtime authorization. A fresh manual base has one policy
 * and membership at version1. Its generated policy ULID is exactly26 ASCII bytes.
 * All SQL is compiled from the production guard functions; schema bytes are the
 * actual reviewed schemas. No fake policy is loaded, evaluated or persisted. */
export function reserveNewBaseImportAuthority(ctx:RequestContext,appId:string,schemas:readonly EntitySchema[]){
 const loaded=[...principalGuards(ctx),membershipPolicyGuard(ctx,appId,{id:'0'.repeat(26),version:1,membership_version:1})]
 const permit=[...loaded,...manualOwnerGuards(ctx),manualBaseOwnerGuard(ctx,appId)]
 const guards=[...permit,manualBaseOwnerGuard(ctx,appId)]
 for(const schema of schemas)guards.push(...loaded,schemaGuard(appId,{id:schema.id,schema_json:canonical(schema)}))
 const capacityTemplate=predicate(guards,appId,schemas.length)
 return {capacityTemplate,...authoritySize(capacityTemplate)}
}
/** Fresh policy evidence is re-evaluated by the kit inside both ends of every batch. */
export async function importAuthority(db:D1Database,policy:PolicyPort,ctx:RequestContext,appId:string):Promise<D1Sql> {
 const permit=await manualAuthority(db,policy,ctx,appId,'0'.repeat(64))
 if(permit.reservationMutations.length)throw new AdmissionError('forbidden','Import requires an owner session without delegated budget effects.')
 const schemas=await db.prepare('SELECT id,schema_json FROM record_schemas WHERE app_id=?').bind(appId).all<SchemaFence>()
 const guards=[...permit.guards,manualBaseOwnerGuard(ctx,appId)]
 for(const schema of schemas.results){
  const fields=(JSON.parse(schema.schema_json) as {fields:{id:string;type:string}[]}).fields
  const scope=await policy.scope(ctx,{appId,entityId:schema.id,purpose:'read'})
  if(!scope.unrestrictedRows||fields.some(f=>!scope.readableFieldIds.includes(f.id)||f.type!=='computed'&&!scope.writableFieldIds.includes(f.id)))throw new AdmissionError('forbidden','Import requires full current row and field authority in this base.')
  guards.push(...scope.currentAuthorityGuards,schemaGuard(appId,schema))
 }
 return predicate(guards,appId,schemas.results.length)
}
