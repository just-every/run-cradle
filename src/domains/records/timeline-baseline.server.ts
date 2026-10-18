import { timelineLimits } from './timeline-limits'
import type { RequestContext, PolicyPort } from '../authority/ports'
import type { RecordRow, TimelineBaseline, View } from './contracts'
import type { createRecordReader } from './query.server'
import { AdmissionError } from '../admission/errors'
import { trustedPredicate } from '../admission/sql.server'

/** A snapshot is a server read, never dates supplied by the browser. */
export async function captureTimelineBaseline(ctx: RequestContext, view: View, reader: ReturnType<typeof createRecordReader>, policy: PolicyPort) {
  const scope = await policy.scope(ctx, { appId: view.appId, entityId: view.entityId, purpose: 'read' })
  const start = view.layout.startFieldId!, end = view.layout.endFieldId
  const revision = await reader.revision(), records: TimelineBaseline['records'] = []
  let cursor: string | undefined, total: number | undefined
  const planned = (row: RecordRow, field: string): string | null => {
    const cell = row.fields[field]
    if (cell?.state !== 'value' || cell.value !== null && (typeof cell.value !== 'string' || !Number.isFinite(Date.parse(cell.value)))) throw new AdmissionError('forbidden', 'A planned date is unavailable. Refresh the timeline before capturing a baseline.')
    return cell.value as string | null
  }
  do {
    const page = await reader.query(ctx, scope, { fields: [start, ...(end ? [end] : [])], filter: view.filter, sort: view.sort, limit: 200, cursor })
    if (page.total.kind !== 'exact' || page.total.value > timelineLimits.records) throw new AdmissionError('validation', `A baseline supports at most ${timelineLimits.records.toLocaleString('en-US')} records. Narrow the saved view filters.`)
    if (total !== undefined && total !== page.total.value) throw new AdmissionError('version_conflict', 'The timeline changed during capture. Capture again.')
    total = page.total.value
    for (const row of page.items) records.push({ recordId: row.id, start: planned(row, start), ...(end ? { end: planned(row, end) } : {}) })
    cursor = page.nextCursor ?? undefined
    if (cursor && (!page.items.length || records.length >= total)) throw new AdmissionError('version_conflict', 'The timeline pages changed during capture.')
  } while (cursor)
  if (records.length !== total || new Set(records.map(row => row.recordId)).size !== records.length || await reader.revision() !== revision) throw new AdmissionError('version_conflict', 'The timeline changed during capture. Capture again.')
  return {
    baseline: { capturedAt: ctx.now, startFieldId: start, ...(end ? { endFieldId: end } : {}), records } satisfies TimelineBaseline,
    guards: [...scope.currentAuthorityGuards, trustedPredicate("(SELECT COALESCE(MAX(rowid),0) FROM command_admissions WHERE state='committed')=?", [revision])],
  }
}

/** Every read projects the historical dates through today's row and field visibility. */
export function projectTimelineBaseline(baseline: TimelineBaseline, view: View, rows: RecordRow[]): TimelineBaseline | undefined {
  if (view.display !== 'timeline' || baseline.startFieldId !== view.layout.startFieldId || baseline.endFieldId !== view.layout.endFieldId) return undefined
  const permitted = new Set(rows.filter(row => [baseline.startFieldId, ...(baseline.endFieldId ? [baseline.endFieldId] : [])].every(id => row.fields[id]?.state === 'value')).map(row => row.id))
  return { ...baseline, records: baseline.records.filter(row => permitted.has(row.recordId)) }
}

export function baselineMetadata<T extends { timelineBaseline?: TimelineBaseline }>(view: T): T {
  return view.timelineBaseline ? { ...view, timelineBaseline: { ...view.timelineBaseline, records: [] } } : view
}
