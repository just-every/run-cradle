import type { ResourceContext, ToolContext } from '../../vendor/base/modules/agent-door/types'
import { ToolRefusal } from '../../vendor/base/modules/agent-door/index.ts'
import { admitAgentPrincipal } from '../domains/authority/agent-admission.server'
import type { RequestContext } from '../domains/authority/ports'
import { and, trustedPredicate } from '../domains/admission/sql.server'
import { readCradleAgentPerson } from './people.server'
import { createUlid } from '../core/shared/ids'

/** Signed door admission enters the ordinary native policy engine as the current
 * human sponsor. It creates neither a session nor a local machine credential. */
export function createNativeAgentContext(db: D1Database, options: {
  allowList?: string[]
  local(ctx: ToolContext | ResourceContext): Promise<RequestContext | null>
}) {
  return async (ctx: ToolContext | ResourceContext): Promise<RequestContext> => {
    const person = await readCradleAgentPerson(db, ctx.person.id, options.allowList)
    if (!person) throw new ToolRefusal('unauthenticated')
    const local = await options.local(ctx)
    const state = await db.prepare('SELECT envelope,local_document,local_revision,local_paused FROM agent_door_state WHERE id=1')
      .first<{ envelope: string | null; local_document: string | null; local_revision: number; local_paused: number }>()
    const guards = [trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals p
      JOIN operators n ON n.id=p.human_id JOIN cradle_base_operators m ON m.principal_id=p.id
      JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.state='active'
      AND p.authentication_epoch=? AND n.active=1 AND o.status='active' AND o.version=?)`,
      [person.id, person.authenticationEpoch, person.baseVersion]),
      state ? trustedPredicate(`EXISTS(SELECT 1 FROM agent_door_state WHERE id=1 AND envelope IS ?
        AND local_document IS ? AND local_revision=? AND local_paused=?)`,
        [state.envelope, state.local_document, state.local_revision, state.local_paused])
        : trustedPredicate('NOT EXISTS(SELECT 1 FROM agent_door_state WHERE id=1)')]
    const now = Date.now()
    const binding = await db.prepare('SELECT rev,document,stopped FROM bs_settings WHERE singleton=1')
      .first<{ rev: number; document: string | null; stopped: number }>()
    if (binding) guards.push(trustedPredicate('EXISTS(SELECT 1 FROM bs_settings WHERE singleton=1 AND rev=? AND document IS ? AND stopped=?)', [binding.rev, binding.document, binding.stopped]))
    guards.push(trustedPredicate('EXISTS(SELECT 1 FROM agent_door_agents WHERE id=? AND sponsor=? AND revoked=0)', [ctx.agent.id, person.id]))
    const native: RequestContext = local ?? {
      principal: { id: person.id, kind: 'human', humanId: person.humanId, sessionId: null,
        credentialId: null, authenticationEpoch: person.authenticationEpoch,
        issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString() },
      ingress: 'mcp', requestId: createUlid(), now: new Date(now).toISOString(),
    }
    // Approval execution and resource reads arrive through the same admission.
    admitAgentPrincipal(native.principal, guards, {
      agent: { id: ctx.agent.id, name: ctx.agent.name }, for: { id: person.id, name: person.name },
      label: `${ctx.agent.name} for ${person.name}`,
      operationId: ctx.operationId ?? '',
      approvers: 'approvers' in ctx ? ctx.approvers : [],
    })
    const current = and(...guards)
    if (!await db.prepare(`SELECT 1 WHERE ${current.sql}`).bind(...current.values).first()) throw new ToolRefusal('unauthenticated')
    return native
  }
}
