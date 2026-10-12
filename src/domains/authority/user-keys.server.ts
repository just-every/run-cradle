import { issueUserCredential } from './user-credential.server'
import type { RequestContext, PolicyPort } from './ports'
import type { AdmissionPort, SqlMutation } from '../admission/ports'
import { registerTable, trustedPredicate, and } from '../admission/sql.server'
import { createMachineService } from './machine.server'
import { userDelegationPolicy, type DelegationInput } from './user-delegation.server'
import { AuthorityError } from './errors'
import { ownerDelegationSnapshot } from './delegation.server'
import { principalGuards } from './guards.server'

const bindings=registerTable('authority_delegations',['principal_id','grant_id','revoked_at'])
const principals=registerTable('authority_principals',['id','authentication_epoch','version','updated_at'])

export function createUserKeyService(db:D1Database,ordinary:PolicyPort,admission:AdmissionPort,appOrigin:string) {
 return {
  issue:(ctx:RequestContext,commandId:string,input:DelegationInput)=>issueUserCredential(db,ordinary,admission,appOrigin,ctx,commandId,input,'api-key'),

  async list(ctx:RequestContext,appId:string) {
   const own=await ownerDelegationSnapshot(db,ctx,appId),guard=and(...principalGuards(ctx),own.guard)
   const rows=await db.prepare(`SELECT c.id,d.label AS name,d.created_at,c.expires_at,c.revoked_at,
    d.revoked_at AS delegation_revoked,c.scopes_json,p.rules_json
    FROM authority_delegations d JOIN authority_credentials c ON c.principal_id=d.principal_id
    JOIN authority_memberships m ON m.principal_id=d.principal_id AND m.app_id=d.app_id
    JOIN authority_policies p ON p.id=m.policy_id
    WHERE d.app_id=? AND d.issuer_id=? AND d.kind='api-key' AND (${guard.sql}) ORDER BY d.created_at DESC LIMIT 100`)
    .bind(appId,ctx.principal.id,...guard.values).all<{id:string;name:string;created_at:number;expires_at:number;revoked_at:number|null;delegation_revoked:number|null;scopes_json:string;rules_json:string}>()
   return rows.results.map(row=>({id:row.id,name:row.name,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),
    revokedAt:row.revoked_at===null&&row.delegation_revoked===null?null:new Date(row.revoked_at??row.delegation_revoked!).toISOString(),
    scopes:JSON.parse(row.scopes_json),entityIds:[...new Set((JSON.parse(row.rules_json) as {entityId:string}[]).map(rule=>rule.entityId))]}))
  },
  async revoke(ctx:RequestContext,commandId:string,appId:string,id:string) {
   const row=await db.prepare(`SELECT d.principal_id,p.authentication_epoch,p.version,policy.rules_json,c.expires_at
    FROM authority_credentials c JOIN authority_delegations d ON d.principal_id=c.principal_id
    JOIN authority_principals p ON p.id=d.principal_id
    JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=d.app_id
    JOIN authority_policies policy ON policy.id=m.policy_id
    WHERE c.id=? AND d.app_id=? AND d.issuer_id=? AND d.kind='api-key'`)
    .bind(id,appId,ctx.principal.id).first<{principal_id:string;authentication_epoch:number;version:number;rules_json:string;expires_at:number}>()
   if(!row)throw new AuthorityError('not_found','API key not found.',404)
   const entityId=(JSON.parse(row.rules_json) as {entityId:string}[])[0]!.entityId
   const own=await userDelegationPolicy(db,ordinary,ctx,{appId,entityId,name:'Revocation',permissions:'read',expiresAt:new Date(row.expires_at).toISOString()})
   const service=createMachineService(db,own.policy,admission,async()=>({guards:own.guards,mutations:[
    {kind:'update',table:bindings,set:{revoked_at:Date.parse(ctx.now)},where:trustedPredicate('principal_id=? AND revoked_at IS NULL',[row.principal_id]),expectedRows:1},
    {kind:'update',table:principals,set:{authentication_epoch:row.authentication_epoch+1,version:row.version+1,updated_at:Date.parse(ctx.now)},
     where:trustedPredicate('id=? AND version=? AND authentication_epoch=?',[row.principal_id,row.version,row.authentication_epoch]),expectedRows:1},
   ] as SqlMutation[]}))
   return service.revoke(ctx,commandId,appId,id)
  },
 }
}
