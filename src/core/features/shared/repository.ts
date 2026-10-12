import type { Platform } from '../../platform'

export type Database = Platform['database']

export const queryAll = async <Row>(database: Database, query: string, values: unknown[] = []) => {
  const result = await database.$client.prepare(query).bind(...values).all<Row>()
  return result.results
}

export const queryOne = <Row>(database: Database, query: string, values: unknown[] = []) =>
  database.$client.prepare(query).bind(...values).first<Row>()

export const execute = (database: Database, query: string, values: unknown[] = []) =>
  database.$client.prepare(query).bind(...values).run()

export const executeBatch = (database: Database, statements: Array<{ query: string, values: unknown[] }>) =>
  database.$client.batch(statements.map(({ query, values }) => database.$client.prepare(query).bind(...values)))

export const iso = (value: number | null) => value === null ? null : new Date(value).toISOString()

export const millis = (value: string | null) => value === null ? null : Date.parse(value)
