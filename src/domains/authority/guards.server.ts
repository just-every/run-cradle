import { and, trustedPredicate } from '../admission/sql.server'
import type { PolicyScope, RequestContext } from './ports'
import { denied } from './errors'
import { delegationGuard } from './delegation.server'
import { proposerAuthentication, proposerGuard } from './proposer.server'
import { agentPrincipalGuards } from './agent-admission.server'
export const principalGuards=(ctx:RequestContext)=>{
  const p=ctx.principal,now=Date.parse(ctx.now)
  if(!Number.isFinite(now)||Date.parse(p.expiresAt)<=now)return denied('Authentication has expired.')
  const result=[trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND kind=? AND state='active' AND authentication_epoch=?)`,[p.id,p.kind,p.authenticationEpoch])]
  if(p.sessionId)result.push(trustedPredicate(`EXISTS(SELECT 1 FROM authority_sessions WHERE id=? AND principal_id=? AND revoked_at IS NULL AND authentication_epoch=? AND expires_at>MAX(?,unixepoch('subsec')*1000) AND last_seen_at>MAX(?,unixepoch('subsec')*1000-2592000000))`,[p.sessionId,p.id,p.authenticationEpoch,now,now-2592000000]))
  else if(p.credentialId)result.push(trustedPredicate(`EXISTS(SELECT 1 FROM authority_credentials WHERE id=? AND principal_id=? AND authentication_epoch=? AND revoked_at IS NULL AND expires_at>MAX(?,unixepoch('subsec')*1000))`,[p.credentialId,p.id,p.authenticationEpoch,now]))
  else if(p.viaProposer)result.push(...proposerAuthentication(p.viaProposer,now))
  else if(!agentPrincipalGuards(p))return denied('A current session or scoped credential is required.')
  result.push(...agentPrincipalGuards(p)??[])
  if(p.baseSessionId)result.push(trustedPredicate(`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN cradle_base_operators m ON m.base_id=o.id WHERE s.id=? AND m.principal_id=? AND s.revoked_at IS NULL AND s.expires_at>MAX(?,unixepoch('subsec')*1000) AND o.status='active' AND o.version=s.operator_version)`,[p.baseSessionId,p.id,now]))
  if(p.delegationBound)result.push(delegationGuard(p.id))
  if(p.proposer)result.push(proposerGuard(p.id))
  return result
}

/** Revalidate the exact read snapshot after asynchronous projection. */
export async function assertCurrentScopeAuthority(db:D1Database,ctx:RequestContext,scope:PolicyScope):Promise<void>{
  if(scope.principal.id!==ctx.principal.id||scope.validUntil<=new Date().toISOString())return denied()
  const guards=and(...scope.currentAuthorityGuards)
  const current=await db.prepare(`SELECT 1 WHERE ${guards.sql}`).bind(...guards.values).first()
  if(!current)return denied()
}
