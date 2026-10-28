import { useEffect, useId, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import type { CellValue } from '../../contracts/primitives'
import { RECORD_SCHEMA_ENTITY_ID, type EntitySchema, type Field, type RecordRow } from '../../domains/records/contracts'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
import { useGridHistory } from './grid-history'
import { FieldInput } from './record-fields'
import { newRecordValues } from './record-template-picker'

export type ListHistories = MutableRefObject<Map<string, ReturnType<typeof useGridHistory>>>
/** Each table has exactly one maintained history provider, even when it repeats. */
export function ListHistoryBridge({ schema, histories }: { schema: EntitySchema; histories: ListHistories }) {
  const history = useGridHistory()
  useLayoutEffect(() => { histories.current.set(schema.id, history); return () => { if (histories.current.get(schema.id) === history) histories.current.delete(schema.id) } })
  return <div className="cr-list-feedback" aria-label={`${schema.label} edit feedback`}>{history.feedback}</div>
}

export function ListCellEditor({ schema, row, field, onSave, onCancel }: { schema: EntitySchema; row: RecordRow; field: Field; onSave(value: CellValue): Promise<boolean>; onCancel(): void }) {
  const id = useId(), cell = row.fields[field.id]
  const [value, setValue] = useState<CellValue>(cell?.state === 'value' ? cell.value : null)
  const [busy, setBusy] = useState(false)
  return <form className="cr-list-cell-editor" onSubmit={event => { event.preventDefault(); if (busy) return; setBusy(true); void onSave(value).then(saved => { setBusy(false); if (saved) onCancel() }, () => setBusy(false)) }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' && !busy) onCancel() }}>
    <FieldInput appId={schema.appId} entityId={schema.id} subject={row.ref} inputId={`list-edit-${id}`} field={field} value={value} onChange={setValue} />
    <div className="cr-actions"><button type="submit" className="cr-button" disabled={busy}>Save cell</button><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>
}

/** The parent is included in this create command, never attached in a second write. */
export function ListChildEditor({ schema, parent, parentField, onSaved, onCancel }: { schema: EntitySchema; parent: RecordRow; parentField: Field; onSaved(): void; onCancel(): void }) {
  const id = useId()
  const [values, setValues] = useState(() => newRecordValues(schema, { [parentField.id]: parent.ref }))
  const command = useCommand<RecordRow>(`list-child:${schema.appId}:${schema.id}:${parent.id}`)
  const handled = useRef('')
  const busy = !['idle', 'failed', 'cancelled'].includes(command.result.state)
  useEffect(() => {
    if (command.result.state === 'committed' && command.result.commandId !== handled.current) {
      handled.current = command.result.commandId
      window.dispatchEvent(new Event('records-changed')); onSaved()
    }
  }, [command.result])
  const issues = command.result.state === 'failed' ? command.result.error.detail.issues : undefined
  return <form className="cr-list-child-editor" onSubmit={event => {
    event.preventDefault()
    void command.submit('/api/v1/commands/record.create', { appId: schema.appId, entityId: schema.id, values: { ...values, [parentField.id]: parent.ref } }, [{ ref: { appId: schema.appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: schema.id }, version: schema.version }])
  }}><h3>New child in {schema.label}</h3><div className="cr-list-child-editor__fields">
    {schema.fields.filter(field => field.id !== parentField.id && field.type !== 'computed' && !field.readOnly).map(field => <FieldInput key={field.id} appId={schema.appId} entityId={schema.id} inputId={`list-child-${id}-${field.id}`} field={field} value={values[field.id] ?? null} onChange={value => setValues(current => ({ ...current, [field.id]: value }))} error={issues?.find(issue => issue.fieldId === field.id)?.message} />)}
  </div><CommandFeedback {...command} /><div className="cr-actions"><button type="submit" className="cr-button" disabled={busy}>Save child</button><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={onCancel}>Cancel</button></div></form>
}

export function listWritable(row: RecordRow, field: Field) {
  return !field.readOnly && field.type !== 'computed' && row.fields[field.id]?.state === 'value' && row.allowedActions.some(action => action.action === 'record.patch' && action.enabled)
}
