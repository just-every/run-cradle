import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import type { CellValue } from '../../contracts/primitives'
import type { EntitySchema, Field, RecordRow } from '../../domains/records/contracts'
import { gridClipboard, gridText, gridValue, parseGridText } from './grid-values'
import { useGridHistory } from './grid-history'

type Point = { row: number; column: number }
type Editing = Point & { record: RecordRow; field: Field }
export function useGridInteraction(schema: EntitySchema, rows: RecordRow[], fields: Field[]) {
  const history = useGridHistory()
  const [anchor, setAnchor] = useState<Point>({ row: 0, column: 0 }), [end, setEnd] = useState<Point>({ row: 0, column: 0 })
  const [editing, setEditing] = useState<Editing | null>(null), [draft, setDraft] = useState(''), [errors, setErrors] = useState<string[]>([])
  const region = useRef<HTMLDivElement>(null)
  const active = useRef<Point>({ row: 0, column: 0 })
  const writable = (row: RecordRow, field: Field) => !field.readOnly && field.type !== 'computed' && row.fields[field.id]?.state === 'value' && row.allowedActions.some(action => action.action === 'record.patch' && action.enabled)
  const bounds = { top: Math.min(anchor.row, end.row), bottom: Math.max(anchor.row, end.row), left: Math.min(anchor.column, end.column), right: Math.max(anchor.column, end.column) }
  function focus(point: Point, extend = false) {
    const next = { row: Math.max(0, Math.min(rows.length - 1, point.row)), column: Math.max(0, Math.min(fields.length - 1, point.column)) }
    active.current = next; setEnd(next); if (!extend) setAnchor(next)
    region.current?.querySelector<HTMLElement>(`[data-grid-row="${next.row}"][data-grid-column="${next.column}"]`)?.focus()
  }
  function edit(point: Point) {
    const row = rows[point.row], field = fields[point.column]
    if (!row || !field || !writable(row, field) || history.busy) return
    setEditing({ ...point, record: row, field }); const cell = row.fields[field.id]; setDraft(gridText(field, cell?.state === 'value' ? cell.value : null)); setErrors([])
  }
  async function apply(matrix: string[][], start: Point) {
    history.clearFeedback()
    // A background read must never advance an open draft's identity or expected version.
    if (editing && (matrix.length !== 1 || matrix[0]?.length !== 1)) return false
    const sourceRows = editing ? [editing.record] : rows
    const failures: string[] = [], changes: { recordId: string; changes: Record<string, CellValue> }[] = []
    for (let r = 0; r < matrix.length; r++) {
      const row = editing ? editing.record : rows[start.row + r], values: Record<string, CellValue> = {}
      if (!row) { failures.push(`Row ${start.row + r + 1}: paste exceeds the loaded records. Add records or load the next page first.`); continue }
      for (let c = 0; c < matrix[r]!.length; c++) {
        const field = editing ? editing.field : fields[start.column + c]
        if (!field) { failures.push(`Row ${start.row + r + 1}, column ${start.column + c + 1}: paste exceeds the visible columns.`); continue }
        if (!writable(row, field)) { failures.push(`Row ${start.row + r + 1}, ${field.label}: this cell is read-only.`); continue }
        try { values[field.id] = gridValue(field, matrix[r]![c]!) } catch (error) { failures.push(`Row ${start.row + r + 1}, ${field.label}: ${error instanceof Error ? error.message : 'Invalid value'}`) }
      }
      changes.push({ recordId: row.id, changes: values })
    }
    setErrors(failures)
    if (failures.length) return false
    const committed = await history.execute(changes, sourceRows)
    if (committed) { setEditing(null); setErrors([]) }
    return committed
  }
  function cancel() { if (history.busy) return; history.clearFeedback(); setEditing(null); setDraft(''); setErrors([]) }
  function paste(event: ClipboardEvent) {
    if (editing) return
    event.preventDefault()
    try { void apply(parseGridText(event.clipboardData.getData('text/plain')), { row: bounds.top, column: bounds.left }) } catch (error) { setErrors([error instanceof Error ? error.message : 'Invalid paste']) }
  }
  function copy(event: ClipboardEvent) {
    if (editing) return
    const text = gridClipboard(rows.slice(bounds.top, bounds.bottom + 1).map(row => fields.slice(bounds.left, bounds.right + 1).map(field => { const cell = row.fields[field.id]; return cell?.state === 'value' ? gridText(field, cell.value) : '' })))
    event.preventDefault(); event.clipboardData.setData('text/plain', text)
  }
  function key(event: KeyboardEvent) {
    if (editing || (event.target as HTMLElement).closest('a,button,input,textarea,select')) return
    const modifier = event.metaKey || event.ctrlKey
    if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? history.redo() : history.undo(); return }
    if (modifier && event.key.toLowerCase() === 'd') { event.preventDefault(); fill(); return }
    const moves: Record<string, Point> = { ArrowDown: { row: end.row + 1, column: end.column }, ArrowUp: { row: end.row - 1, column: end.column }, ArrowLeft: { row: end.row, column: end.column - 1 }, ArrowRight: { row: end.row, column: end.column + 1 }, Tab: { row: end.column === (event.shiftKey ? 0 : fields.length - 1) ? end.row + (event.shiftKey ? -1 : 1) : end.row, column: (end.column + (event.shiftKey ? fields.length - 1 : 1)) % fields.length } }
    if (moves[event.key]) { event.preventDefault(); focus(moves[event.key]!, event.shiftKey && event.key !== 'Tab') }
    else if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); edit(end) }
    else if (event.key === 'Escape') { setErrors([]); focus(anchor) }
  }
  function fill() {
    const first = rows[bounds.top]
    if (!first || bounds.bottom === bounds.top) return
    const values = fields.slice(bounds.left, bounds.right + 1).map(field => { const cell = first.fields[field.id]; return cell?.state === 'value' ? gridText(field, cell.value) : '' })
    void apply(Array.from({ length: bounds.bottom - bounds.top }, () => values), { row: bounds.top + 1, column: bounds.left })
  }
  useEffect(() => {
    if (!editing) return
    const rowIndex = rows.findIndex(row => row.id === editing.record.id), column = fields.findIndex(field => field.id === editing.field.id)
    if (rowIndex < 0 || column < 0 || !writable(rows[rowIndex]!, fields[column]!)) {
      setEditing(null); setDraft(''); setErrors(['The edited cell is no longer available in this view. Nothing was saved.'])
    } else { const point = { row: rowIndex, column }; setAnchor(point); setEnd(point); active.current = point }
  }, [rows, editing?.record.id, editing?.field.id, fields.map(field => `${field.id}:${field.readOnly}`).join(',')])
  return { history, region, anchor, end, editing, draft, setDraft, cancel, errors, bounds, focus, edit, apply, paste, copy, key, fill, writable,
    activate: (point: Point) => { if (point.row !== active.current.row || point.column !== active.current.column) { active.current = point; setAnchor(point); setEnd(point) } },
    selected: (row: number, column: number) => row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right }
}
