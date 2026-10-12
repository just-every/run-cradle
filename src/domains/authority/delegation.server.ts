import type { Principal, RequestContext } from './ports'
import { trustedPredicate } from '../admission/sql.server'
import { AuthorityError } from './errors'

/** Issuer policy/role decreases fence the delegated read or write in its own SQL. */
export function delegationGuard(principalId: string) {
 return trustedPredicate(`EXISTS(SELECT 1 FROM authority_delegations d
  JOIN authority_principals p ON p.id=d.issuer_id
  JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=d.app_id
  JOIN authority_policies policy ON policy.id=m.policy_id AND policy.app_id=m.app_id
  JOIN oa_operators o ON o.id=d.base_operator_id
  JOIN cradle_base_operators projection ON projection.base_id=o.id AND projection.principal_id=p.id
  WHERE d.principal_id=? AND d.revoked_at IS NULL AND p.state='active'
   AND p.authentication_epoch=d.issuer_epoch AND m.state='active'
   AND m.version=d.issuer_membership_version AND policy.id=d.issuer_policy_id
   AND policy.version=d.issuer_policy_version AND o.status='active' AND o.role='owner'
   AND o.version=d.base_operator_version
   AND (d.grant_id IS NULL OR EXISTS(SELECT 1 FROM authority_grants g
    JOIN authority_principals delegate ON delegate.id=g.delegate_id
    WHERE g.id=d.grant_id AND g.delegate_id=d.principal_id AND g.issuer_id=d.issuer_id
     AND g.app_id=d.app_id AND g.state='active' AND g.revoked_at IS NULL AND g.restore_hold=0
     AND g.starts_at<=unixepoch('subsec')*1000 AND g.expires_at>unixepoch('subsec')*1000
     AND julianday(json_extract(g.spec_json,'$.period.startsAt'))<=julianday('now')
     AND julianday(json_extract(g.spec_json,'$.period.endsAt'))>julianday('now')
     AND p.authentication_epoch=g.issuer_epoch AND delegate.state='active'
     AND delegate.authentication_epoch=g.delegate_epoch))
   AND (d.automation_id IS NULL OR EXISTS(SELECT 1 FROM automations automation WHERE automation.id=d.automation_id AND automation.enabled=1)))`, [principalId])
}

export async function delegatedPrincipal(db: D1Database, principal: Principal): Promise<Principal> {
 const bound=await db.prepare(`SELECT d.principal_id,d.grant_id,g.version AS grant_version
  FROM authority_delegations d LEFT JOIN authority_grants g ON g.id=d.grant_id
  WHERE d.principal_id=?`).bind(principal.id).first<{principal_id:string;grant_id:string|null;grant_version:number|null}>()
 if (!bound) return principal
 const guard=delegationGuard(principal.id)
 if (!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())
  throw new AuthorityError('grant_revoked','The issuer changed or revoked this delegation.')
 return {...principal,delegationBound:true,
  ...(bound.grant_id&&bound.grant_version?{delegationGrant:{id:bound.grant_id,version:bound.grant_version}}:{})}
}

/** Human authority comes from the admitted Base owner and current app membership. */
export async function ownerDelegationSnapshot(db: D1Database, ctx: RequestContext, appId: string) {
 if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||!ctx.principal.baseSessionId)
  throw new AuthorityError('forbidden','A current workspace owner session is required.')
 const row=await db.prepare(`SELECT o.id AS base_id,o.version AS base_version,
  m.version AS membership_version,policy.id AS policy_id,policy.version AS policy_version,policy.rules_json
  FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
  JOIN cradle_base_operators projection ON projection.base_id=o.id
  JOIN authority_principals p ON p.id=projection.principal_id
  JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=?
  JOIN authority_policies policy ON policy.id=m.policy_id AND policy.app_id=m.app_id
  WHERE s.id=? AND p.id=? AND p.state='active' AND p.authentication_epoch=?
   AND o.role='owner' AND o.status='active' AND s.operator_version=o.version
   AND s.revoked_at IS NULL AND s.expires_at>unixepoch('subsec')*1000 AND m.state='active'`)
  .bind(appId,ctx.principal.baseSessionId,ctx.principal.id,ctx.principal.authenticationEpoch)
  .first<{base_id:string;base_version:number;membership_version:number;policy_id:string;policy_version:number;rules_json:string}>()
 if(!row)throw new AuthorityError('forbidden','Current owner and app access are required.')
 const guard=trustedPredicate(`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
  JOIN cradle_base_operators projection ON projection.base_id=o.id
  JOIN authority_memberships m ON m.principal_id=projection.principal_id AND m.app_id=?
  JOIN authority_policies policy ON policy.id=m.policy_id AND policy.app_id=m.app_id
  WHERE s.id=? AND projection.principal_id=? AND o.id=? AND o.version=? AND o.role='owner'
   AND o.status='active' AND s.operator_version=o.version AND s.revoked_at IS NULL
   AND s.expires_at>unixepoch('subsec')*1000 AND m.state='active' AND m.version=?
   AND policy.id=? AND policy.version=?)`,[appId,ctx.principal.baseSessionId,ctx.principal.id,row.base_id,row.base_version,row.membership_version,row.policy_id,row.policy_version])
 return {row,guard}
}
