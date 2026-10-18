import { canonical } from '../admission/canonical'
import type { CellValue, CommandInput, Ref, RevisionRef } from '../../contracts/primitives'
import type { RequestContext } from '../authority/ports'
import type { RecordActionDependencies } from './actions.server'
import { ApiError } from '../../core/registry/errors'
import { AdmissionError } from '../admission/errors'

type Patch = { ref: Ref; changes: Record<string, CellValue> } | { appId: string; entityId: string; rows: { recordId: string; changes: Record<string, CellValue>; ifValues?: Record<string, CellValue>; unchangedSince?: number }[] }

/** The final SQL guard can lose a race after preparation. Describe that refusal
 * from a fresh authorized read, without retrying or exposing restricted cells. */
export function describeRecordConflict({ reader, policy, descriptors }: Pick<RecordActionDependencies, 'reader' | 'policy' | 'descriptors'>) {
  return async (ctx: RequestContext, command: CommandInput<Patch>, error: Error): Promise<Error> => {
    const input = command.input
    const { appId, entityId } = 'ref' in input ? input.ref : input
    const rows = 'ref' in input ? [{ recordId: input.ref.recordId, changes: input.changes }] : input.rows
    const otherChanges=await reader.otherActorCellChanges(ctx,rows.flatMap(row=>'unchangedSince' in row&&row.unchangedSince!==undefined?[{ref:{appId,entityId,recordId:row.recordId},version:row.unchangedSince}]:[]))
    const scope = await policy.scope(ctx, { appId, entityId, purpose: 'read' })
    const schema = descriptors.get(appId, entityId).schema
    const issues: { path: string; fieldId: string; message: string }[] = [], currentVersions: RevisionRef[] = []
    await reader.withRows(ctx, scope, rows.map(row => ({ appId, entityId, recordId: row.recordId })), async () => {
      for (const [index, row] of rows.entries()) {
        const current = await reader.record(ctx, scope, { appId, entityId, recordId: row.recordId })
        if (command.expected.find(value => value.ref.appId === appId && value.ref.entityId === entityId && value.ref.recordId === row.recordId)?.version === current.version && !('ifValues' in row && row.ifValues)) continue
        const beforeIssues=issues.length
        for (const id of Object.keys(row.changes)) {
          const field = schema.fields.find(field => field.id === id), cell = current.fields[id]
          if (!field || !scope.readableFieldIds.includes(id) || !scope.writableFieldIds.includes(id) || cell?.state !== 'value') throw new AdmissionError('forbidden', 'The changed field is no longer readable and writable.')
          if ('ifValues' in row && row.ifValues && canonical(cell.value)===canonical(row.ifValues[id]!) && !otherChanges.has(`${row.recordId}:${id}`)) continue
          issues.push({ path: 'ref' in input ? `changes.${id}` : `rows.${index}.changes.${id}`, fieldId: id, message: `Row ${index + 1}, ${field.label}: record changed; current value is ${JSON.stringify(cell.value)}.` })
        }
        if(issues.length>beforeIssues)currentVersions.push({ref:current.ref,version:current.version})
      }
    })
    await reader.assertScope(ctx, scope)
    return currentVersions.length ? new ApiError('version_conflict', 'The record changes were not saved. Review the current values.', { issues, currentVersions }) : error
  }
}
