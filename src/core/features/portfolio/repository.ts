import type { Database } from '../shared/repository'
import { iso, queryAll, queryOne } from '../shared/repository'

export const createPortfolioRepository = (database: Database) => ({
  metrics() {
    return queryOne<{ liveCampaigns: number, needsAttention: number, openDecisions: number, healthSum: number | null, healthCount: number, staleHealthCount: number }>(database, `
      SELECT
        (SELECT COUNT(*) FROM campaigns WHERE archived_at IS NULL) AS liveCampaigns,
        (SELECT COUNT(*) FROM campaigns WHERE archived_at IS NULL AND status IN ('At risk', 'Blocked')) AS needsAttention,
        (SELECT COUNT(*) FROM decisions d JOIN campaigns c ON c.id = d.campaign_id WHERE c.archived_at IS NULL AND d.state IN ('Awaiting approval', 'In review')) AS openDecisions,
        (SELECT SUM(health) FROM campaigns WHERE archived_at IS NULL) AS healthSum,
        (SELECT COUNT(*) FROM campaigns WHERE archived_at IS NULL) AS healthCount,
        (SELECT COUNT(*) FROM campaigns WHERE archived_at IS NULL AND health_updated_at < ?) AS staleHealthCount
    `, [Date.now() - 14 * 24 * 60 * 60 * 1000])
  },

  upcomingMilestones() {
    return queryAll<{ id: string, title: string, type: string, status: string, startDate: string, endDate: string | null, version: number, conflictReason: string | null, ownerId: string, ownerName: string }>(database, `
      SELECT m.id, m.title, m.type, m.status, m.start_date AS startDate, m.end_date AS endDate, m.version, m.conflict_reason AS conflictReason,
        c.id AS campaignId, c.code AS campaignCode, c.name AS campaignName, o.id AS ownerId, o.name AS ownerName
      FROM milestones m JOIN campaigns c ON c.id = m.campaign_id JOIN operators o ON o.id = m.owner_id
      WHERE c.archived_at IS NULL ORDER BY m.start_date ASC, c.code ASC, m.id ASC LIMIT 8
    `)
  },

  async recentActivity() {
    const rows = await queryAll<{ id: string, createdAt: number, message: string, type: string, subjectId: string, subjectTitle: string | null, fieldName: string | null, previousValue: string | null, nextValue: string | null, campaignId: string, campaignName: string, actorId: string | null, actorName: string | null }>(database, `
      SELECT a.id, a.created_at AS createdAt, a.message, a.type, a.subject_id AS subjectId, a.field_name AS fieldName, a.previous_value AS previousValue, a.next_value AS nextValue, COALESCE((SELECT title FROM decisions WHERE id=a.subject_id),(SELECT title FROM risks WHERE id=a.subject_id),(SELECT title FROM milestones WHERE id=a.subject_id),(SELECT title FROM deliverables WHERE id=a.subject_id),(SELECT name FROM campaigns WHERE id=a.subject_id),(SELECT next_value FROM activity_entries history WHERE history.subject_id=a.subject_id AND history.field_name IN ('title','name') AND history.next_value IS NOT NULL ORDER BY history.created_at DESC,history.id DESC LIMIT 1)) AS subjectTitle, c.id AS campaignId, c.name AS campaignName, o.id AS actorId, o.name AS actorName
      FROM activity_entries a JOIN campaigns c ON c.id = a.campaign_id LEFT JOIN operators o ON o.id = a.actor_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT 12
    `)
    return rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) }))
  },
})
