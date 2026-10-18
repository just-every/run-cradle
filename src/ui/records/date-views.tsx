import { RecordTimeline } from './record-timeline'
import { RecordCalendar } from './record-calendar'
import type { RecordRow, View, EntitySchema } from '../../domains/records/contracts'
import { CellDisplay } from './record-fields'
import { RecordCardFields } from './record-cards'
import { ViewMatchCell } from './view-match'
import type { ViewMatch } from './find-in-view'
const dateValue = (row: RecordRow, field?: string) => { const cell = field ? row.fields[field] : null; return cell?.state === 'value' && typeof cell.value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cell.value) ? cell.value.slice(0, 10) : null }
export function DateViews({ records, view, schema, match, timezone = 'UTC', revision }: { records: RecordRow[]; view: View; schema: EntitySchema; match?: ViewMatch | null; timezone?: string; revision?: string }) {
  const sorted = [...records].sort((a, b) => (dateValue(a, view.layout.startFieldId) ?? '9999').localeCompare(dateValue(b, view.layout.startFieldId) ?? '9999'))
  const link = (record: RecordRow) => <div key={record.id}><a className="cr-calendar-record" href={`/app/records/${record.ref.appId}/${record.ref.entityId}/${record.id}`}><ViewMatchCell recordId={record.id} fieldId={view.layout.titleFieldId} match={match}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === view.layout.titleFieldId)} cell={record.fields[view.layout.titleFieldId]} /></ViewMatchCell></a><RecordCardFields schema={schema} record={record} visible={view.fields} titleFieldId={view.layout.titleFieldId} match={match} /></div>
  if (view.display === 'timeline') return <RecordTimeline records={records} view={view} schema={schema} timezone={timezone} match={match} revision={revision} />
  if (view.display === 'agenda') return <ol className={`cr-date-list cr-date-list--${view.display}`}>{sorted.map(row => <li key={row.id}><div className="cr-date-axis"><time dateTime={dateValue(row, view.layout.startFieldId) ?? undefined}>{dateValue(row, view.layout.startFieldId) ?? 'Unscheduled'}</time>{dateValue(row, view.layout.endFieldId) && <span> → {dateValue(row, view.layout.endFieldId)}</span>}</div>{link(row)}</li>)}</ol>
  return <RecordCalendar records={records} view={view} schema={schema} match={match} timezone={timezone} />
}
