import { drizzle } from 'drizzle-orm/d1'

import { schema } from './schema'

export const createDatabase = (binding: D1Database) => drizzle(binding, { schema })

export const checkDatabase = async (binding: D1Database) => {
  await binding.prepare('SELECT 1').first()
}
