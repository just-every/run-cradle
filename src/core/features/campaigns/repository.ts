import { LAUNCH_APP_ID, launchEntities } from '../../../apps/launch/contracts'
import { readActivityMessage } from '../../../apps/launch/activity-message'
import type { Database } from '../shared/repository'
import { execute, executeBatch, iso, queryAll, queryOne } from '../shared/repository'
import { toInitials } from '../../shared/people'

type CampaignRow = {
  budgetMinor: number
  code: string
  deliverableComplete: number
  deliverableTotal: number
  health: number
  healthUpdatedAt: number
  healthSetById: string | null
  healthSetByName: string | null
  id: string
  launchDate: string
  name: string
  objective: string
  ownerId: string
  ownerName: string
  phase: string
  riskRating: string
  spendMinor: number
  startDate: string
  status: string
  statusSummary: string
  tags: string | null
  unresolvedDecisionCount: number
  version: number
}

export type CampaignSummary = ReturnType<typeof campaignSummary>

const campaignSelect = `
  SELECT c.id, c.code, c.name, c.owner_id AS ownerId, o.name AS ownerName, c.phase, c.status, c.health,
    c.health_updated_at AS healthUpdatedAt, c.health_set_by_id AS healthSetById, health_operator.name AS healthSetByName, c.start_date AS startDate, c.launch_date AS launchDate,
    c.budget_minor AS budgetMinor, c.spend_minor AS spendMinor, c.version, c.objective,
    c.status_summary AS statusSummary,
    (SELECT GROUP_CONCAT(tag, '|') FROM campaign_tags WHERE campaign_id = c.id) AS tags,
    (SELECT COUNT(*) FROM deliverables d WHERE d.campaign_id = c.id) AS deliverableTotal,
    (SELECT COUNT(*) FROM deliverables d WHERE d.campaign_id = c.id AND d.state = 'Complete') AS deliverableComplete,
    (SELECT COUNT(*) FROM decisions d WHERE d.campaign_id = c.id AND d.state IN ('Awaiting approval', 'In review')) AS unresolvedDecisionCount,
    COALESCE((SELECT r.severity FROM risks r WHERE r.campaign_id = c.id AND r.state != 'Resolved'
      ORDER BY CASE r.severity WHEN 'Critical' THEN 4 WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END DESC, r.id ASC LIMIT 1), 'None') AS riskRating
  FROM campaigns c
  JOIN operators o ON o.id = c.owner_id LEFT JOIN operators health_operator ON health_operator.id = c.health_set_by_id
`

const campaignSummary = (row: CampaignRow) => ({
  budgetMinor: row.budgetMinor,
  code: row.code,
  deliverableComplete: row.deliverableComplete,
  deliverableTotal: row.deliverableTotal,
  health: row.health,
  healthStale: row.healthUpdatedAt < Date.now() - 14 * 24 * 60 * 60 * 1000,
  id: row.id,
  launchDate: row.launchDate,
  name: row.name,
  owner: { id: row.ownerId, initials: toInitials(row.ownerName), name: row.ownerName },
  phase: row.phase,
  riskRating: row.riskRating,
  spendMinor: row.spendMinor,
  startDate: row.startDate,
  status: row.status,
  tags: row.tags?.split('|') ?? [],
  unresolvedDecisionCount: row.unresolvedDecisionCount,
  version: row.version,
})

export const createCampaignRepository = (database: Database) => ({
  async list() {
    const rows = await queryAll<CampaignRow>(database, `${campaignSelect} WHERE c.archived_at IS NULL ORDER BY c.launch_date ASC, c.id ASC`)
    return rows.map(campaignSummary)
  },

  async find(id: string) {
    const row = await queryOne<CampaignRow>(database, `${campaignSelect} WHERE c.id = ?`, [id])
    return row ? campaignSummary(row) : undefined
  },

  async findDetail(id: string) {
    const row = await queryOne<CampaignRow>(database, `${campaignSelect} WHERE c.id = ?`, [id])
    return row ? {
      ...campaignSummary(row),
      objective: row.objective,
      summary: row.statusSummary,
      healthSetBy: row.healthSetById && row.healthSetByName ? {id:row.healthSetById,name:row.healthSetByName,initials:toInitials(row.healthSetByName)} : null,
      healthSetAt: iso(row.healthUpdatedAt),
    } : undefined
  },

  findRaw(id: string) {
    return queryOne<{ id: string, version: number, state: string, campaignId: string, title: string }>(database,
      'SELECT id, version, state, campaign_id AS campaignId, title FROM deliverables WHERE id = ?', [id])
  },

  async findDeliverable(id: string) {
    const row = await queryOne<{ id: string, title: string, dueDate: string | null, state: string, version: number, ownerId: string, ownerName: string, archived: number }>(database, `
      SELECT d.id, d.title, d.due_date AS dueDate, d.state, d.version, o.id AS ownerId, o.name AS ownerName, (c.archived_at IS NOT NULL) AS archived
      FROM deliverables d JOIN operators o ON o.id = d.owner_id JOIN campaigns c ON c.id=d.campaign_id WHERE d.id = ?
    `, [id])
    if (!row) return undefined
    const settings=await queryOne<{timezone:string}>(database,'SELECT timezone FROM workspace_settings LIMIT 1');if(!settings)throw new Error('Workspace timezone is required')
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    return {
      id: row.id,
      title: row.title,
      owner: { id: row.ownerId, initials: toInitials(row.ownerName), name: row.ownerName },
      dueDate: row.dueDate,
      state: row.state,
      overdue: !row.archived && row.state !== 'Complete' && Boolean(row.dueDate && row.dueDate < today),
      version: row.version,
    }
  },

  async detailParts(id: string) {
    const [deliverables, milestones, risks, decisions, activity] = await Promise.all([
      queryAll<{ id: string, title: string, dueDate: string | null, state: string, version: number, ownerId: string, ownerName: string }>(database, `SELECT d.id, d.title, d.due_date AS dueDate, d.state, d.version, o.id AS ownerId, o.name AS ownerName,
        d.completed_at AS completedAt FROM deliverables d JOIN operators o ON o.id = d.owner_id WHERE d.campaign_id = ? ORDER BY d.due_date ASC, d.id ASC`, [id]),
      queryAll<{ id: string, title: string, type: string, status: string, startDate: string, endDate: string | null, conflictReason: string | null, version: number, ownerId: string, ownerName: string }>(database, `SELECT m.id, m.title, m.type, m.status, m.start_date AS startDate, m.end_date AS endDate, m.conflict_reason AS conflictReason, m.version,
        o.id AS ownerId, o.name AS ownerName FROM milestones m JOIN operators o ON o.id = m.owner_id WHERE m.campaign_id = ? ORDER BY m.start_date ASC, m.id ASC`, [id]),
      queryAll<{ id: string, title: string, severity: string, state: string, dueDate: string | null, signal: string, mitigation: string, version: number, ownerId: string, ownerName: string }>(database, `SELECT r.id, r.title, r.severity, r.state, r.due_date AS dueDate, r.signal, r.mitigation, r.version,
        o.id AS ownerId, o.name AS ownerName FROM risks r JOIN operators o ON o.id = r.owner_id WHERE r.campaign_id = ? AND r.state != 'Resolved' ORDER BY r.id ASC`, [id]),
      queryAll<{ id: string, title: string, priority: string, state: string, dueAt: number, version: number, requesterId: string, requesterName: string, assigneeId: string | null, assigneeName: string | null }>(database, `SELECT d.id, d.title, d.priority, d.state, d.due_at AS dueAt, d.recommendation, d.impact, d.version,
        requester.id AS requesterId, requester.name AS requesterName, assignee.id AS assigneeId, assignee.name AS assigneeName
        FROM decisions d JOIN operators requester ON requester.id = d.requester_id LEFT JOIN operators assignee ON assignee.id = d.assignee_id
        WHERE d.campaign_id = ? AND d.state IN ('Awaiting approval','In review') ORDER BY d.due_at ASC, d.id ASC`, [id]),
      queryAll<{ id: string, type: string, subjectId: string, subjectTitle: string, fieldName: string | null, previousValue: string | null, nextValue: string | null, message: string, createdAt: number, actorId: string | null, actorName: string | null }>(database, `SELECT a.id AS id, a.type, a.subject_id AS subjectId, COALESCE((SELECT title FROM decisions WHERE id=a.subject_id),(SELECT title FROM risks WHERE id=a.subject_id),(SELECT title FROM milestones WHERE id=a.subject_id),(SELECT title FROM deliverables WHERE id=a.subject_id),(SELECT name FROM campaigns WHERE id=a.subject_id),(SELECT next_value FROM activity_entries history WHERE history.subject_id=a.subject_id AND history.field_name IN ('title','name') AND history.next_value IS NOT NULL ORDER BY history.created_at DESC,history.id DESC LIMIT 1),'Removed record') AS subjectTitle, a.message, a.created_at AS createdAt, a.field_name AS fieldName, a.previous_value AS previousValue,
        a.next_value AS nextValue, o.id AS actorId, o.name AS actorName FROM activity_entries a LEFT JOIN operators o ON o.id = a.actor_id
        WHERE a.campaign_id = ?
        UNION ALL
        SELECT a.id, CASE a.action WHEN 'comment.add' THEN 'comment.created' ELSE 'comment.deleted' END,
        json_extract(a.personal_refs_json,'$[0]'), NULL,
        json_object('commandId',a.command_id,'message',CASE a.action WHEN 'comment.add' THEN 'Comment added' ELSE 'Comment deleted' END),
        CAST(unixepoch(a.created_at,'subsec')*1000 AS INTEGER), NULL, NULL, NULL,
        COALESCE(o.id,p.id), COALESCE(o.name,p.kind)
        FROM admission_audit a LEFT JOIN authority_principals p ON p.id=a.actor_id
        LEFT JOIN operators o ON o.id=p.human_id
        WHERE a.app_id=? AND json_extract(a.subject_json,'$.entityId')=?
        AND json_extract(a.subject_json,'$.recordId')=? AND a.action IN ('comment.add','comment.delete')
        ORDER BY createdAt DESC, id DESC`, [id, LAUNCH_APP_ID, launchEntities.campaign, id]),
    ])
    const custom = await queryAll<{ id: string, name: string, type: string, optionsJson: string, valueJson: string | null }>(database, `SELECT f.id, f.name, f.type, f.options_json AS optionsJson, v.value_json AS valueJson
      FROM launch_custom_fields f LEFT JOIN launch_custom_values v ON v.field_id = f.id AND v.campaign_id = ? ORDER BY f.created_at ASC, f.id ASC`, [id])
    const timezone = await queryOne<{timezone:string}>(database,'SELECT timezone FROM workspace_settings LIMIT 1')
    if(!timezone)throw new Error('Workspace timezone is required')
    const archived = await queryOne<{archivedAt:number|null}>(database,'SELECT archived_at AS archivedAt FROM campaigns WHERE id=?',[id])
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:timezone.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    const person = (personId: string, name: string) => ({ id: personId, initials: toInitials(name), name })
    return {
      activity: activity.map((entry) => ({
        id: entry.id,
        type: entry.type, subjectId: entry.subjectId, subjectTitle: entry.subjectTitle, fieldName: entry.fieldName, previousValue: entry.previousValue, nextValue: entry.nextValue,
        actionId: readActivityMessage(entry.message).actionId,
        description: readActivityMessage(entry.message).message || entry.type,
        occurredAt: iso(entry.createdAt),
        actor: entry.actorId && entry.actorName ? person(entry.actorId, entry.actorName) : null,
      })),
      customFields: custom.map((field) => ({ id: field.id, name: field.name, type: field.type, options: JSON.parse(field.optionsJson) as string[], value: field.valueJson === null ? null : JSON.parse(field.valueJson) as string | boolean | string[] })),
      decisions: decisions.map((decision) => ({
        id: decision.id,
        title: decision.title,
        priority: decision.priority,
        state: decision.state,
        dueAt: iso(decision.dueAt),
        requester: person(decision.requesterId, decision.requesterName),
        assignee: decision.assigneeId && decision.assigneeName ? person(decision.assigneeId, decision.assigneeName) : null,
        version: decision.version,
      })),
      deliverables: deliverables.map((deliverable) => ({
        id: deliverable.id,
        title: deliverable.title,
        owner: person(deliverable.ownerId, deliverable.ownerName),
        dueDate: deliverable.dueDate,
        state: deliverable.state,
        overdue: archived?.archivedAt===null && deliverable.state !== 'Complete' && Boolean(deliverable.dueDate && deliverable.dueDate < today),
        version: deliverable.version,
      })),
      milestones: milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        owner: person(milestone.ownerId, milestone.ownerName),
        type: milestone.type,
        status: milestone.status,
        startDate: milestone.startDate,
        endDate: milestone.endDate,
        overdue: archived?.archivedAt===null && milestone.status !== 'Complete' && (milestone.endDate ?? milestone.startDate) < today,
        dependencyConflict: milestone.conflictReason !== null,
        version: milestone.version,
      })),
      risks: risks.map((risk) => ({
        id: risk.id,
        title: risk.title,
        severity: risk.severity,
        state: risk.state,
        owner: person(risk.ownerId, risk.ownerName),
        dueDate: risk.dueDate,
        signal: risk.signal,
        mitigation: risk.mitigation,
        version: risk.version,
      })),
    }
  },

})

export const mapCampaignSummary = campaignSummary
