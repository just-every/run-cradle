import type { Page } from '../../contracts/primitives'
import type { EntitySchema, Query, RecordRow, ViewResult } from '../../domains/records/contracts'
import { readApi } from '../shared/api'

export type ViewSummaryInput = { schema: EntitySchema; query: Query; fields: string[]; viewId?: string }
export type ViewSummarySnapshot = { rows: RecordRow[]; total: number; groupBy: string[]; evaluatedAt: string }
export const VIEW_SUMMARY_LIMIT = 10000

/** An explicit user action calls this; cursor revision fences forbid combining pages across commits. */
export async function readViewSummary({ schema, query, fields, viewId }: ViewSummaryInput, signal: AbortSignal): Promise<ViewSummarySnapshot> {
  const visible = [...new Set(fields)].filter(id => schema.fields.some(field => field.id === id))
  if (!visible.length) throw Error('Choose at least one visible, readable field before calculating a summary.')
  const url = viewId ? `/api/v1/views/${encodeURIComponent(viewId)}/query` : `/api/v1/apps/${encodeURIComponent(schema.appId)}/entities/${encodeURIComponent(schema.id)}/query`
  const rows: RecordRow[] = [], ids = new Set<string>(), cursors = new Set<string>()
  let cursor: string | undefined, total: number | undefined, evaluatedAt = '', groupBy = query.groupBy ?? [], viewVersion: number | undefined
  do {
    signal.throwIfAborted()
    // Keep limit unchanged for every request: it participates in the server's cursor binding.
    const body = { ...query, fields: visible, cursor }
    const { data } = await readApi<Page<RecordRow> | ViewResult>(url, { method: 'POST', body: JSON.stringify(body) }, signal)
    signal.throwIfAborted()
    const page = 'records' in data ? data.records : data
    if ('records' in data) {
      if (data.schema.id !== schema.id || data.schema.appId !== schema.appId || data.schema.version !== schema.version || data.schema.physicalRevision !== schema.physicalRevision) throw Error('The table schema changed. Refresh the view before calculating its summary.')
      if (visible.some(id => !data.view.fields.includes(id) || !data.schema.fields.some(field => field.id === id))) throw Error('The saved view fields or access changed. Refresh the view before calculating its summary.')
      if (viewVersion !== undefined && viewVersion !== data.view.version) throw Error('The saved view changed during the summary. Refresh and calculate again.')
      viewVersion = data.view.version
      groupBy = query.groupBy ?? data.view.groupBy
    }
    if (page.total.kind !== 'exact' || page.total.value > VIEW_SUMMARY_LIMIT) throw Error('Summary unavailable: more than 10,000 records match. Narrow the filters and calculate again. No partial totals are shown.')
    if (!Number.isInteger(page.total.value) || page.total.value < 0) throw Error('The query returned an invalid matching count. Refresh and calculate again.')
    if (total !== undefined && total !== page.total.value) throw Error('The matching records changed during the summary. Refresh and calculate again.')
    total = page.total.value
    if (rows.length + page.items.length > VIEW_SUMMARY_LIMIT || rows.length + page.items.length > total) throw Error('The query returned inconsistent pages. Refresh and calculate again. No partial totals are shown.')
    for (const row of page.items) {
      if (ids.has(row.id)) throw Error('The query repeated a record during the summary. Refresh and calculate again.')
      ids.add(row.id); rows.push(row)
    }
    evaluatedAt = page.evaluatedAt
    cursor = page.nextCursor ?? undefined
    if (cursor) {
      if (!page.items.length || cursors.has(cursor) || rows.length >= VIEW_SUMMARY_LIMIT) throw Error('The query could not finish within 10,000 records. Refresh or narrow the filters. No partial totals are shown.')
      cursors.add(cursor)
    }
  } while (cursor)
  if (rows.length !== total) throw Error('The query ended before every matching record was read. Refresh and calculate again. No partial totals are shown.')
  return { rows, total, groupBy, evaluatedAt }
}
