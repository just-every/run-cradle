import type { EntitySchema, Filter, RecordRow, View, ViewResult } from '../../domains/records/contracts'
import { readApi } from '../shared/api'
import { addDays } from './calendar-dates'

/** Fetch the complete intersecting period, retaining the query's revision-bound cursor. */
export async function calendarPeriod(schema: EntitySchema, view: View, first: string, last: string, signal: AbortSignal) {
  const start = view.layout.startFieldId!, end = view.layout.endFieldId
  const instant = schema.fields.find(field => field.id === start)?.type === 'instant'
  // UTC bounds are deliberately broad for instant fields; final civil-day placement uses the workspace zone.
  const low = instant ? addDays(first, -2) + 'T00:00:00.000Z' : addDays(first, -1)
  const high = instant ? addDays(last, 2) + 'T23:59:59.999Z' : addDays(last, 1)
  const after: Filter = { kind: 'condition', fieldId: start, op: 'after', value: low }
  const filter: Filter = { kind: 'all', conditions: [{ kind: 'condition', fieldId: start, op: 'before', value: high }, end ? { kind: 'any', conditions: [{ kind: 'condition', fieldId: end, op: 'after', value: low }, { kind: 'all', conditions: [{ kind: 'condition', fieldId: end, op: 'empty' }, after] }] } : after] }
  const rows: RecordRow[] = [], ids = new Set<string>()
  let cursor: string | undefined, version: number | undefined, total: number | undefined
  do {
    const { data } = await readApi<ViewResult>(`/api/v1/views/${view.id}/query`, { method: 'POST', body: JSON.stringify({ limit: 200, fields: [...new Set([...view.fields, start, ...(end ? [end] : [])])], filter, cursor }) }, signal)
    signal.throwIfAborted()
    if (data.schema.version !== schema.version || data.view.version !== view.version || version !== undefined && version !== data.view.version) throw Error('The calendar definition changed. Refresh the saved view.')
    version = data.view.version
    const page = data.records
    if (page.total.kind !== 'exact' || page.total.value > 10000) throw Error('More than 10,000 records intersect this period. Narrow the saved view filters or select a shorter period.')
    if (total !== undefined && total !== page.total.value) throw Error('Calendar records changed while loading. Refresh the period.')
    total = page.total.value
    for (const row of page.items) { if (ids.has(row.id)) throw Error('The calendar returned a repeated record. Refresh the period.'); ids.add(row.id); rows.push(row) }
    if (rows.length > total || rows.length > 10000) throw Error('Calendar pages are inconsistent. Refresh the period.')
    cursor = page.nextCursor ?? undefined
    if (cursor && (!page.items.length || rows.length >= total)) throw Error('The calendar could not complete its pages. Refresh the period.')
  } while (cursor)
  if (rows.length !== total) throw Error('The calendar ended before every record was read. Refresh the period.')
  return rows
}
