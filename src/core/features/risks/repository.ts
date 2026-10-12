import type { Database } from '../shared/repository'
import { executeBatch, iso, queryAll, queryOne } from '../shared/repository'
import { toInitials } from '../../shared/people'

type RiskRow = {
  campaignCode: string
  campaignId: string
  campaignName: string
  campaignLaunchDate: string
  dueDate: string | null
  id: string
  mitigation: string
  ownerId: string
  ownerName: string
  resolvedAt: number | null
  resolutionNote: string | null
  severity: string
  signal: string
  state: string
  title: string
  version: number
}

const select = `
  SELECT r.id, r.title, r.severity, r.state, r.due_date AS dueDate, r.signal, r.mitigation, r.version,
    r.resolved_at AS resolvedAt, r.resolution_note AS resolutionNote,
    c.id AS campaignId, c.code AS campaignCode, c.name AS campaignName, c.launch_date AS campaignLaunchDate,
    o.id AS ownerId, o.name AS ownerName
  FROM risks r JOIN campaigns c ON c.id = r.campaign_id JOIN operators o ON o.id = r.owner_id
`

const mapRisk = (row: RiskRow) => ({
  campaign: { code: row.campaignCode, id: row.campaignId, name: row.campaignName, launchDate: row.campaignLaunchDate },
  dueDate: row.dueDate,
  id: row.id,
  mitigation: row.mitigation,
  owner: { id: row.ownerId, initials: toInitials(row.ownerName), name: row.ownerName },
  resolvedAt: row.state === 'Resolved' ? iso(row.resolvedAt) : null,
  resolutionNote: row.resolutionNote,
  severity: row.severity,
  signal: row.signal,
  state: row.state,
  title: row.title,
  version: row.version,
})

export const createRiskRepository = (database: Database) => ({
  shippedLens() {
    return queryOne<{ name: string, description: string }>(database, 'SELECT name, description FROM lenses WHERE shipped_key = ?', ['risks'])
  },

  async listShippedLens(cutoff: string) {
    const rows = await queryAll<RiskRow>(database, `${select}
      WHERE c.archived_at IS NULL AND r.state != 'Resolved' AND r.severity IN ('High', 'Critical')
        AND c.launch_date <= ?
      ORDER BY CASE r.severity WHEN 'Critical' THEN 0 ELSE 1 END, r.due_date IS NULL, r.due_date ASC, c.code ASC, r.id ASC`, [cutoff])
    return rows.map(mapRisk)
  },

  async find(id: string) {
    const row = await queryOne<RiskRow>(database, `${select} WHERE r.id = ?`, [id])
    if (!row) return undefined
    const decision = await queryOne<{ id: string, priority: string, state: string, title: string, version: number }>(database,
      `SELECT id, title, priority, state, version FROM decisions WHERE risk_id = ? ORDER BY state IN ('Awaiting approval','In review') DESC, created_at DESC, id DESC LIMIT 1`, [id])
    return { risk: mapRisk(row), decision }
  },

  raw(id: string) {
    return queryOne<{ campaignId: string, campaignOwnerId: string, severity: string, state: string, title: string, version: number }>(database, `
      SELECT r.campaign_id AS campaignId, c.owner_id AS campaignOwnerId, r.severity, r.state, r.title, r.version
      FROM risks r JOIN campaigns c ON c.id = r.campaign_id WHERE r.id = ?
    `, [id])
  },

  existingUnresolvedDecision(riskId: string) {
    return queryOne<{ id: string }>(database, `SELECT id FROM decisions WHERE risk_id = ? AND state IN ('Awaiting approval', 'In review') LIMIT 1`, [riskId])
  },

})
