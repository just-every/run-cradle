import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { entityColumns, flag, timestamp, wholeNumber } from './common'

export const workspace = sqliteTable('workspace', {
  ...entityColumns(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
  currency: text('currency').notNull(),
})

export const operators = sqliteTable('operators', {
  ...entityColumns(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  active: flag('active').notNull().default(true),
})

export const sessions = sqliteTable('sessions', {
  ...entityColumns(),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
})

export const workspaceSettings = sqliteTable('workspace_settings', {
  ...entityColumns(),
  workspaceName: text('workspace_name').notNull(),
  timezone: text('timezone').notNull(),
  currency: text('currency').notNull(),
  quietHoursStart: text('quiet_hours_start').notNull(),
  quietHoursEnd: text('quiet_hours_end').notNull(),
  aiEnabled: flag('ai_enabled').notNull().default(false),
  aiDailyCeiling: wholeNumber('ai_daily_ceiling').notNull().default(200),
})
