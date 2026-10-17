import { useId, useState, type DragEvent } from 'react'
import type { EntitySchema, Field, RecordRow } from '../../domains/records/contracts'
import { CellDisplay } from './record-fields'
import { RecordCardFields } from './record-cards'
import { ViewMatchCell } from './view-match'
import type { ViewMatch } from './find-in-view'

export type BoardColumn = { id: string; label: string; value: string | null }

export function BoardCard({ schema, record, field, titleFieldId, visible, columns, busy, writable, onMove, onDragStart, onDragEnd, match }: {
  schema: EntitySchema; record: RecordRow; field: Field; titleFieldId?: string; visible: string[]; columns: BoardColumn[]
  match?: ViewMatch | null
  busy: boolean; writable: boolean; onMove(column: BoardColumn): void; onDragStart(event: DragEvent<HTMLElement>): void; onDragEnd(): void
}) {
  const titleId = useId(), selectId = useId(), moveLabelId = useId(), moveButtonId = useId()
  const cell = record.fields[field.id], current = cell?.state === 'value' ? cell.value : undefined
  const currentColumn = columns.find(column => column.value === current)
  const [destination, setDestination] = useState(currentColumn?.id ?? '')
  const selected = columns.find(column => column.id === destination)
  return <article className="cr-card cr-board-card" aria-labelledby={titleId} data-record-id={record.id} draggable={writable && !busy} onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <h3 id={titleId}>{titleFieldId && <ViewMatchCell recordId={record.id} fieldId={titleFieldId} match={match}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === titleFieldId)} cell={record.fields[titleFieldId]} /></ViewMatchCell>}</h3>
    <RecordCardFields schema={schema} record={record} visible={visible} titleFieldId={titleFieldId} match={match} />
    <a className="cr-link" href={`/app/records/${record.ref.appId}/${record.ref.entityId}/${record.id}`}>Open record</a>
    {writable ? <form className="cr-board-move" onSubmit={event => { event.preventDefault(); if (selected && selected.value !== current && !busy) onMove(selected) }}>
      <div className="cr-field"><label id={moveLabelId} htmlFor={selectId}>Move to</label><select id={selectId} aria-labelledby={`${moveLabelId} ${titleId}`} value={destination} disabled={busy} onChange={event => setDestination(event.target.value)}>
        {!currentColumn && <option value="" disabled>Current column unavailable</option>}
        {columns.map(column => <option key={column.id} value={column.id} disabled={column.value === null && field.required}>{column.label}</option>)}
      </select></div>
      <button type="submit" className="cr-button cr-button--quiet" aria-labelledby={`${moveButtonId} ${titleId}`} disabled={busy || !selected || selected.value === current}><span id={moveButtonId}>Move</span></button>
    </form> : <p className="cr-muted cr-board-readonly">{record.allowedActions.find(action => action.action === 'record.patch' && !action.enabled)?.reason ?? `${field.label} is read-only for this record.`}</p>}
  </article>
}
