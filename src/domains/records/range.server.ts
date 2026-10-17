import { z } from 'zod'
import type { CellValue, CommandInput, RevisionRef } from '../../contracts/primitives'
import { ApiError } from '../../core/registry/errors'
import type { AdmissionPlan } from '../admission/ports'
import { canonical, canonicalHash } from '../admission/canonical'
import { AdmissionError } from '../admission/errors'
import { and, eq, exists } from '../admission/sql.server'
import type { RequestContext } from '../authority/ports'
import type { RecordActionDependencies } from './actions.server'
import type { RecordRow } from './contracts'
import { schemaGuard } from './change.server'
import { cellValueSchema, idSchema, validateCell } from './validators'

export const rangePatchSchema = z.object({
  appId: idSchema,
  entityId: idSchema,
  rows: z.array(z.object({ recordId: idSchema, changes: z.record(idSchema, cellValueSchema) }).strict()).min(1).max(500),
}).strict()
type RangePatch = z.infer<typeof rangePatchSchema>
type CellIssue = { path: string; fieldId?: string; message: string }
export type RangePatchResult = { rows: RecordRow[]; inverse: { recordId: string; changes: Record<string, CellValue> }[] }

/** A range is one ordinary patch admission: its guards, audit and record events
 * commit together. The same input carries a client's inverse for undo/redo. */
export function createRangePatchPreparer({ reader, writer, descriptors, policy }: Pick<RecordActionDependencies, 'reader' | 'writer' | 'descriptors' | 'policy'>) {
  return async (ctx: RequestContext, command: CommandInput<RangePatch>): Promise<AdmissionPlan<RangePatchResult>> => {
    const { appId, entityId, rows } = command.input
    if (new Set(rows.map(row => row.recordId)).size !== rows.length)
      throw new ApiError('validation', 'A range must contain distinct records.')
    const count = rows.reduce((total, row) => total + Object.keys(row.changes).length, 0)
    if (!count || count > 10000) throw new ApiError('capacity_limit', 'A range supports 1–10,000 cells across at most 500 distinct records.')
    const refs = rows.map(row => ({ appId, entityId, recordId: row.recordId }))
    const expected = new Map(command.expected.map(value => [value.ref.recordId, value]))
    if (command.expected.length !== rows.length || expected.size !== rows.length || refs.some(ref => {
      const value = expected.get(ref.recordId)
      return !value || value.ref.appId !== appId || value.ref.entityId !== entityId
    })) throw new ApiError('validation', 'One current expected version is required for every range record.')
    const descriptor = descriptors.get(appId, entityId)
    const scope = await policy.scope(ctx, { appId, entityId, purpose: 'read' })
    const current: RecordRow[] = [], issues: CellIssue[] = [], conflicts: CellIssue[] = [], versions: RevisionRef[] = []
    const normalized: Record<string, CellValue>[] = []
    let forbidden = false
    await reader.withRows(ctx, scope, refs, async () => {
      for (const [index, row] of rows.entries()) {
        const record = await reader.record(ctx, scope, refs[index]!)
        current.push(record)
        const changes: Record<string, CellValue> = {}
        const stale = record.version !== expected.get(row.recordId)!.version
        if (stale) versions.push({ ref: record.ref, version: record.version })
        for (const [fieldId, value] of Object.entries(row.changes)) {
          const field = descriptor.fields.get(fieldId)?.field, cell = record.fields[fieldId]
          const path = `rows.${index}.changes.${fieldId}`, label = `Row ${index + 1}, ${field?.label ?? fieldId}`
          if (!field || field.readOnly || field.type === 'computed' || descriptor.writePolicy?.patch === false || descriptor.writePolicy?.protectedFieldIds?.includes(fieldId) || !scope.writableFieldIds.includes(fieldId) || cell?.state !== 'value') {
            forbidden = true
            issues.push({ path, fieldId, message: `${label}: this cell is not readable and writable.` })
            continue
          }
          if (stale) conflicts.push({ path, fieldId, message: `${label}: record changed; current value is ${JSON.stringify(cell.value)}.` })
          try { changes[fieldId] = validateCell(field, value) }
          catch (error) {
            if (!(error instanceof AdmissionError) || error.code !== 'validation') throw error
            issues.push({ path, fieldId, message: `${label}: ${error.message}` })
          }
        }
        normalized.push(changes)
      }
      if (issues.length) throw new ApiError(forbidden ? 'forbidden' : 'validation', 'The range was not saved. Correct the named cells.', { issues })
      if (versions.length) throw new ApiError('version_conflict', 'The range was not saved because records changed. Review the current values.', { issues: conflicts, currentVersions: versions })
    })
    const hash = await canonicalHash({ action: 'record.patch', input: command.input, expected: command.expected, controlEpoch: command.controlEpoch ?? null })
    const permit = await policy.authorize(ctx, { appId, action: 'record.patch', expected: command.expected, fieldIds: [...new Set(rows.flatMap(row => Object.keys(row.changes)))], cost: [], inputHash: hash, commandId: command.commandId })
    const prepared: Awaited<ReturnType<typeof writer.prepareChange>>[] = [], result: RangePatchResult = { rows: [], inverse: [] }
    await reader.withRows(ctx, scope, refs, async () => {
      for (const [index, row] of rows.entries()) {
        const before = current[index]!, changes: Record<string, CellValue> = {}, prior: Record<string, CellValue> = {}
        for (const [fieldId, value] of Object.entries(normalized[index]!)) {
          const cell = before.fields[fieldId]!
          if (cell.state === 'value' && canonical(cell.value) !== canonical(value)) { changes[fieldId] = value; prior[fieldId] = cell.value }
        }
        if (!Object.keys(changes).length) { result.rows.push(before); continue }
        try {
          const change = await writer.prepareChange(ctx, scope, { ref: before.ref, expectedVersion: before.version, changes })
          prepared.push(change)
          result.rows.push(change.next)
          result.inverse.push({ recordId: row.recordId, changes: prior })
        } catch (error) {
          if (!(error instanceof AdmissionError) || !['validation', 'forbidden'].includes(error.code)) throw error
          for (const fieldId of Object.keys(changes)) issues.push({ path: `rows.${index}.changes.${fieldId}`, fieldId, message: `Row ${index + 1}, ${descriptor.fields.get(fieldId)!.field.label}: ${error.message}` })
          if (error.code === 'forbidden') forbidden = true
        }
      }
    })
    if (issues.length) throw new ApiError(forbidden ? 'forbidden' : 'validation', 'The range was not saved. Correct the named cells.', { issues })
    return { commandId: command.commandId, action: 'record.patch', appId, canonicalInputHash: hash, permit,
      guards: [schemaGuard(descriptor), ...scope.currentAuthorityGuards, ...current.map(record => exists(descriptor.table, and(eq(descriptor.table, descriptor.idColumn, record.id), eq(descriptor.table, descriptor.versionColumn, record.version)))), ...prepared.flatMap(change => change.guards)],
      mutations: prepared.flatMap(change => change.mutations), audit: prepared.flatMap(change => change.audit),
      events: [], outbox: [], changed: prepared.map(change => ({ ref: change.next.ref, version: change.next.version })), committedResult: result }
  }
}
