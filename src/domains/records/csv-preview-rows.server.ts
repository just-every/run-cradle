import type { CellValue } from '../../contracts/primitives'
import type { PolicyScope, RequestContext } from '../authority/ports'
import type { SqlPredicate } from '../admission/ports'
import { AdmissionError } from '../admission/errors'
import { canonical } from '../admission/canonical'
import { createUlid } from '../../core/shared/ids'
import type { RecordRow } from './contracts'
import type { EntityDescriptor } from './descriptors.server'
import type { createRecordServices } from './service.server'
import type { csvPreviewInput } from './csv.server'
import type { z } from 'zod'
import type { parseCsv } from '../portability/csv'
import type { CsvImportRejection, CsvImportRow } from './csv-import-contracts'
import { createCsvLabels, decodeDisplayCsvValue, displayCsvValue } from './csv-display.server'
import { decodeCsvValue } from './csv-values'
import { idSchema } from './validators'
import { validateCsvCell } from './csv-validation'

export async function previewCsvRows(
  ctx: RequestContext, request: z.infer<typeof csvPreviewInput>, csv: ReturnType<typeof parseCsv>,
  descriptor: EntityDescriptor, scope: PolicyScope, existing: RecordRow[],
  writer: ReturnType<typeof createRecordServices>['writer'], labels: ReturnType<typeof createCsvLabels>,
) {
  const byId = request.mergeFieldId === '_record_id'
  const mapped = request.mapping.map(mapping => {
    const field = descriptor.fields.get(mapping.fieldId)?.field
    if (!field || !scope.readableFieldIds.includes(field.id) || !scope.writableFieldIds.includes(field.id))
      throw new AdmissionError('forbidden', 'Mapped field is unavailable.')
    return { field, index: csv.headers.indexOf(mapping.column) }
  })
  const merge = mapped.find(mapping => mapping.field.id === request.mergeFieldId)
  const primary = descriptor.schema.primaryFieldId
    ? descriptor.fields.get(descriptor.schema.primaryFieldId)?.field
    : descriptor.schema.fields.find(field => field.type === 'text')
  const primaryColumn = mapped.find(mapping => mapping.field.id === primary?.id)
  const rows: CsvImportRow[] = [], errors: CsvImportRejection[] = [], guards: SqlPredicate[] = []
  const keys = csv.rows.map(cells => {
    try {
      const value = byId ? cells[csv.headers.indexOf('_record_id')]! : decodeDisplayCsvValue(merge!.field, cells[merge!.index]!)
      if (byId ? !idSchema.safeParse(value).success : value === null || value === '' || typeof value === 'string' && !value.trim())
        throw new AdmissionError('validation', 'The matching value must be nonempty and unique within the CSV.')
      return { key: byId ? String(value) : canonical(value) }
    } catch (error) {
      if (!(error instanceof AdmissionError) || error.code !== 'validation') throw error
      return { error: error.message }
    }
  })
  const counts = new Map<string, number>()
  for (const key of keys) if (key.key !== undefined) counts.set(key.key, (counts.get(key.key) ?? 0) + 1)

  for (const [index, cells] of csv.rows.entries()) {
    const row = index + 2, key = keys[index]!
    let label = primaryColumn ? cells[primaryColumn.index]!.trim() : merge ? cells[merge.index]!.trim() : ''
    if (!label) label = `CSV row ${row}`
    try {
      const problems: string[] = []
      if (key.error) problems.push(key.error)
      if (key.key !== undefined && counts.get(key.key)! > 1) problems.push('The matching value appears more than once in this CSV. Give each row a unique matching value.')
      const matches = key.key === undefined ? [] : existing.filter(record => {
        if (byId) return record.id === key.key
        const cell = record.fields[merge!.field.id]
        return cell?.state === 'value' && canonical(cell.value) === key.key
      })
      if (byId && !key.error && matches.length !== 1) throw new AdmissionError('forbidden', 'An original record is unavailable. Recovery updates only currently accessible existing records.')
      if (matches.length > 1) problems.push('The matching value identifies several records. Choose a unique matching field.')
      const prior = matches[0], values: Record<string, CellValue> = {}
      if (!primaryColumn && primary && prior?.fields[primary.id]?.state === 'value') {
        const cell = prior.fields[primary.id]!
        if (cell.state === 'value' && cell.value !== null) label = displayCsvValue(primary, cell.value)
      }
      for (const { field, index: column } of mapped) {
        const raw = cells[column]!
        try {
          values[field.id] = byId ? decodeCsvValue(field, raw)
            : field.type === 'relation' ? await labels.resolve(field, raw) : decodeDisplayCsvValue(field, raw)
        } catch (error) {
          if (!(error instanceof AdmissionError) || error.code !== 'validation') throw error
          problems.push(error.message)
        }
      }
      if (!prior) for (const field of descriptor.schema.fields)
        if (field.required && field.defaultValue === undefined && field.type !== 'computed' && !mapped.some(mapping => mapping.field.id === field.id)) {
          try { validateCsvCell(field, null) } catch (error) {
            if (!(error instanceof AdmissionError) || error.code !== 'validation') throw error
            problems.push(error.message)
          }
        }
      if (problems.length) {
        const uniqueProblems = [...new Set(problems)]
        errors.push({ row, label, message: uniqueProblems.join(' '), problems: uniqueProblems })
        continue
      }
      const changed = Object.fromEntries(Object.entries(values).filter(([id, value]) => {
        const cell = prior?.fields[id]
        return !prior || cell?.state !== 'value' || canonical(cell.value) !== canonical(value)
      }))
      const record: CsvImportRow = { row, label, id: prior?.id ?? createUlid(), version: prior?.version ?? null,
        values: changed, operation: prior ? Object.keys(changed).length ? 'update' : 'unchanged' : 'create' }
      const change = record.version === null ? await writer.prepareCreate(ctx, scope, changed, record.id)
        : await writer.prepareChange(ctx, scope, { ref: { appId: request.appId, entityId: request.entityId, recordId: record.id }, expectedVersion: record.version, changes: changed })
      guards.push(...change.guards)
      rows.push(record)
    } catch (error) {
      // Authority, stale snapshots, transport and configuration failures still fail the whole request.
      if (!(error instanceof AdmissionError) || error.code !== 'validation') throw error
      errors.push({ row, label, message: error.message })
    }
  }
  return { rows, errors, guards }
}
