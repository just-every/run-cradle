import { z } from 'zod'
import { AuthorityError } from './errors'
import type { RequestContext } from './ports'
import { idSchema } from './validators'

const invitationReceipt = z.object({
  state: z.literal('committed'),
  value: z.object({ scopes: z.array(z.object({ appId: idSchema })).min(1).max(100) }),
})

/** Receipt reads disclose every invited app, even though admission has one app identity. */
export async function authorizeInvitationReplay(db: D1Database, ctx: RequestContext, appId: string, result: unknown) {
  const receipt = invitationReceipt.safeParse(result)
  if (!receipt.success || receipt.data.value.scopes.at(-1)?.appId !== appId)
    throw new AuthorityError('not_found', 'Command is not visible under current policy.', 404)
  // Use the stored receipt, never the retry's scopes; current write permission is unnecessary.
  const apps = [...new Set(receipt.data.value.scopes.map(scope => scope.appId))]
  const memberships = await db.prepare(`SELECT m.app_id FROM authority_memberships m
    JOIN authority_policies p ON p.id=m.policy_id AND p.app_id=m.app_id
    WHERE m.principal_id=? AND m.state='active'`).bind(ctx.principal.id).all<{ app_id: string }>()
  const current = new Set(memberships.results.map(membership => membership.app_id))
  if (apps.some(app => !current.has(app)))
    throw new AuthorityError('not_found', 'Command is not visible under current policy.', 404)
}
