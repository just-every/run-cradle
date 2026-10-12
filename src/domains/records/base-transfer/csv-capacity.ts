import { ImportInputError } from './input-error'
import type { BasePreview, ImportOptions, PreparedSource } from './contracts'
import type { CorrespondenceReview } from './correspondence-format'
import { AdmissionError } from '../../admission/errors'
import { limit } from './format'

/** Extra CSV columns are proven incoming projections, never an ordinary field-cap escape. */
export function validateCsvCapacity(source: PreparedSource, options: ImportOptions, review?: CorrespondenceReview): void {
 if (source.format !== 'csv-set') return
 const references = new Map<string, Set<string>>()
 for (const ref of review?.references ?? []) {
  const key = JSON.stringify([ref.tableKey, ref.columnKey]), edges = references.get(key) ?? new Set<string>()
  edges.add(JSON.stringify([ref.rowKey, ref.selectedRowKey]))
  references.set(key, edges)
 }
 for (const table of source.tables) {
  if (table.columns.length <= 80) continue
  if (!review) limit('fields', 80, table.columns.length, table.key, 1)
  const columns = options.tables?.[table.key]?.columns ?? {}, projections = table.columns.filter(column => columns[column.key]?.derivedFrom)
  limit('fields', 80, table.columns.length - projections.length, table.key, 1)
  limit('incomingRelations', 80, projections.length, table.key, 1)
  for (const column of projections) {
   const choice = columns[column.key]!, canonical = choice.derivedFrom!, writer = options.tables?.[canonical.tableKey]?.columns?.[canonical.columnKey]
   const flags = source.csvCorrespondence!.tables.find(item => item.filename === table.key)!.columns.find(item => item.key === column.key)!
   if (choice.type !== 'relation' || choice.cardinality !== 'many' || choice.relationTableKey !== canonical.tableKey || writer?.type !== 'relation' || writer.derivedFrom || writer.relationTableKey !== table.key || flags.required || flags.unique) throw new ImportInputError(`${table.key}.${column.key}: extra columns require an exact incoming projection and canonical writer`)
   const actual = references.get(JSON.stringify([table.key, column.key])) ?? new Set<string>()
   const expected = new Set([...(references.get(JSON.stringify([canonical.tableKey, canonical.columnKey])) ?? [])].map(edge => { const [row, target] = JSON.parse(edge); return JSON.stringify([target, row]) }))
   if (actual.size !== expected.size || [...expected].some(edge => !actual.has(edge))) throw new ImportInputError(`${table.key}.${column.key}: extra incoming projection differs from its canonical writer`)
  }
 }
}

/** A read-only wide preview may propose correspondence; no saved review may rely on unaccepted choices. */
export function requireCsvCapacityAcceptance(preview: BasePreview): void {
 if (preview.source.format === 'csv-set' && preview.source.tables.some(table => table.columns.length > 80) && !preview.correspondenceReview?.accepted) throw new AdmissionError('validation', 'Accept the exact CSV correspondence before saving a review with additional incoming projections.')
}
