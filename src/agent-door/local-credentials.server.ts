import { ToolRefusal } from '../../vendor/base/modules/agent-door/index.ts'
import type { Principal as DoorPrincipal, ResourceContext, ToolContext } from '../../vendor/base/modules/agent-door/types.ts'
import type { Runtime } from '../core/app/composition/runtime.server'
import { createUlid } from '../core/shared/ids'
import type { Principal, RequestContext } from '../domains/authority/ports'
import { bindProposer, proposalAudience } from '../domains/authority/proposer.server'
import { delegatedPrincipal } from '../domains/authority/delegation.server'
import { principalGuards } from '../domains/authority/guards.server'
import { assertGuards } from '../domains/records/fence.server'
import { isDevMinted } from '../domains/authority/dev-credentials.server'

const proposalScopes = ['schema:read', 'schema:propose']
interface Credential {
  id: string; principal_id: string; created_at: number; expires_at: number; audience: string
  authentication_epoch: number; kind: Principal['kind']; human_id: string | null
  version: number; issuer_id: string; label: string; app_id: string; scopes_json: string
}
type AuthenticatedIdentity = Pick<DoorPrincipal, 'person' | 'agent' | 'clientId' | 'consent'>

/** The shared door accepts the existing proposing key; it does not issue a new credential. */
export function createCradleLocalCredentials(runtime: Runtime, origin: string) {
  const db = runtime.records.deps.db
  // A successful native request is the only way a development credential can
  // enter this isolate. Keep no bearer, and refuse delayed execution after a
  // restart until that credential passes the checkout's native key gate again.
  const admittedDevelopment = new Map<string, { expiresAt: number; version: number }>()
  const credential = (id: string) => db.prepare(`SELECT c.id,c.principal_id,c.created_at,c.expires_at,c.audience,c.version,c.scopes_json,
    p.authentication_epoch,p.kind,p.human_id,b.issuer_id,b.label,b.app_id
    FROM authority_credentials c JOIN authority_principals p ON p.id=c.principal_id
    JOIN authority_schema_proposers b ON b.principal_id=p.id
    WHERE c.id=? AND c.audience=? AND c.revoked_at IS NULL AND c.expires_at>unixepoch('subsec')*1000
      AND p.state='active' AND p.authentication_epoch=c.authentication_epoch AND b.revoked_at IS NULL`)
    .bind(id, proposalAudience(origin)).first<Credential>()
  const currentProposalScopes = (row: Credential) => {
    const nativeScopes = JSON.parse(row.scopes_json) as { appId: string; actions: string[] }[]
    return proposalScopes.filter(scope => scope === 'schema:read' || nativeScopes.some(item => item.appId === row.app_id && item.actions.includes('schema.propose')))
  }
  const native = async (identity: AuthenticatedIdentity): Promise<RequestContext | null> => {
    // Business credentials carry consent and retain their own principal path,
    // even if their signed client id happens to match a native key identifier.
    if (identity.consent) return null
    if (!identity.clientId) return null
    const row = await credential(identity.clientId)
    // ResourceContext does not carry Business consent in this Base release.
    // An unrelated signed Business client is not a native proposing credential.
    // Revoked local callers already lose all scopes in currentScopes below.
    if (!row) return null
    if (row.principal_id !== identity.agent.id || row.issuer_id !== identity.person.id || row.label !== identity.agent.name)
      throw new ToolRefusal('unauthenticated', 'The proposing key or its sponsor is no longer current.')
    if (await isDevMinted(db, row.id)) {
      const admission = admittedDevelopment.get(row.id)
      if (!admission || admission.expiresAt <= Date.now() || admission.version !== row.version)
        throw new ToolRefusal('unauthenticated', 'This development key must pass its native checkout gate.')
    }
    try {
      const principal = await bindProposer(db, await delegatedPrincipal(db, {
        id: row.principal_id, kind: row.kind, humanId: row.human_id, sessionId: null,
        credentialId: row.id, issuedAt: new Date(row.created_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(), authenticationEpoch: row.authentication_epoch,
      }), true)
      const context: RequestContext = { principal, requestId: createUlid(), now: new Date().toISOString(), ingress: 'mcp' }
      await assertGuards(db, principalGuards(context))
      return context
    } catch (error) {
      if (error instanceof Error && 'code' in error) throw new ToolRefusal(String(error.code), error.message)
      throw error
    }
  }
  return {
    async localCredentials(request: Request) {
      // Only the native opaque credential grammar reaches native auth. The
      // shared verifier refuses recognizable invalid Business tokens itself.
      if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(request.headers.get('authorization') ?? '')) return null
      let context: RequestContext
      try { context = await runtime.foundation.authenticate(request, 'mcp', createUlid()) }
      catch (error) {
        if (error instanceof Error && 'code' in error && ['signed_out', 'grant_revoked', 'not_found', 'forbidden'].includes(String(error.code))) return null
        throw error
      }
      if (!context.principal.proposer || !context.principal.credentialId) return null
      const row = await credential(context.principal.credentialId)
      if (!row) return null
      if (await isDevMinted(db, row.id)) {
        for (const [id, admission] of admittedDevelopment) if (admission.expiresAt <= Date.now()) admittedDevelopment.delete(id)
        if (admittedDevelopment.size >= 1024) admittedDevelopment.delete(admittedDevelopment.keys().next().value!)
        admittedDevelopment.set(row.id, { expiresAt: row.expires_at, version: row.version })
      }
      return {
        sponsor: { id: row.issuer_id },
        agent: { id: row.principal_id, name: row.label, specialist: 'operations app steward' },
        scopes: currentProposalScopes(row), clientId: row.id,
      }
    },
    async currentScopes(principal: DoorPrincipal) {
      if (principal.consent) return [...principal.scopes]
      try { const context = await native(principal); const row = context?.principal.credentialId ? await credential(context.principal.credentialId) : null; return row ? currentProposalScopes(row) : [] }
      catch (error) { if (error instanceof ToolRefusal) return []; throw error }
    },
    context(ctx: ToolContext | ResourceContext) { return native(ctx) },
  }
}
