import type { Json } from '../../contracts/primitives'
import { type LaunchRow, toWire } from './storage.server'

/** Hydrate a bounded, already-authorized campaign page with four D1 queries. */
export async function renderCampaignPage(db: D1Database, rows: LaunchRow[], now: string): Promise<Record<string, Json>[]> {
  if (!rows.length) return []
  if (!await db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first()) throw new Error('Workspace timezone is required')
  const ids = JSON.stringify(rows.map(row => row.id)), selectedIds = 'SELECT value FROM json_each(?)'
  const [counts, tags, custom, ratings] = await db.batch<Record<string, string | number | null>>([
    db.prepare(`SELECT campaign_id,COUNT(*) AS total,SUM(state='Complete') AS complete FROM deliverables WHERE campaign_id IN (${selectedIds}) GROUP BY campaign_id`).bind(ids),
    db.prepare(`SELECT campaign_id,tag FROM campaign_tags WHERE campaign_id IN (${selectedIds}) ORDER BY campaign_id,tag,id`).bind(ids),
    db.prepare(`SELECT campaign_id,field_id,value_json FROM launch_custom_values WHERE campaign_id IN (${selectedIds})`).bind(ids),
    db.prepare(`SELECT c.id AS campaign_id,(SELECT severity FROM risks WHERE campaign_id=c.id AND state!='Resolved' ORDER BY CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,id LIMIT 1) AS severity FROM campaigns c WHERE c.id IN (${selectedIds})`).bind(ids),
  ])
  const countById = new Map(counts!.results.map(row => [row.campaign_id, row]))
  const ratingById = new Map(ratings!.results.map(row => [row.campaign_id, row.severity]))
  return rows.map(row => {
    const count = countById.get(row.id)
    return { ...toWire(row),
      tags: tags!.results.filter(tag => tag.campaign_id === row.id).map(tag => String(tag.tag)),
      customFields: Object.fromEntries(custom!.results.filter(value => value.campaign_id === row.id).map(value => [String(value.field_id), JSON.parse(String(value.value_json))])),
      deliverableTotal: Number(count?.total ?? 0), deliverableComplete: Number(count?.complete ?? 0),
      riskRating: ratingById.get(row.id) ?? 'None', healthSetAt: new Date(Number(row.health_updated_at)).toISOString(),
      healthSetById: row.health_set_by_id!, healthStale: Number(row.health_updated_at) < Date.parse(now) - 14 * 86400000,
    }
  })
}
