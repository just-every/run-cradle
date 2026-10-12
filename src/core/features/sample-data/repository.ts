import type { Database } from '../shared/repository'
import { executeBatch, millis, queryOne } from '../shared/repository'
import type { SampleData } from './data'

const insert = (table: string, columns: string[], values: unknown[]) => ({
  query: `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  values,
})

const entity = (record: { id: string, createdAt: string, updatedAt: string, version: number }) => [
  record.id,
  millis(record.createdAt),
  millis(record.updatedAt),
  record.version,
]

export const createSampleDataRepository = (database: Database) => ({
  async isInstalled() {
    return Boolean(await queryOne<{ id: string }>(database, 'SELECT id FROM sample_installations LIMIT 1'))
  },

  async install(data: SampleData) {
    const statements = [
      insert('workspace', ['id', 'created_at', 'updated_at', 'name', 'timezone', 'currency', 'version'], [
        data.workspace.id, millis(data.workspace.createdAt), millis(data.workspace.updatedAt), data.workspace.name,
        data.workspace.timezone, data.workspace.currency, data.workspace.version,
      ]),
      ...data.operators.map((operator) => insert('operators', ['id', 'created_at', 'updated_at', 'version', 'name', 'email', 'active'], [
        ...entity(operator), operator.name, operator.email, Number(operator.active),
      ])),
      insert('workspace_settings', ['id', 'created_at', 'updated_at', 'version', 'workspace_name', 'timezone', 'currency', 'quiet_hours_start', 'quiet_hours_end', 'ai_enabled', 'ai_daily_ceiling'], [
        ...entity(data.settings), data.settings.workspaceName, data.settings.timezone, data.settings.currency,
        data.settings.quietHoursStart, data.settings.quietHoursEnd, Number(data.settings.aiEnabled), data.settings.aiDailyCeiling,
      ]),
      ...data.campaigns.map((campaign) => insert('campaigns', ['id', 'created_at', 'updated_at', 'version', 'code', 'name', 'owner_id', 'start_date', 'launch_date', 'objective', 'status_summary', 'phase', 'status', 'health', 'health_updated_at', 'budget_minor', 'spend_minor', 'archived_at'], [
        ...entity(campaign), campaign.code, campaign.name, campaign.ownerId, campaign.startDate, campaign.launchDate,
        campaign.objective, campaign.statusSummary, campaign.phase, campaign.status, campaign.health,
        millis(campaign.healthUpdatedAt), campaign.budgetMinor, campaign.spendMinor, millis(campaign.archivedAt),
      ])),
      ...data.campaignTags.map((tag) => insert('campaign_tags', ['id', 'created_at', 'updated_at', 'version', 'campaign_id', 'tag'], [
        ...entity(tag), tag.campaignId, tag.tag,
      ])),
      ...data.deliverables.map((deliverable) => insert('deliverables', ['id', 'created_at', 'updated_at', 'version', 'campaign_id', 'owner_id', 'title', 'due_date', 'state', 'completed_at', 'completed_by_id'], [
        ...entity(deliverable), deliverable.campaignId, deliverable.ownerId, deliverable.title, deliverable.dueDate,
        deliverable.state, millis(deliverable.completedAt), deliverable.completedById,
      ])),
      ...data.milestones.map((milestone) => insert('milestones', ['id', 'created_at', 'updated_at', 'version', 'campaign_id', 'owner_id', 'title', 'type', 'status', 'start_date', 'end_date', 'conflict_reason'], [
        ...entity(milestone), milestone.campaignId, milestone.ownerId, milestone.title, milestone.type,
        milestone.status, milestone.startDate, milestone.endDate, milestone.conflictReason,
      ])),
      ...data.milestoneDependencies.map((dependency) => insert('milestone_dependencies', ['id', 'created_at', 'updated_at', 'version', 'milestone_id', 'predecessor_id'], [
        ...entity(dependency), dependency.milestoneId, dependency.predecessorId,
      ])),
      ...data.risks.map((risk) => insert('risks', ['id', 'created_at', 'updated_at', 'version', 'campaign_id', 'owner_id', 'title', 'severity', 'due_date', 'signal', 'mitigation', 'state', 'resolution_note', 'escalated_at', 'escalated_by_id', 'escalation_reason'], [
        ...entity(risk), risk.campaignId, risk.ownerId, risk.title, risk.severity, risk.dueDate, risk.signal,
        risk.mitigation, risk.state, risk.resolutionNote, millis(risk.escalatedAt), risk.escalatedById, risk.escalationReason,
      ])),
      ...data.decisions.map((decision) => insert('decisions', ['id', 'created_at', 'updated_at', 'version', 'campaign_id', 'risk_id', 'requester_id', 'assignee_id', 'title', 'priority', 'due_at', 'recommendation', 'impact', 'state', 'outcome_at', 'outcome_by_id', 'rationale'], [
        ...entity(decision), decision.campaignId, decision.riskId, decision.requesterId, decision.assigneeId,
        decision.title, decision.priority, millis(decision.dueAt), decision.recommendation, decision.impact,
        decision.state, millis(decision.outcomeAt), decision.outcomeById, decision.rationale,
      ])),
      ...data.lenses.map((lens) => insert('lenses', ['id', 'created_at', 'updated_at', 'version', 'name', 'description', 'record_type', 'conditions_json', 'sort_json', 'fields_json', 'display', 'created_by_id', 'shipped_key'], [
        ...entity(lens), lens.name, lens.description, lens.recordType, JSON.stringify(lens.conditions), JSON.stringify(lens.sort),
        JSON.stringify(lens.fields), lens.display, lens.createdById, lens.shippedKey,
      ])),
      ...data.activityEntries.map((entry) => insert('activity_entries', ['id', 'created_at', 'updated_at', 'version', 'campaign_id', 'subject_id', 'actor_id', 'type', 'field_name', 'previous_value', 'next_value', 'message'], [
        ...entity(entry), entry.campaignId, entry.subjectId, entry.actorId, entry.type, entry.fieldName,
        entry.previousValue, entry.nextValue, entry.message,
      ])),
      ...data.comments.map((comment) => insert('comments', ['id', 'created_at', 'updated_at', 'version', 'campaign_id', 'author_id', 'body', 'deleted_at'], [
        ...entity(comment), comment.campaignId, comment.authorId, comment.body, millis(comment.deletedAt),
      ])),
      ...data.automations.map((automation) => insert('automations', ['id', 'created_at', 'updated_at', 'version', 'name', 'trigger_type', 'trigger_config_json', 'actions_json', 'enabled', 'definition_version'], [
        ...entity(automation), automation.name, automation.triggerType, JSON.stringify(automation.triggerConfig),
        JSON.stringify(automation.actions), Number(automation.enabled), automation.definitionVersion,
      ])),
      ...data.automationRuns.map((run) => insert('automation_runs', ['id', 'created_at', 'updated_at', 'version', 'automation_id', 'definition_version', 'subject_id', 'state', 'queued_at', 'started_at', 'finished_at', 'affected_count', 'error_code', 'error_message'], [
        ...entity(run), run.automationId, run.definitionVersion, run.subjectId, run.state, millis(run.queuedAt),
        millis(run.startedAt), millis(run.finishedAt), run.affectedCount, run.errorCode, run.errorMessage,
      ])),
      ...data.notifications.map((notification) => insert('notifications', ['id', 'created_at', 'updated_at', 'version', 'operator_id', 'kind', 'subject_id', 'title', 'body', 'unavailable'], [
        ...entity(notification), notification.operatorId, notification.kind, notification.subjectId,
        notification.title, notification.body, Number(notification.unavailable),
      ])),
      ...data.notificationReads.map((read) => insert('notification_reads', ['id', 'created_at', 'updated_at', 'version', 'notification_id', 'operator_id', 'read_at'], [
        ...entity(read), read.notificationId, read.operatorId, millis(read.readAt),
      ])),
      insert('sample_installations', ['id', 'created_at', 'updated_at', 'version', 'installed_by_id', 'source_hash'], [
        '01ARZ3NDEKTSV4RRFFQ69G5FZZ', Date.now(), Date.now(), 1, data.operators[0].id, 'launch-command-2026-09-v1',
      ]),
    ]

    await executeBatch(database, statements)
  },
})
