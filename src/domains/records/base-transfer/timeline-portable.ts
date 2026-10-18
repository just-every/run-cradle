import type { PortableBase, PortableView } from './json-format'
import { ImportInputError } from './input-error'
import { dateSchema, instantSchema } from '../validators'
import type { View } from '../contracts'

export function validatePortableTimeline(view: PortableView, table: PortableBase['base']['tables'][number]) {
  if ((view.timelineZoom || view.timelineBaseline || view.layout.dependencyFieldId) && view.display !== 'timeline') throw new ImportInputError(`${view.name}: timeline settings require a timeline`)
  if (view.layout.dependencyFieldId) {
    const field = table.fields.find(field => field.id === view.layout.dependencyFieldId)
    if (field?.type !== 'relation' || field.relation?.tableId !== table.id) throw new ImportInputError(`${view.name}: dependencies must link to the same table`)
  }
  const baseline = view.timelineBaseline
  if (!baseline) return
  if (baseline.startFieldId !== view.layout.startFieldId || baseline.endFieldId !== view.layout.endFieldId) throw new ImportInputError(`${view.name}: baseline dates do not match the timeline layout`)
  const ids = new Set(table.records.map(record => record.id)), seen = new Set<string>()
  const start = table.fields.find(field => field.id === baseline.startFieldId), end = table.fields.find(field => field.id === baseline.endFieldId)
  if (!start || !['date', 'instant'].includes(start.type) || baseline.endFieldId && (!end || start.type !== end.type)) throw new ImportInputError(`${view.name}: baseline needs compatible date fields`)
  for (const row of baseline.records) {
    if (!ids.has(row.recordId) || seen.has(row.recordId)) throw new ImportInputError(`${view.name}: baseline contains a missing or repeated record`)
    if (!end && row.end !== undefined || end && row.end === undefined) throw new ImportInputError(`${view.name}: baseline end date does not match its layout`)
    seen.add(row.recordId)
    try {
      const date = start.type === 'date' ? dateSchema : instantSchema
      date.nullable().parse(row.start)
      if (end) date.nullable().parse(row.end)
    } catch (error) { throw new ImportInputError(`${view.name}: ${(error as Error).message}`) }
  }
}

export function remapTimelineBaseline(baseline: NonNullable<PortableView['timelineBaseline']>, map: Map<string, string>) {
  return { ...baseline, startFieldId: map.get(baseline.startFieldId)!, ...(baseline.endFieldId ? { endFieldId: map.get(baseline.endFieldId)! } : {}), records: baseline.records.map(row => ({ ...row, recordId: map.get(row.recordId)! })) }
}

/** The complete export already proved every source row and field readable. */
export function exportTimelineSettings(view: View, stored: View, records: readonly { id: string }[]) {
  if (view.display !== 'timeline') return {}
  const ids = new Set(records.map(record => record.id)), baseline = stored.timelineBaseline
  return {
    ...(view.timelineZoom ? { timelineZoom: view.timelineZoom } : {}),
    ...(baseline && baseline.startFieldId === view.layout.startFieldId && baseline.endFieldId === view.layout.endFieldId ? { timelineBaseline: { ...baseline, records: baseline.records.filter(record => ids.has(record.recordId)) } } : {}),
  }
}
