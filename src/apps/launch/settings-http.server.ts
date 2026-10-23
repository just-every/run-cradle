import {adminAuditResponse} from '../../domains/admission/admin-audit.server'
import { sampleRevisions } from './sample-revisions.server'
import { Hono } from 'hono'
import type { ServerFoundation } from '../../core/app/foundation.server'
import { createUlid } from '../../core/shared/ids'
import { authorizeLaunchProjection } from './projection-authority.server'

/** Settings reads for custom-field definitions (SET-001) and installed samples (SET-003). */
export function createLaunchSettingsRouter(db: D1Database, foundation: ServerFoundation) {
 const router = new Hono()
 router.get('/admin-audit',c=>adminAuditResponse(c.req.raw,db,foundation))
 const read = (load: () => Promise<unknown[]>) => async (c: import('hono').Context) => {
  const ctx = await foundation.authenticate(c.req.raw, 'http', createUlid())
  const recheck = await authorizeLaunchProjection(db, foundation.policy, ctx)
  const items = await load()
  await recheck()
  c.header('Cache-Control', 'no-store')
  return c.json({ data: { items, nextCursor: null, total: { kind: 'exact', value: items.length }, evaluatedAt: ctx.now }, meta: { requestId: ctx.requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now, consistencyToken: ctx.requestId } })
 }
 router.get('/custom-fields', read(async () => (await db.prepare(`SELECT f.id,f.name,f.type,f.options_json,f.version,f.created_at,(SELECT COUNT(*) FROM launch_custom_values v WHERE v.field_id=f.id) AS campaigns
  FROM launch_custom_fields f ORDER BY f.created_at,f.id LIMIT 200`).all<{ id: string; name: string; type: string; options_json: string; version: number; campaigns: number }>()).results
  .map(row => ({ id: row.id, name: row.name, type: row.type, options: JSON.parse(row.options_json) as string[], version: row.version, campaigns: row.campaigns }))))
 router.get('/samples', read(async () => Promise.all((await db.prepare(`SELECT s.id,s.created_at,o.name AS installed_by,COUNT(r.record_id) AS records,SUM(r.table_name='campaigns') AS campaigns
  FROM sample_installations s JOIN launch_sample_records r ON r.installation_id=s.id LEFT JOIN operators o ON o.id=s.installed_by_id
  GROUP BY s.id ORDER BY s.created_at DESC,s.id DESC LIMIT 50`).all<{ id: string; created_at: number; installed_by: string | null; records: number; campaigns: number }>()).results
  .map(async row => ({ id: row.id, installedAt: new Date(row.created_at).toISOString(), installedBy: row.installed_by, records: row.records, campaigns: row.campaigns, revisions:await sampleRevisions(db,row.id) })))))
 return router
}
