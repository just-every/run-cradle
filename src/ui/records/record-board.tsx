import { useId, useRef, useState } from 'react'
import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import { useBoardColumns, boardKey, boardField, type BoardColumn } from './board-columns'
import { useBoardOrder } from './board-order'
import { BoardCard } from './board-card'
import { CellDisplay } from './record-fields'
import { useGridHistory } from './grid-history'
import { primaryRecordField } from './record-label'
import './record-board.css'
import type { ViewMatch } from './find-in-view'

/** Both the table switcher and saved boards use the same policy-checked table history. */
export function RecordBoard({ schema, rows, visible, boardFieldId, titleFieldId, name, match, coverFieldId, coverFit }: { schema: EntitySchema; rows: RecordRow[]; visible: string[]; boardFieldId: string; titleFieldId?: string; name: string; match?: ViewMatch | null; coverFieldId?: string; coverFit?: 'cover' | 'contain' }) {
  const history = useGridHistory(), instructions = useId()
  const dragging = useRef<RecordRow | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const selectedField = schema.fields.find(field => field.id === boardFieldId)
  const candidates = useBoardColumns(schema, selectedField)
  const order = useBoardOrder(schema.appId,schema.id,boardFieldId)
  const title = titleFieldId ?? primaryRecordField(schema)?.id
  if (!selectedField || !boardField(selectedField)) return <p className="cr-notice" role="alert">Choose a single select, person or single linked-record field for this board.</p>
  const field = selectedField
  const columns: BoardColumn[] = [...candidates.columns]
  for (const record of rows) { const cell=record.fields[field.id]; if(cell?.state==='value' && !columns.some(column=>column.id===boardKey(cell.value))) columns.push({id:boardKey(cell.value),value:cell.value,label:'Current value outside available destinations',selectable:false}) }
  const writable = (record: RecordRow) => !field.readOnly && record.fields[field.id]?.state === 'value' && record.allowedActions.some(action => action.action === 'record.patch' && action.enabled)
  const columnFor = (record: RecordRow) => { const cell = record.fields[field.id]; return cell?.state === 'value' ? columns.find(column => column.id === boardKey(cell.value))?.id : undefined }
  const grouped = columns.map(column => ({ ...column, rows: order.sort(rows.filter(record => columnFor(record) === column.id)) }))
  const unavailable = rows.filter(record => !columnFor(record))
  async function move(record: RecordRow, column: BoardColumn) {
    const cell = record.fields[field.id]
    if (column.selectable === false || history.busy || !writable(record) || cell?.state !== 'value' || boardKey(cell.value) === column.id || column.value === null && field.required) return
    history.clearFeedback()
    await history.execute([{ recordId: record.id, changes: { [field.id]: column.value } }], [record])
  }
  return <div className="cr-board-workspace">
    <p id={instructions} className="cr-muted">Drag a card to another column, or choose its destination with Move to. Columns show records on this page. Card order is yours in this browser tab.</p>
    {field.type !== 'select' && <div className="cr-toolbar"><label className="cr-field">Search columns<input type="search" value={candidates.search} onChange={event=>candidates.setSearch(event.target.value)} /></label>{candidates.loading && <p role="status">Loading permitted columns…</p>}{candidates.error && <p role="alert">{candidates.error}<button type="button" className="cr-button" onClick={candidates.refresh}>Retry columns</button></p>}{candidates.next && <button type="button" className="cr-button cr-button--quiet" disabled={candidates.loading} onClick={candidates.more}>More columns</button>}</div>}
    {order.error && <p role="alert">{order.error}</p>}
    <div className="cr-board" role="region" tabIndex={0} aria-label={`${name} board; scroll for columns`} aria-describedby={instructions}>
      {[...grouped, ...(unavailable.length ? [{ id: '__unavailable', label: 'Unavailable', value: null, rows: unavailable }] : [])].map(column => <section key={column.id} className={over === column.id ? 'cr-board-column--over' : undefined} data-board-column={column.id}
        onDragOver={event => { const record = dragging.current; if (column.id !== '__unavailable' && column.selectable !== false && record && writable(record) && !history.busy && (column.value !== null || !field.required)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(column.id) } }}
        onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOver(null) }}
        onDrop={event => {
          event.preventDefault(); setOver(null)
          const record = dragging.current; dragging.current = null
          if (record && event.dataTransfer.getData('application/x-cradle-board-record') === record.id && column.id !== '__unavailable') void move(record, column)
        }}>
        <h3>{column.label === 'Current value outside available destinations' ? <CellDisplay appId={schema.appId} field={field} cell={{state:'value',value:column.value}} /> : column.label} <span className="cr-muted" aria-hidden="true">{column.rows.length}</span></h3>
        {!column.rows.length && <p className="cr-muted cr-board-empty">No records on this page</p>}
        {column.rows.map((record,index) => <BoardCard key={`${field.id}:${record.id}:${record.version}`} schema={schema} record={record} field={field} titleFieldId={title} visible={visible} columns={columns} busy={history.busy} writable={writable(record)} match={match} coverFieldId={coverFieldId} coverFit={coverFit}
          onEarlier={index>0?()=>order.before(column.rows,record.id,column.rows[index-1]!.id):undefined}
          onLater={index<column.rows.length-1?()=>order.before(column.rows,column.rows[index+1]!.id,record.id):undefined}
          onDropBefore={event=>{const source=dragging.current;if(!source||source.id===record.id||!writable(source)||columnFor(source)!==column.id)return;event.preventDefault();event.stopPropagation();order.before(column.rows,source.id,record.id);dragging.current=null;setOver(null)}} onMove={column => void move(record, column)}
          onDragStart={event => {
            if (!writable(record) || history.busy || event.target instanceof HTMLElement && event.target.closest('a,button,input,textarea,select')) { event.preventDefault(); return }
            dragging.current = record; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-cradle-board-record', record.id)
          }}
          onDragEnd={() => { dragging.current = null; setOver(null) }} />)}
      </section>)}
    </div>
  </div>
}
