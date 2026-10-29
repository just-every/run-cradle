import { canonical } from '../admission/canonical'
import type { SqlScalar } from '../admission/ports'
import type { EntityDescriptor } from './descriptors.server'
import type { CsvImportRejection, CsvImportRow } from './csv-import-contracts'
import type { PreparedRecordChange } from './ports'

/** Compare the prepared storage values, including defaults, before reviewing a batch. */
export function csvUniqueConflicts(descriptor: EntityDescriptor, prepared: {
  record: CsvImportRow; change: PreparedRecordChange
}[]): CsvImportRejection[] {
  const problems = new Map<CsvImportRow, string[]>()
  for (const storage of descriptor.fields.values()) {
    if (!storage.field.unique || storage.join || storage.field.type === 'computed') continue
    const columns = [storage.column, ...(storage.currencyColumn ? [storage.currencyColumn, storage.scaleColumn!] : [])]
    const groups = new Map<string, CsvImportRow[]>()
    for (const { record, change } of prepared) {
      const mutation = change.mutations.find(item => item.table.tableId === descriptor.table.tableId && (item.kind === 'insert' || item.kind === 'update'))
      const values: Record<string, SqlScalar> | undefined = mutation?.kind === 'insert' ? mutation.row : mutation?.kind === 'update' ? mutation.set : undefined
      if (!values || columns.some(column => values[column] === null || values[column] === undefined)) continue
      const key = canonical(columns.map(column => values[column]))
      const group = groups.get(key) ?? []
      group.push(record); groups.set(key, group)
    }
    for (const group of groups.values()) if (group.length > 1) {
      for (const record of group) {
        const reasons = problems.get(record) ?? []
        reasons.push(`${storage.field.label} unique: the same value appears in more than one import row.`)
        problems.set(record, reasons)
      }
    }
  }
  return [...problems].map(([record, reasons]) => ({ row: record.row, label: record.label, message: reasons.join(' '), problems: reasons }))
}
