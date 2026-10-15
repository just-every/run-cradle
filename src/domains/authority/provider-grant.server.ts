import {and,or,identifier,trustedPredicate} from '../admission/sql.server'
import type {SqlPredicate} from '../admission/ports'
import type {GrantSpec,Policy} from './contracts'
import type {AuthorizationRequest,RequestContext} from './ports'
import {compileFilter,type EntityRegistry} from './scope.server'
import {policyRuleSchema} from './validators'
import {proposedRowPredicate} from './proposed-row.server'
import {denied} from './errors'

/** A persisted provider grant cannot outlive its issuer's current data authority. */
export async function providerGrantIssuerGuards(db:D1Database,registry:EntityRegistry,ctx:RequestContext,request:AuthorizationRequest,issuerId:string,spec:GrantSpec):Promise<SqlPredicate[]>{
 const row=await db.prepare(`SELECT p.id,p.version,p.rules_json,m.version AS membership_version FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=? AND m.state='active' AND p.app_id=m.app_id`).bind(issuerId,request.appId).first<{id:string;version:number;rules_json:string;membership_version:number}>()
 if(!row)return denied('The provider grant issuer no longer has application access.')
 const rules=(policyRuleSchema.array().parse(JSON.parse(row.rules_json)) as Policy['rules']).filter(r=>r.principals.some(p=>p.id===issuerId&&p.kind==='human')&&(r.purposes??['read']).includes('provider_context'))
 const guards=[trustedPredicate(`EXISTS(SELECT 1 FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=? AND m.state='active' AND m.version=? AND p.id=? AND p.version=?)`,[issuerId,request.appId,row.membership_version,row.id,row.version])],readable=new Set<string>()
 for(const grantScope of spec.scope){
  const entity=registry.get(request.appId,grantScope.entityId);if(!entity)return denied()
  const fields=(request.fieldIds??[]).filter(id=>entity.fields.some(field=>field.id===id));if(!fields.length)continue
  const applicable=rules.filter(r=>r.entityId===entity.id),allow=applicable.filter(r=>r.effect==='allow'),deny=applicable.filter(r=>r.effect==='deny')
  if(!allow.length||fields.some(id=>!allow.every(r=>r.readableFields.includes(id))||deny.some(r=>r.readableFields.includes(id))))return denied('The provider grant issuer can no longer read the disclosed fields.')
  fields.forEach(id=>readable.add(id))
  const deniedRows=or(...deny.map(r=>compileFilter(r.rows,entity,ctx.now))),rows=and(...(entity.appColumn?[trustedPredicate(`${identifier(entity.table)}.${identifier(entity.appColumn)}=?`,[request.appId])]:[]),or(...allow.map(r=>compileFilter(r.rows,entity,ctx.now))),trustedPredicate(`NOT (${deniedRows.sql})`,deniedRows.values))
  for(const target of request.expected.filter(v=>v.ref.entityId===entity.id))guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${rows.sql}))`,[target.ref.recordId,...rows.values]))
  for(const target of request.proposedRows?.filter(v=>v.entityId===entity.id)??[])guards.push(proposedRowPredicate(entity,target.row,rows))
 }
 if((request.fieldIds??[]).some(id=>!readable.has(id)))return denied('Provider fields must remain readable within the issuer grant scope.')
 return guards
}
