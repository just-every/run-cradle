import { useState } from 'react'
import type { Cell } from '../../contracts/primitives'
import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import { CellDisplay } from '../records/record-fields'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'

export function HistoryRestore({ record, schema, fieldId, value, auditId, onRestored }: { record: RecordRow; schema: EntitySchema; fieldId: string; value: Cell; auditId: string; onRestored: () => void }) {
  const [reviewing, setReviewing] = useState(false)
  const command = useCommand<RecordRow>(`history-restore:${record.id}:${auditId}:${fieldId}`)
  const field = schema.fields.find(field => field.id === fieldId)
  if (!field || field.readOnly || field.type === 'computed' || value.state !== 'value' || record.fields[fieldId]?.state !== 'value' || !record.allowedActions.some(action => action.action === 'record.patch' && action.enabled)) return null
  const previousValue = value.value
  const busy = !['idle', 'failed', 'committed', 'cancelled'].includes(command.result.state)
  async function restore() {
    const result = await command.submit('/api/v1/commands/record.patch', { ref: record.ref, changes: { [fieldId]: previousValue } }, [{ ref: record.ref, version: record.version }])
    if (result) onRestored()
  }
  return <div className="cr-history-restore">{reviewing ? <><p>Restore <strong>{field.label}</strong> to <CellDisplay appId={schema.appId} field={field} cell={value} />? This replaces its current value in version {record.version}.</p><div className="cr-actions"><button className="cr-button" disabled={busy} onClick={() => void restore()}>Confirm restore {field.label}</button><button className="cr-button cr-button--quiet" disabled={busy} onClick={() => setReviewing(false)}>Cancel restore</button></div><CommandFeedback {...command} /></> : <button className="cr-button cr-button--quiet" onClick={() => setReviewing(true)}>Restore previous {field.label}</button>}</div>
}
