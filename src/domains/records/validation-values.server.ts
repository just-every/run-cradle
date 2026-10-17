import type { CellValue, Ref } from '../../contracts/primitives'
import type { EntityDescriptor, FieldStorage } from './descriptors.server'
import { decode } from './codec.server'
import { identifier, trustedPredicate } from '../admission/sql.server'
import type { SqlPredicate } from '../admission/ports'
import { AdmissionError } from '../admission/errors'

function collection(storage: FieldStorage, members: string[]): CellValue {
  if (storage.field.type === 'relation') return members.map(recordId => ({ appId: storage.field.relation!.ownerAppId, entityId: storage.field.relation!.entityId, recordId } satisfies Ref))
  if (storage.field.type === 'attachment') return members.map(fileId => ({ fileId }))
  return members
}
/** Internal validation reads stored values, never policy-redacted response cells. */
export async function storedValidationValues(db: D1Database, descriptor: EntityDescriptor, row: Record<string, unknown>): Promise<Record<string, CellValue>> {
  const values: Record<string, CellValue> = {}
  for (const [id, storage] of descriptor.fields) {
    if (storage.field.type === 'computed') continue
    if (!storage.join) values[id] = decode(storage, row)
    else {
      const rows = await db.prepare(`SELECT value FROM ${identifier(storage.join.table.tableId)} WHERE record_id=? ORDER BY position,id`).bind(String(row[descriptor.idColumn])).all<{ value: string }>()
      values[id] = collection(storage, rows.results.map(r => r.value))
    }
  }
  return values
}
export function snapshotValidationValues(descriptor: EntityDescriptor, row: Record<string, unknown>, snapshots: Record<string, Record<string, unknown>[]>): Record<string, CellValue> {
  return Object.fromEntries([...descriptor.fields].filter(([,storage]) => storage.field.type !== 'computed').map(([id, storage]) => [id, storage.join
    ? collection(storage, (snapshots[storage.join.table.tableId] ?? []).filter(r => r.record_id === row[descriptor.idColumn]).sort((a,b) => Number(a.position) - Number(b.position)).map(r => String(r.value))) : decode(storage, row)]))
}
/** Friendly preflight plus a transaction guard; physical UNIQUE remains the race fence. */
export async function uniqueValidationGuards(db: D1Database, descriptor: EntityDescriptor, values: Record<string, CellValue>, encoded: Record<string, unknown>, recordId: string): Promise<SqlPredicate[]> {
  const guards: SqlPredicate[] = []
  for (const [id, storage] of descriptor.fields) {
    if (!storage.field.unique || values[id] === null || values[id] === undefined || storage.field.type === 'computed' || storage.join) continue
    const columns = [storage.column, ...(storage.currencyColumn ? [storage.currencyColumn, storage.scaleColumn!] : [])]
    const predicates = columns.map(column => `${identifier(column)}=?`).join(' AND ')
    const sql = `NOT EXISTS(SELECT 1 FROM ${identifier(descriptor.table.tableId)} WHERE ${identifier(descriptor.idColumn)}<>? AND ${predicates})`
    const guard = trustedPredicate(sql, [recordId, ...columns.map(column => encoded[column] as string | number)])
    const valid = await db.prepare(`SELECT ${sql} AS valid`).bind(...guard.values).first<{ valid: number }>()
    if (!valid?.valid) throw new AdmissionError('validation', `${storage.field.label} unique: ${storage.field.label} must be unique.`)
    guards.push(guard)
  }
  return guards
}
