import type { Database } from '../shared/repository'
import { execute, queryAll, queryOne } from '../shared/repository'

type LensRow = {
  conditionsJson: string
  createdAt: number
  createdById: string
  description: string
  display: string
  fieldsJson: string
  id: string
  name: string
  recordType: string
  shippedKey: string | null
  sortJson: string
  version: number
}

const map = (row: LensRow) => ({
  conditions: JSON.parse(row.conditionsJson),
  createdAt: row.createdAt,
  createdById: row.createdById,
  description: row.description,
  display: row.display,
  fields: JSON.parse(row.fieldsJson),
  id: row.id,
  name: row.name,
  recordType: row.recordType,
  shippedKey: row.shippedKey,
  sort: JSON.parse(row.sortJson),
  version: row.version,
})

export const createLensRepository = (database: Database) => ({
  async list() {
    const rows = await queryAll<LensRow>(database, `SELECT id, created_at AS createdAt, name, description, record_type AS recordType, conditions_json AS conditionsJson,
      sort_json AS sortJson, fields_json AS fieldsJson, display, created_by_id AS createdById, shipped_key AS shippedKey, version FROM lenses ORDER BY created_at ASC, id ASC`)
    return rows.map(map)
  },

  async find(id: string) {
    const row = await queryOne<LensRow>(database, `SELECT id, created_at AS createdAt, name, description, record_type AS recordType, conditions_json AS conditionsJson,
      sort_json AS sortJson, fields_json AS fieldsJson, display, created_by_id AS createdById, shipped_key AS shippedKey, version FROM lenses WHERE id = ?`, [id])
    return row ? map(row) : undefined
  },

  async findShipped(key: string) {
    const row = await queryOne<LensRow>(database, `SELECT id, created_at AS createdAt, name, description, record_type AS recordType, conditions_json AS conditionsJson,
      sort_json AS sortJson, fields_json AS fieldsJson, display, created_by_id AS createdById, shipped_key AS shippedKey, version FROM lenses WHERE shipped_key = ?`, [key])
    return row ? map(row) : undefined
  },

  recordsFor(recordType: string) {
    const queries: Record<string, string> = {
      Campaign: `SELECT c.id, c.code, c.name, c.phase, c.status, c.health, c.start_date AS startDate, c.launch_date AS launchDate,
        o.name AS owner FROM campaigns c JOIN operators o ON o.id = c.owner_id WHERE c.archived_at IS NULL ORDER BY c.id ASC`,
      Risk: `SELECT r.id, r.title, r.severity, r.state, r.due_date AS dueDate, r.signal, r.mitigation, c.code AS campaign,
        c.launch_date AS launchDate, o.name AS owner FROM risks r JOIN campaigns c ON c.id = r.campaign_id JOIN operators o ON o.id = r.owner_id
        WHERE c.archived_at IS NULL AND r.state != 'Resolved' ORDER BY r.id ASC`,
      Milestone: `SELECT m.id, m.title, m.type, m.status, m.start_date AS startDate, m.end_date AS endDate, c.code AS campaign,
        o.name AS owner FROM milestones m JOIN campaigns c ON c.id = m.campaign_id JOIN operators o ON o.id = m.owner_id WHERE c.archived_at IS NULL ORDER BY m.id ASC`,
      Decision: `SELECT d.id, d.title, d.priority, d.state, d.due_at AS dueAt, c.code AS campaign,
        requester.name AS requester, assignee.name AS assignee
        FROM decisions d JOIN campaigns c ON c.id = d.campaign_id JOIN operators requester ON requester.id = d.requester_id
        LEFT JOIN operators assignee ON assignee.id = d.assignee_id WHERE c.archived_at IS NULL ORDER BY d.id ASC`,
    }
    return queryAll<Record<string, unknown>>(database, queries[recordType] ?? 'SELECT NULL WHERE 0')
  },

})
