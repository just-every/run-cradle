import { useEffect, useId, useState } from 'react'
import type { EntitySchema, Field, RecordRow } from '../../domains/records/contracts'
import { CellDisplay } from './record-fields'
import { primaryRecordField, recordLabel } from './record-label'
import { fieldTypeLabel } from './schema/field-type-label'
import { useGridInteraction } from './grid-interaction'
import type { ViewMatch } from './find-in-view'

export function RecordsGrid({ schema, rows, visible, groupBy, selection, onSelection, match, onCreate }: { schema: EntitySchema; rows: RecordRow[]; visible: string[]; groupBy?: string | string[]; selection: RecordRow[]; onSelection(rows: RecordRow[]): void; match?: ViewMatch | null; onCreate?: () => void }) {
  const tableId = useId(), fields = visible.flatMap(id => schema.fields.find(field => field.id === id) ?? [])
  const groupIds = typeof groupBy === 'string' ? [groupBy] : groupBy ?? []
  const groupLabel = (row: RecordRow) => groupIds.map(id => <span key={id}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === id)} cell={row.fields[id]} /> </span>)
  const primary = primaryRecordField(schema), primaryVisible = !!primary && visible.includes(primary.id)
  const grid = useGridInteraction(schema, rows, fields)
  const [widths, setWidths] = useState<Record<string, number>>({}), [frozen, setFrozen] = useState(false)
  const groups = new Map<string, RecordRow[]>()
  for (const row of rows) { const key = groupBy ? JSON.stringify(groupIds.map(id => row.fields[id])) : ''; groups.set(key, [...(groups.get(key) ?? []), row]) }
  useEffect(() => {
    if (!match) return
    grid.region.current?.querySelector<HTMLElement>(`[data-record-id="${match.recordId}"][data-field-id="${match.fieldId}"]`)?.scrollIntoView({ block: 'center', inline: 'center' })
  }, [match, rows])
  const style = (field: Field, column: number) => ({ width: widths[field.id] ?? 180, minWidth: widths[field.id] ?? 180, ...(frozen && column === 0 ? { position: 'sticky' as const, left: 48, zIndex: 1, background: 'var(--cr-surface, #fff)' } : {}) })
  return <div className="cr-grid-workspace">
    <div className="cr-actions cr-grid-actions"><button className="cr-button cr-button--quiet" type="button" disabled={!grid.history.canUndo} onClick={grid.history.undo}>Undo</button><button className="cr-button cr-button--quiet" type="button" disabled={!grid.history.canRedo} onClick={grid.history.redo}>Redo</button><button className="cr-button cr-button--quiet" type="button" disabled={grid.bounds.top === grid.bounds.bottom || grid.history.busy} onClick={grid.fill}>Fill down</button><button className="cr-button cr-button--quiet" type="button" aria-pressed={frozen} onClick={() => setFrozen(value => !value)}>Freeze first column</button><span className="cr-muted">Enter to edit · Shift + arrows to select · Copy, paste or fill a range</span></div>
    {grid.errors.length > 0 && <div className="cr-notice" role="alert"><p>Nothing was changed. Fix these cells and paste again.</p><ul>{grid.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}{grid.history.feedback}
    <div ref={grid.region} className="cr-table-wrap cr-editable-grid" tabIndex={0} role="region" aria-label={`${schema.label} table; scroll for more columns`} onKeyDown={grid.key} onPaste={grid.paste} onCopy={grid.copy}>
      <table className="cr-table cr-records-table"><thead><tr><th id={`${tableId}-select`} scope="col" className="cr-col-select"><span className="cr-sr-only">Select</span></th>{groupBy && <th id={`${tableId}-group`} scope="col">Group</th>}{fields.map((field, column) => <th key={field.id} id={`${tableId}-${field.id}`} scope="col" aria-label={field.label} style={style(field, column)}>{field.label}<span className="cr-th-type" aria-hidden="true">{fieldTypeLabel(field)}</span><input className="cr-column-width" type="range" min="100" max="480" aria-label={`Width of ${field.label}`} value={widths[field.id] ?? 180} onChange={event => setWidths(current => ({ ...current, [field.id]: Number(event.target.value) }))} /></th>)}{!primaryVisible && <th id={`${tableId}-record`} scope="col">Record</th>}<th id={`${tableId}-state`} scope="col" className="cr-col-state">State</th></tr></thead>
      {[...groups].map(([key, records], groupIndex) => <tbody key={key}>{groupBy && <tr><th id={`${tableId}-rowgroup-${groupIndex}`} scope="rowgroup" className="cr-record-group" colSpan={fields.length + 2 + (primaryVisible ? 0 : 1) + (groupBy ? 1 : 0)}>{groupLabel(records[0]!)} · {records.length} on this page</th></tr>}{records.map(row => {
        const rowIndex = rows.indexOf(row)
        return <tr key={row.id}><td className="cr-col-select" headers={`${tableId}-select${groupBy ? ` ${tableId}-rowgroup-${groupIndex}` : ''}`}><label className="cr-selection"><input type="checkbox" aria-label={`Select ${recordLabel(row, schema)}`} checked={selection.some(item => item.id === row.id)} onChange={event => onSelection(event.target.checked ? [...selection, row] : selection.filter(item => item.id !== row.id))} /></label></td>{groupBy && <td headers={`${tableId}-group ${tableId}-rowgroup-${groupIndex}`}>{groupLabel(row)}</td>}{fields.map((field, column) => {
          const point = { row: rowIndex, column }, editing = grid.editing?.row === rowIndex && grid.editing.column === column
          const found = match?.recordId === row.id && match.fieldId === field.id
          return <td key={field.id} data-grid-row={rowIndex} data-grid-column={column} data-record-id={row.id} data-field-id={field.id} data-label={field.label} headers={`${tableId}-${field.id}${groupBy ? ` ${tableId}-rowgroup-${groupIndex}` : ''}`} style={style(field, column)} tabIndex={grid.end.row === rowIndex && grid.end.column === column ? 0 : -1} aria-label={`${recordLabel(row, schema)}, ${field.label}${grid.writable(row, field) ? ', editable' : ', read-only'}`} className={[field.id === primary?.id ? 'cr-col-primary' : '', grid.selected(rowIndex, column) ? 'cr-grid-selected' : '', found ? 'cr-grid-match' : ''].join(' ')} onFocus={event => { if (event.target === event.currentTarget) grid.activate(point) }} onMouseDown={event => { if (!(event.target as HTMLElement).closest('a,button,input,textarea,select')) event.preventDefault() }} onClick={event => { if (!editing) grid.focus(point, event.shiftKey) }} onDoubleClick={() => grid.edit(point)}>
            {editing ? <form className="cr-cell-editor" onSubmit={event => { event.preventDefault(); void grid.apply([[grid.draft]], point) }}><input autoFocus aria-label={`Edit ${field.label}`} value={grid.draft} onChange={event => grid.setDraft(event.target.value)} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { grid.setEditing(null); grid.focus(point) } }} /><div className="cr-actions"><button type="submit" disabled={grid.history.busy}>Save cell</button><button type="button" onClick={() => grid.setEditing(null)}>Cancel</button></div></form> : field.id === primary?.id ? <a href={`/app/records/${schema.appId}/${schema.id}/${row.id}`} onClick={event => event.stopPropagation()}>{recordLabel(row, schema)}</a> : <CellDisplay appId={schema.appId} field={field} cell={row.fields[field.id]} />}
          </td>
        })}{!primaryVisible && <td headers={`${tableId}-record${groupBy ? ` ${tableId}-rowgroup-${groupIndex}` : ''}`}><a href={`/app/records/${schema.appId}/${schema.id}/${row.id}`}>Open record</a></td>}<td className="cr-col-state" headers={`${tableId}-state${groupBy ? ` ${tableId}-rowgroup-${groupIndex}` : ''}`}>{row.lifecycle.charAt(0).toUpperCase() + row.lifecycle.slice(1).replaceAll("_", " ")}</td></tr>
      })}</tbody>)}{onCreate && <tfoot><tr><td colSpan={fields.length + 2 + (primaryVisible ? 0 : 1) + (groupBy ? 1 : 0)}><button type="button" className="cr-button cr-button--quiet" onClick={onCreate}>+ Add record</button></td></tr></tfoot>}</table>
    </div>
  </div>
}
