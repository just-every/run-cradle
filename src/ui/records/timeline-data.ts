import { timelineLimits } from '../../domains/records/timeline-limits'
import type { EntitySchema, RecordRow, TimelineBaseline, View, ViewResult } from '../../domains/records/contracts'
import { readApi } from '../shared/api'

/** Read the entire revision-bound view: a page alone cannot yield a critical path. */
export async function timelineData(schema: EntitySchema, view: View, signal: AbortSignal) {
  const rows: RecordRow[] = [], ids = new Set<string>(), baselineRecords: TimelineBaseline['records'] = []
  let cursor: string | undefined, total: number | undefined, baseline: TimelineBaseline | undefined, dependenciesComplete = true
  do {
    const { data } = await readApi<ViewResult>(`/api/v1/views/${view.id}/query`, { method: 'POST', body: JSON.stringify({ limit: 200, cursor }) }, signal)
    signal.throwIfAborted()
    if (data.schema.version !== schema.version || data.view.version !== view.version) throw Error('The timeline definition changed. Refresh the saved view.')
    const page = data.records
    if (page.total.kind !== 'exact' || page.total.value > timelineLimits.records) throw Error(`A timeline supports at most ${timelineLimits.records.toLocaleString('en-US')} records. Narrow the saved view filters.`)
    if (total !== undefined && total !== page.total.value) throw Error('Timeline records changed while loading. Refresh the timeline.')
    if (baseline && baseline.capturedAt !== data.view.timelineBaseline?.capturedAt) throw Error('The baseline changed while loading. Refresh the timeline.')
    total = page.total.value; baseline = data.view.timelineBaseline
    dependenciesComplete = dependenciesComplete && data.timelineDependenciesComplete === true
    baselineRecords.push(...(baseline?.records ?? []))
    for (const row of page.items) { if (ids.has(row.id)) throw Error('The timeline returned a repeated record. Refresh the timeline.'); ids.add(row.id); rows.push(row) }
    cursor = page.nextCursor ?? undefined
    if (cursor && (!page.items.length || rows.length >= total)) throw Error('Timeline pages are inconsistent. Refresh the timeline.')
  } while (cursor)
  if (rows.length !== total) throw Error('The timeline ended before every record was read. Refresh the timeline.')
  return { rows, dependenciesComplete, baseline: baseline ? { ...baseline, records: baselineRecords } : undefined }
}
