import { sql } from 'drizzle-orm'
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { entityColumns, flag, timestamp, wholeNumber } from './common'
import { operators } from './foundation'
import { campaigns } from './portfolio'

export const risks = sqliteTable('risks', {
  ...entityColumns(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => operators.id),
  title: text('title').notNull(),
  severity: text('severity').notNull(),
  dueDate: text('due_date'),
  signal: text('signal').notNull(),
  mitigation: text('mitigation').notNull(),
  state: text('state').notNull(),
  resolutionNote: text('resolution_note'),
  escalatedAt: timestamp('escalated_at'),
  escalatedById: text('escalated_by_id').references(() => operators.id),
  escalationReason: text('escalation_reason'),
}, (table) => [index('risks_lens_idx').on(table.severity, table.state, table.dueDate, table.id)])

export const decisions = sqliteTable('decisions', {
  ...entityColumns(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  riskId: text('risk_id').references(() => risks.id),
  requesterId: text('requester_id').notNull().references(() => operators.id),
  assigneeId: text('assignee_id').references(() => operators.id),
  title: text('title').notNull(),
  priority: text('priority').notNull(),
  dueAt: timestamp('due_at').notNull(),
  recommendation: text('recommendation').notNull(),
  impact: text('impact').notNull(),
  state: text('state').notNull(),
  outcomeAt: timestamp('outcome_at'),
  outcomeById: text('outcome_by_id').references(() => operators.id),
  rationale: text('rationale'),
}, (table) => [index('decisions_queue_idx').on(table.state, table.dueAt, table.id)])

export const lenses = sqliteTable('lenses', {
  ...entityColumns(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  recordType: text('record_type').notNull(),
  conditionsJson: text('conditions_json').notNull(),
  sortJson: text('sort_json').notNull(),
  fieldsJson: text('fields_json').notNull(),
  display: text('display').notNull(),
  createdById: text('created_by_id').notNull().references(() => operators.id),
  shippedKey: text('shipped_key').unique(),
})

export const activityEntries = sqliteTable('activity_entries', {
  ...entityColumns(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').notNull(),
  actorId: text('actor_id').references(() => operators.id),
  type: text('type').notNull(),
  fieldName: text('field_name'),
  previousValue: text('previous_value'),
  nextValue: text('next_value'),
  message: text('message').notNull(),
})

export const comments = sqliteTable('comments', {
  ...entityColumns(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => operators.id),
  body: text('body').notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const automations = sqliteTable('automations', {
  ...entityColumns(),
  name: text('name').notNull(),
  triggerType: text('trigger_type').notNull(),
  triggerConfigJson: text('trigger_config_json').notNull(),
  actionsJson: text('actions_json').notNull(),
  enabled: flag('enabled').notNull(),
  definitionVersion: wholeNumber('definition_version').notNull(),
})

export const automationRuns = sqliteTable('automation_runs', {
  ...entityColumns(),
  automationId: text('automation_id').notNull().references(() => automations.id, { onDelete: 'cascade' }),
  definitionVersion: wholeNumber('definition_version').notNull(),
  subjectId: text('subject_id'),
  state: text('state').notNull(),
  queuedAt: timestamp('queued_at').notNull(),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  affectedCount: wholeNumber('affected_count').notNull().default(0),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
})

export const notifications = sqliteTable('notifications', {
  ...entityColumns(),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  kind: text('kind').notNull(),
  subjectId: text('subject_id'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  unavailable: flag('unavailable').notNull().default(false),
}, (table) => [index('notifications_operator_idx').on(table.operatorId, sql`${table.createdAt} DESC`, table.id)])

export const notificationReads = sqliteTable('notification_reads', {
  ...entityColumns(),
  notificationId: text('notification_id').notNull().references(() => notifications.id, { onDelete: 'cascade' }),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  readAt: timestamp('read_at').notNull(),
}, (table) => [uniqueIndex('notification_reads_pair_unique').on(table.notificationId, table.operatorId)])

export const sampleInstallations = sqliteTable('sample_installations', {
  ...entityColumns(),
  installedById: text('installed_by_id').notNull().references(() => operators.id),
  sourceHash: text('source_hash').notNull().unique(),
})
