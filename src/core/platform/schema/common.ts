import { integer, text } from 'drizzle-orm/sqlite-core'

export const entityColumns = () => ({
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  version: integer('version').notNull().default(1),
})

export const timestamp = <Name extends string>(name: Name) => integer(name, { mode: 'timestamp_ms' })

export const flag = <Name extends string>(name: Name) => integer(name, { mode: 'boolean' })

export const wholeNumber = <Name extends string>(name: Name) => integer(name)
