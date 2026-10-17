import type { RecordRow, View, EntitySchema } from '../../domains/records/contracts'
import { CellDisplay } from './record-fields'
import { RecordCardFields } from './record-cards'
import { ViewMatchCell } from './view-match'
import type { ViewMatch } from './find-in-view'
const dateValue = (row: RecordRow, field?: string) => { const cell = field ? row.fields[field] : null; return cell?.state === 'value' && typeof cell.value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cell.value) ? cell.value.slice(0, 10) : null }
export function DateViews({ records, view, schema, match }: { records: RecordRow[]; view: View; schema: EntitySchema; match?: ViewMatch | null }) {
  const sorted = [...records].sort((a, b) => (dateValue(a, view.layout.startFieldId) ?? '9999').localeCompare(dateValue(b, view.layout.startFieldId) ?? '9999'))
  const link = (record: RecordRow) => <div key={record.id}><a className="cr-calendar-record" href={`/app/records/${record.ref.appId}/${record.ref.entityId}/${record.id}`}><ViewMatchCell recordId={record.id} fieldId={view.layout.titleFieldId} match={match}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === view.layout.titleFieldId)} cell={record.fields[view.layout.titleFieldId]} /></ViewMatchCell></a><RecordCardFields schema={schema} record={record} visible={view.fields} titleFieldId={view.layout.titleFieldId} match={match} /></div>
  if (view.display !== 'calendar') return <ol className={`cr-date-list cr-date-list--${view.display}`}>{sorted.map(row => <li key={row.id}><div className="cr-date-axis"><time dateTime={dateValue(row, view.layout.startFieldId) ?? undefined}>{dateValue(row, view.layout.startFieldId) ?? 'Unscheduled'}</time>{dateValue(row, view.layout.endFieldId) && <span> → {dateValue(row, view.layout.endFieldId)}</span>}</div>{link(row)}</li>)}</ol>
  const months = [...new Set(sorted.map(row => dateValue(row, view.layout.startFieldId)?.slice(0, 7)).filter((month): month is string => !!month))]
  return <>{months.map(month => {
    const first = new Date(`${month}-01T00:00:00Z`)
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    const offset = (first.getUTCDay() + 6) % 7
    return <section key={month} className="cr-section"><h3>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><div className="cr-calendar" role="region" aria-label={`Calendar for ${month}`} tabIndex={0}><div className="cr-calendar-grid">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="cr-eyebrow">{day}</div>)}{Array.from({ length: offset }, (_, i) => <div key={`blank${i}`} aria-hidden="true" />)}{Array.from({ length: days }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, '0')}`; return <div key={date} className="cr-calendar-day"><time dateTime={date}>{i + 1}</time>{sorted.filter(row => dateValue(row, view.layout.startFieldId) === date).map(link)}</div> })}</div></div></section>
  })}{sorted.some(row => !dateValue(row, view.layout.startFieldId)) && <section className="cr-section"><h3>Unscheduled</h3>{sorted.filter(row => !dateValue(row, view.layout.startFieldId)).map(link)}</section>}</>
}
