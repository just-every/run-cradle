import type { AdmissionPlan, SqlMutation, SqlPredicate } from '../admission/ports'
import { registerTable, trustedPredicate } from '../admission/sql.server'
import type { PolicyPort, RequestContext } from './ports'
import type { Policy } from './contracts'
import { createUlid } from '../../core/shared/ids'
import { digest } from './crypto.server'
import { canonicalJson } from './grants.server'
import { AuthorityError, denied } from './errors'

const principals = registerTable('authority_principals', ['id', 'initial_owner', 'version', 'updated_at'])
const baseOperators = registerTable('oa_operators', ['id', 'role'])
const policies = registerTable('authority_policies', ['id', 'app_id', 'name', 'rules_json', 'version', 'created_at', 'updated_at'])
const memberships = registerTable('authority_memberships', ['principal_id', 'app_id', 'policy_id', 'legacy', 'state', 'version'])
const manualBases = registerTable('manual_record_bases', ['id', 'owner_id', 'version', 'updated_at'])
/** Base's step-up window: a fresh app-local email-link proof made in this session. */
const STEP_UP_MS = 600_000

/** The installation owner can hand ownership to another active member (OPS-002). The new
 * owner becomes the installation and Base owner with the owner's own app scopes; the former
 * owner becomes a Base admin, so exactly one owner remains, and keeps their app access until
 * they remove themselves. Base requires a fresh step-up. */
export function createOwnershipTransfer(db: D1Database, policy: PolicyPort) {
 return async function transfer(ctx: RequestContext, commandId: string, appId: string, memberId: string, expectedVersion: number): Promise<AdmissionPlan<unknown>> {
  if (ctx.principal.kind !== 'human' || !ctx.principal.baseSessionId) return denied('Ownership handover requires a current operator session.')
  if (memberId === ctx.principal.id) throw new AuthorityError('validation', 'Choose another member to become the owner.', 400)
  const actor = await db.prepare(`SELECT p.version,o.id AS base_id,o.version AS base_version FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id
   WHERE p.id=? AND p.state='active' AND p.initial_owner=1 AND o.role='owner' AND o.status='active'`).bind(ctx.principal.id).first<{ version: number; base_id: string; base_version: number }>()
  if (!actor) return denied('Only the installation owner can hand over ownership.')
  const target = await db.prepare(`SELECT p.version,o.id AS base_id,o.status FROM authority_principals p JOIN operators h ON h.id=p.human_id JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id
   WHERE p.id=? AND p.kind='human' AND p.state='active' AND h.active=1 AND EXISTS(SELECT 1 FROM authority_memberships WHERE principal_id=p.id AND app_id=? AND state='active')`).bind(memberId, appId).first<{ version: number; base_id: string; status: string }>()
  if (!target) throw new AuthorityError('not_found', 'Member not found.', 404)
  if (target.status !== 'active') throw new AuthorityError('version_conflict', 'This person must accept their invitation and sign in before they can become the owner.', 409)
  if (target.version !== expectedVersion) throw new AuthorityError('version_conflict', 'This member changed; reload before handing over ownership.', 409)
  const since = Date.parse(ctx.now) - STEP_UP_MS
  const proof = trustedPredicate(`(EXISTS(SELECT 1 FROM oa_step_up_challenges c JOIN oa_operators o ON o.id=c.operator_id WHERE c.session_id=? AND c.operator_id=? AND c.operator_version=o.version AND c.action='owner:transfer' AND c.consumed_at>=?)
   OR EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_tokens t ON t.id=s.source_token_id WHERE s.id=? AND s.kind='native' AND s.created_at>=?))`, [ctx.principal.baseSessionId, actor.base_id, since, ctx.principal.baseSessionId, since])
  if (!await db.prepare(`SELECT 1 WHERE ${proof.sql}`).bind(...proof.values).first()) throw new AuthorityError('validation', 'Confirm it is you before handing over ownership: use the link we email you, then try again within 10 minutes.', 400, { blockers: [{ code: 'step_up_required', message: 'A fresh email-link confirmation for owner:transfer is required.' }] })
  const hash = await digest(canonicalJson({ memberId, expectedVersion })), permit = await policy.authorize(ctx, { appId, action: 'member.transfer-ownership', expected: [], cost: [], inputHash: hash })
  const now = Date.parse(ctx.now), guards: SqlPredicate[] = [proof,
   trustedPredicate(`EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active')`, [actor.base_id, actor.base_version]),
   trustedPredicate(`EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active')`, [target.base_id])]
  const mutations: SqlMutation[] = [
   { kind: 'update', table: principals, set: { initial_owner: 1, version: target.version + 1, updated_at: now }, where: trustedPredicate("id=? AND version=? AND state='active'", [memberId, target.version]), expectedRows: 1 },
   { kind: 'update', table: principals, set: { initial_owner: 0, version: actor.version + 1, updated_at: now }, where: trustedPredicate("id=? AND version=? AND initial_owner=1 AND state='active'", [ctx.principal.id, actor.version]), expectedRows: 1 },
  ]
  // Promote before demoting: Base refuses to leave no active owner. Each role change bumps the
  // operator and principal versions, so it follows the principal updates above.
  if (target.base_id !== actor.base_id) mutations.push(
   { kind: 'update', table: baseOperators, set: { role: 'owner' }, where: trustedPredicate("id=? AND status='active'", [target.base_id]), expectedRows: 1 },
   { kind: 'update', table: baseOperators, set: { role: 'admin' }, where: trustedPredicate("id=? AND role='owner' AND status='active'", [actor.base_id]), expectedRows: 1 })
  // The new owner receives the owner's exact scope in every app the owner holds.
  const scopes = (await db.prepare(`SELECT m.app_id,m.legacy,m.version,p.id AS policy_id,p.name,p.rules_json,p.version AS policy_version,t.version AS target_version
   FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id LEFT JOIN authority_memberships t ON t.principal_id=? AND t.app_id=m.app_id
   WHERE m.principal_id=? AND m.state='active' ORDER BY m.app_id`).bind(memberId, ctx.principal.id).all<{ app_id: string; legacy: number; version: number; policy_id: string; name: string; rules_json: string; policy_version: number; target_version: number | null }>()).results
  for (const scope of scopes) {
   const rules = (JSON.parse(scope.rules_json) as Policy['rules']).map(rule => ({ ...rule, id: createUlid(), principals: rule.principals.map(principal => principal.kind === 'human' && principal.id === ctx.principal.id ? { ...principal, id: memberId } : principal) }))
   const policyId = createUlid()
   guards.push(trustedPredicate('EXISTS(SELECT 1 FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=? AND m.version=? AND p.id=? AND p.version=?)', [ctx.principal.id, scope.app_id, scope.version, scope.policy_id, scope.policy_version]))
   mutations.push({ kind: 'insert', table: policies, row: { id: policyId, app_id: scope.app_id, name: `Owner scope from ${scope.name}`, rules_json: canonicalJson(rules), version: 1, created_at: now, updated_at: now } })
   mutations.push(scope.target_version === null
    ? { kind: 'insert', table: memberships, row: { principal_id: memberId, app_id: scope.app_id, policy_id: policyId, legacy: scope.legacy, state: 'active', version: 1 } }
    : { kind: 'update', table: memberships, set: { policy_id: policyId, legacy: scope.legacy, state: 'active', version: scope.target_version + 1 }, where: trustedPredicate('principal_id=? AND app_id=? AND version=?', [memberId, scope.app_id, scope.target_version]), expectedRows: 1 })
  }
  // Schema control of records bases moves with ownership; their records and history stay as they are.
  for (const base of (await db.prepare('SELECT id,version FROM manual_record_bases WHERE owner_id=?').bind(ctx.principal.id).all<{ id: string; version: number }>()).results)
   mutations.push({ kind: 'update', table: manualBases, set: { owner_id: memberId, version: base.version + 1, updated_at: ctx.now }, where: trustedPredicate('id=? AND version=? AND owner_id=?', [base.id, base.version, ctx.principal.id]), expectedRows: 1 })
  guards.push(trustedPredicate('(SELECT count(*) FROM manual_record_bases WHERE owner_id=?)=?', [ctx.principal.id, mutations.filter(m => m.table === manualBases).length]))
  return { commandId, action: 'member.transfer-ownership', appId, canonicalInputHash: hash, permit, guards, mutations, audit: [{ action: 'member.transfer-ownership', subject: null, changes: [], sourceIds: [], personalContentRefs: [] }], events: [], outbox: [], committedResult: { id: memberId, owner: true, version: target.version + 1, formerOwnerId: ctx.principal.id } }
 }
}
