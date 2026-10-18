import { useEffect, useRef, useState } from 'react'
import type { EntitySchema, RecordRow, View } from '../../domains/records/contracts'
import { CellDisplay } from './record-fields'
import { RecordCardFields } from './record-cards'
import { ViewMatchCell } from './view-match'
import type { ViewMatch } from './find-in-view'
import { useGridHistory } from './grid-history'
import { addDays, calendarDays, localDate, movedDates, recordDate } from './calendar-dates'
import { calendarPeriod } from './calendar-period'
import { CalendarFeed } from './calendar-feed'
import './record-calendar.css'

export function RecordCalendar({ records, view, schema, timezone, match }: { records: RecordRow[]; view: View; schema: EntitySchema; timezone: string; match?: ViewMatch | null }) {
  const history = useGridHistory(), dragging = useRef<RecordRow | null>(null)
  const start = view.layout.startFieldId!, end = view.layout.endFieldId
  const firstDate = records.map(row => recordDate(row, start, timezone)).filter((value): value is string => !!value).sort()[0]
  const [anchor, setAnchor] = useState(firstDate ?? localDate(new Date().toISOString(), timezone)), [mode, setMode] = useState<'month' | 'week' | 'day'>('month')
  const [problem, setProblem] = useState(''), [over, setOver] = useState<string | null>(null)
  const [moving, setMoving] = useState<RecordRow | null>(null), [destination, setDestination] = useState('')
  const days = calendarDays(anchor, mode)
  const [period, setPeriod] = useState<{ key: string; rows: RecordRow[]; error?: string } | null>(null), [refresh, setRefresh] = useState(0)
  const periodKey = `${view.id}:${days[0]}:${days.at(-1)}`, sourceRevision = records.map(row => `${row.id}:${row.version}`).join(',')
  useEffect(() => {
    const abort = new AbortController()
    calendarPeriod(schema, view, days[0]!, days.at(-1)!, abort.signal).then(rows => { if (!abort.signal.aborted) setPeriod({ key: periodKey, rows }) }, error => { if (!abort.signal.aborted) setPeriod({ key: periodKey, rows: [], error: (error as Error).message }) })
    return () => abort.abort()
  }, [periodKey, sourceRevision, refresh, schema.version, view.version])
  const shown = period?.key === periodKey && !period.error ? period.rows : []
  useEffect(() => { if (match) { const row = records.find(row => row.id === match.recordId), date = row && recordDate(row, start, timezone); if (date) setAnchor(date) } }, [match?.recordId, records, start, timezone])
  const writable = (row: RecordRow) => [start, ...(end ? [end] : [])].every(id => !schema.fields.find(field => field.id === id)?.readOnly && row.fields[id]?.state === 'value') && row.allowedActions.some(action => action.action === 'record.patch' && action.enabled)
  async function move(row: RecordRow, date: string) {
    setProblem('')
    if (history.busy || !writable(row)) return
    try { const changes = movedDates(row, start, end, date, timezone); if (await history.execute([{ recordId: row.id, changes }], [row])) { setMoving(null); setAnchor(date) } } catch (error) { setProblem((error as Error).message) }
  }
  const title = (row: RecordRow) => <ViewMatchCell recordId={row.id} fieldId={view.layout.titleFieldId} match={match}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === view.layout.titleFieldId)} cell={row.fields[view.layout.titleFieldId]} /></ViewMatchCell>
  const card = (row: RecordRow, date: string) => <article key={row.id} className="cr-calendar-event" data-calendar-record={row.id} draggable={writable(row) && !history.busy}
    onDragStart={event => { if (!writable(row) || history.busy || event.target instanceof HTMLElement && event.target.closest('a,button,input')) { event.preventDefault(); return }; dragging.current = row; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-cradle-calendar-record', row.id) }} onDragEnd={() => { dragging.current = null; setOver(null) }}>
    <a className="cr-calendar-record" href={`/app/records/${schema.appId}/${schema.id}/${row.id}`}>{title(row)}</a>
    <p className="cr-calendar-range">{recordDate(row, start, timezone)}{end && recordDate(row, end, timezone) ? ` → ${recordDate(row, end, timezone)}` : ''}</p>
    <RecordCardFields schema={schema} record={row} visible={view.fields} titleFieldId={view.layout.titleFieldId} match={match} />
    {writable(row) && <button type="button" className="cr-button cr-button--quiet" disabled={history.busy} aria-label={`Move record ${row.id}`} onClick={() => { setMoving(row); setDestination(date) }}>Move date</button>}
  </article>
  const navigate = (direction: number) => { if (mode === 'month') { const date = new Date(anchor.slice(0, 7) + '-01T12:00:00Z'); date.setUTCMonth(date.getUTCMonth() + direction); setAnchor(date.toISOString().slice(0, 10)) } else setAnchor(addDays(anchor, direction * (mode === 'week' ? 7 : 1))) }
  return <div className="cr-calendar-workspace">
    <div className="cr-toolbar"><div className="cr-actions" role="group" aria-label="Calendar layout">{(['month', 'week', 'day'] as const).map(value => <button className="cr-button cr-button--quiet" type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div><div className="cr-actions"><button className="cr-button cr-button--quiet" onClick={() => navigate(-1)} aria-label="Previous period">←</button><label className="cr-field">Calendar date<input type="date" value={anchor} onChange={event => { if (event.target.value) setAnchor(event.target.value) }} /></label><button className="cr-button cr-button--quiet" onClick={() => navigate(1)} aria-label="Next period">→</button><button className="cr-button cr-button--quiet" onClick={() => setAnchor(localDate(new Date().toISOString(), timezone))}>Today</button></div></div>
    <p className="cr-muted">{timezone} · Drag a record to move its date, or use Move date. Ranges keep their duration. Every matching record in this period is shown.</p>
    {problem && <p role="alert" className="cr-notice">{problem}</p>}
    {moving && <form className="cr-records-panel cr-form" onSubmit={event => { event.preventDefault(); void move(moving, destination) }}><h3>Move {title(moving)}</h3><label className="cr-field">New start date<input type="date" required value={destination} onChange={event => setDestination(event.target.value)} /></label><div className="cr-actions"><button className="cr-button" disabled={history.busy}>Move record</button><button className="cr-button cr-button--quiet" type="button" onClick={() => setMoving(null)}>Cancel move</button></div></form>}
    {period?.key !== periodKey ? <p role="status">Loading calendar period…</p> : period.error ? <div role="alert"><p>{period.error}</p><button className="cr-button" onClick={() => setRefresh(value => value + 1)}>Refresh calendar</button></div> : <p role="status">{shown.length} records in this period</p>}
    <section className={`cr-calendar-schedule cr-calendar-schedule--${mode}`} aria-label={`${mode} calendar`}>
      {days.map(date => <section key={date} data-calendar-date={date} className={`cr-calendar-slot${date.slice(0, 7) !== anchor.slice(0, 7) && mode === 'month' ? ' cr-calendar-slot--outside' : ''}${over === date ? ' cr-calendar-slot--over' : ''}`}
        onDragOver={event => { if (dragging.current && writable(dragging.current) && !history.busy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(date) } }}
        onDrop={event => { event.preventDefault(); const row = dragging.current; dragging.current = null; setOver(null); if (row && event.dataTransfer.getData('application/x-cradle-calendar-record') === row.id) void move(row, date) }}>
        <h3><time dateTime={date}>{new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: mode === 'day' ? 'long' : 'short', day: 'numeric', timeZone: 'UTC' })}</time></h3>
        {shown.filter(row => { const from = recordDate(row, start, timezone), to = recordDate(row, end, timezone) ?? from; return !!from && from <= date && !!to && to >= date }).map(row => card(row, date))}
      </section>)}
    </section>
    {records.some(row => !recordDate(row, start, timezone)) && <section className="cr-section"><h3>Unscheduled</h3>{records.filter(row => !recordDate(row, start, timezone)).map(row => card(row, anchor))}</section>}
    <CalendarFeed view={view} />
  </div>
}
