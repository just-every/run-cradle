import { Hono } from 'hono'
import type { ServerFoundation } from '../../core/app/foundation.server'
import { createUlid } from '../../core/shared/ids'
import { authorizeLaunchProjection } from './projection-authority.server'
import { LAUNCH_APP_ID } from './contracts'

/** Assignment needs names and stable identities, not member-management access,
 * email addresses, policy identifiers or grants. */
export function createLaunchOwnersRouter(db: D1Database, foundation: ServerFoundation) {
  const router = new Hono()
  router.get('/owners', async c => {
    const ctx = await foundation.authenticate(c.req.raw, 'http', createUlid())
    const recheck = await authorizeLaunchProjection(db, foundation.policy, ctx)
    const people = await db.prepare(`SELECT DISTINCT o.id,o.name FROM operators o
      JOIN authority_principals p ON p.human_id=o.id
      JOIN authority_memberships m ON m.principal_id=p.id
      WHERE o.active=1 AND p.kind='human' AND p.state='active'
        AND m.app_id=? AND m.state='active'
      ORDER BY o.name,o.id LIMIT 100`).bind(LAUNCH_APP_ID).all<{ id: string; name: string }>()
    await recheck()
    c.header('Cache-Control', 'no-store')
    return c.json({ data: { items: people.results, nextCursor: null, total: { kind: 'exact', value: people.results.length }, evaluatedAt: ctx.now }, meta: { requestId: ctx.requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now, consistencyToken: ctx.requestId } })
  })
  return router
}
