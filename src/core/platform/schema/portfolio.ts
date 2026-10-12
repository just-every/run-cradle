import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { entityColumns, timestamp, wholeNumber } from './common'
import { operators } from './foundation'

export const campaigns = sqliteTable('campaigns', {
  ...entityColumns(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => operators.id),
  startDate: text('start_date').notNull(),
  launchDate: text('launch_date').notNull(),
  objective: text('objective').notNull(),
  statusSummary: text('status_summary').notNull(),
  phase: text('phase').notNull(),
  status: text('status').notNull(),
  health: wholeNumber('health').notNull(),
  healthUpdatedAt: timestamp('health_updated_at').notNull(),
  budgetMinor: wholeNumber('budget_minor').notNull(),
  spendMinor: wholeNumber('spend_minor').notNull(),
  archivedAt: timestamp('archived_at'),
}, (table) => [index('campaigns_active_launch_idx').on(table.archivedAt, table.launchDate, table.id)])

export const campaignTags = sqliteTable('campaign_tags', {
  ...entityColumns(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
}, (table) => [uniqueIndex('campaign_tags_campaign_tag_unique').on(table.campaignId, table.tag)])

export const deliverables = sqliteTable('deliverables', {
  ...entityColumns(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => operators.id),
  title: text('title').notNull(),
  dueDate: text('due_date'),
  state: text('state').notNull(),
  completedAt: timestamp('completed_at'),
  completedById: text('completed_by_id').references(() => operators.id),
}, (table) => [index('deliverables_campaign_idx').on(table.campaignId, table.id)])

export const milestones = sqliteTable('milestones', {
  ...entityColumns(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => operators.id),
  title: text('title').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  conflictReason: text('conflict_reason'),
}, (table) => [index('milestones_timeline_idx').on(table.startDate, table.id)])

export const milestoneDependencies = sqliteTable('milestone_dependencies', {
  ...entityColumns(),
  milestoneId: text('milestone_id').notNull().references(() => milestones.id, { onDelete: 'cascade' }),
  predecessorId: text('predecessor_id').notNull().references(() => milestones.id, { onDelete: 'cascade' }),
}, (table) => [uniqueIndex('milestone_dependencies_pair_unique').on(table.milestoneId, table.predecessorId)])
