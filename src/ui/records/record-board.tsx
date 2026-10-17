import { useId, useRef, useState } from 'react'
import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import { BoardCard, type BoardColumn } from './board-card'
import { useGridHistory } from './grid-history'
import { primaryRecordField } from './record-label'
import './record-board.css'

/** Both the table switcher and saved boards use the same policy-checked table history. */
export function RecordBoard({ schema, rows, visible, boardFieldId, titleFieldId, name }: { schema: EntitySchema; rows: RecordRow[]; visible: string[]; boardFieldId: string; titleFieldId?: string; name: string }) {
  const history = useGridHistory(), instructions = useId()
  const dragging = useRef<RecordRow | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const selectedField = schema.fields.find(field => field.id === boardFieldId)
  const title = titleFieldId ?? primaryRecordField(schema)?.id
  if (!selectedField || selectedField.type !== 'select') return <p className="cr-notice" role="alert">Choose a single select field for this board.</p>
  const field = selectedField
  const columns: BoardColumn[] = [...(field.options ?? []).map(option => ({ ...option, value: option.id })), { id: '__unset', label: 'Unassigned', value: null }]
  const writable = (record: RecordRow) => !field.readOnly && record.fields[field.id]?.state === 'value' && record.allowedActions.some(action => action.action === 'record.patch' && action.enabled)
  const columnFor = (record: RecordRow) => { const cell = record.fields[field.id]; return cell?.state === 'value' ? columns.find(column => column.value === cell.value)?.id : undefined }
  const grouped = columns.map(column => ({ ...column, rows: rows.filter(record => columnFor(record) === column.id) }))
  const unavailable = rows.filter(record => !columnFor(record))
  async function move(record: RecordRow, column: BoardColumn) {
    const cell = record.fields[field.id]
    if (history.busy || !writable(record) || cell?.state !== 'value' || cell.value === column.value || column.value === null && field.required) return
    history.clearFeedback()
    await history.execute([{ recordId: record.id, changes: { [field.id]: column.value } }], [record])
  }
  return <div className="cr-board-workspace">
    <p id={instructions} className="cr-muted">Drag a card to another column, or choose its destination with Move to. Columns show records on this page.</p>
    <div className="cr-board" role="region" tabIndex={0} aria-label={`${name} board; scroll for columns`} aria-describedby={instructions}>
      {[...grouped, ...(unavailable.length ? [{ id: '__unavailable', label: 'Unavailable', value: null, rows: unavailable }] : [])].map(column => <section key={column.id} className={over === column.id ? 'cr-board-column--over' : undefined} data-board-column={column.id}
        onDragOver={event => { const record = dragging.current; if (column.id !== '__unavailable' && record && writable(record) && !history.busy && (column.value !== null || !field.required)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(column.id) } }}
        onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOver(null) }}
        onDrop={event => {
          event.preventDefault(); setOver(null)
          const record = dragging.current; dragging.current = null
          if (record && event.dataTransfer.getData('application/x-cradle-board-record') === record.id && column.id !== '__unavailable') void move(record, column)
        }}>
        <h3>{column.label} <span className="cr-muted" aria-hidden="true">{column.rows.length}</span></h3>
        {!column.rows.length && <p className="cr-muted cr-board-empty">No records on this page</p>}
        {column.rows.map(record => <BoardCard key={`${field.id}:${record.id}:${record.version}`} schema={schema} record={record} field={field} titleFieldId={title} visible={visible} columns={columns} busy={history.busy} writable={writable(record)} onMove={column => void move(record, column)}
          onDragStart={event => {
            if (!writable(record) || history.busy || event.target instanceof HTMLElement && event.target.closest('a,button,input,textarea,select')) { event.preventDefault(); return }
            dragging.current = record; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-cradle-board-record', record.id)
          }}
          onDragEnd={() => { dragging.current = null; setOver(null) }} />)}
      </section>)}
    </div>
  </div>
}
