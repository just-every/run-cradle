import type { Database } from '../shared/repository'
import { iso, queryAll, queryOne } from '../shared/repository'
import { toInitials } from '../../shared/people'

type DecisionRow = {
  assigneeId: string | null
  assigneeName: string | null
  campaignCode: string
  campaignId: string
  campaignName: string
  dueAt: number
  id: string
  impact: string
  priority: string
  rationale: string | null
  escalationOrigin: number
  recommendationEdited: number
  escalationReason: string | null
  recommendation: string
  requesterId: string
  requesterName: string
  riskId: string | null
  riskTitle: string | null
  supersedesId: string | null
  supersedesTitle: string | null
  supersededByJson: string
  state: string
  title: string
  version: number
}

const select = `
  SELECT d.id, d.title, d.priority, d.due_at AS dueAt, d.recommendation, d.impact, d.state, d.version, d.risk_id AS riskId, d.rationale,
    risk.title AS riskTitle, (SELECT next_value FROM activity_entries WHERE subject_id=d.id AND type='decision.created' AND field_name='recommendation' ORDER BY created_at ASC,id ASC LIMIT 1) AS escalationReason, EXISTS(SELECT 1 FROM admission_audit audit JOIN command_admissions admission ON admission.command_id=audit.command_id WHERE json_extract(audit.subject_json,'$.recordId')=d.id AND audit.action='decision.created' AND admission.action IN ('launch.risk.escalate','launch.automation.execute')) AS escalationOrigin, EXISTS(SELECT 1 FROM activity_entries WHERE subject_id=d.id AND type='decision.updated' AND field_name='recommendation') AS recommendationEdited,
    c.id AS campaignId, c.code AS campaignCode, c.name AS campaignName,
    requester.id AS requesterId, requester.name AS requesterName, assignee.id AS assigneeId, assignee.name AS assigneeName,
    previous.id AS supersedesId, previous.title AS supersedesTitle,
    (SELECT json_group_array(json_object('id', following.id, 'title', following.title))
      FROM (SELECT id, title FROM decisions WHERE supersedes_id = d.id ORDER BY created_at, id) following) AS supersededByJson
  FROM decisions d JOIN campaigns c ON c.id = d.campaign_id JOIN operators requester ON requester.id = d.requester_id
  LEFT JOIN operators assignee ON assignee.id = d.assignee_id
  LEFT JOIN risks risk ON risk.id = d.risk_id
  LEFT JOIN decisions previous ON previous.id = d.supersedes_id
`

const map = (row: DecisionRow) => ({
  assignee: row.assigneeId && row.assigneeName ? { id: row.assigneeId, initials: toInitials(row.assigneeName), name: row.assigneeName } : null,
  campaign: { code: row.campaignCode, id: row.campaignId, name: row.campaignName },
  dueAt: iso(row.dueAt),
  id: row.id,
  impact: row.impact,
  priority: row.priority,
  rationale: row.rationale,
  recommendation: row.recommendation,
  escalationReason: row.escalationOrigin ? row.escalationReason : null,
  recommendationSource: row.escalationOrigin && !row.recommendationEdited && row.recommendation === row.escalationReason ? 'escalation-reason' as const : 'decision-field' as const,
  requester: { id: row.requesterId, initials: toInitials(row.requesterName), name: row.requesterName },
  risk: row.riskId && row.riskTitle ? { id: row.riskId, title: row.riskTitle } : null,
  supersedes: row.supersedesId === null ? null : { id: row.supersedesId, title: row.supersedesTitle! },
  supersededBy: JSON.parse(row.supersededByJson) as { id: string; title: string }[],
  state: row.state,
  title: row.title,
  version: row.version,
})

export const createDecisionRepository = (database: Database) => ({
  async list() {
    const rows = await queryAll<DecisionRow>(database, `${select}
      WHERE c.archived_at IS NULL AND d.state IN ('Awaiting approval', 'In review')
      ORDER BY d.due_at < ? DESC, CASE d.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, d.due_at ASC, d.id ASC`, [Date.now()])
    return rows.map(map)
  },

  async find(id: string) {
    const row = await queryOne<DecisionRow>(database, `${select} WHERE d.id = ?`, [id])
    return row ? map(row) : undefined
  },

  raw(id: string) {
    return queryOne<{ campaignId: string, riskId: string | null, state: string, title: string, version: number }>(database,
      'SELECT campaign_id AS campaignId, risk_id AS riskId, state, title, version FROM decisions WHERE id = ?', [id])
  },

})
