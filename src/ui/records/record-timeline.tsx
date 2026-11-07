import { timelineLimits } from '../../domains/records/timeline-limits'
import { useEffect, useMemo, useState } from 'react'
import type { EntitySchema, RecordRow, TimelineZoom, View } from '../../domains/records/contracts'
import type { ViewMatch } from './find-in-view'
import { CellDisplay } from './record-fields'
import { useGridHistory } from './grid-history'
import { movedDates, recordDate } from './calendar-dates'
import { timelineData } from './timeline-data'
import { timelineSchedule } from './timeline-model'
import { DAY, timelineAxis } from './timeline-axis'
import { TimelineChart } from './timeline-chart'
import { TimelineBaselineControl } from './timeline-baseline'
import './record-timeline.css'

export function RecordTimeline({ records, view, schema, timezone, match, revision }: { records: RecordRow[]; view: View; schema: EntitySchema; timezone: string; match?: ViewMatch | null; revision?: string }) {
  const history = useGridHistory(), [zoom, setZoom] = useState<TimelineZoom>(view.timelineZoom ?? 'week')
  const [refresh, setRefresh] = useState(0), [loaded, setLoaded] = useState<{ key: string; data?: Awaited<ReturnType<typeof timelineData>>; error?: string } | null>(null)
  const [moving, setMoving] = useState<RecordRow | null>(null), [destination, setDestination] = useState(''), [problem, setProblem] = useState('')
  const key = `${view.id}:${view.version}:${schema.version}:${revision ?? records.map(row => `${row.id}:${row.version}`).join(',')}:${refresh}`
  useEffect(() => {
    const abort = new AbortController()
    timelineData(schema, view, abort.signal).then(data => { if (!abort.signal.aborted) setLoaded({ key, data }) }, error => { if (!abort.signal.aborted) setLoaded({ key, error: (error as Error).message }) })
    return () => abort.abort()
  }, [key])
  const data = loaded?.key === key ? loaded.data : undefined
  const schedule = useMemo(() => timelineSchedule(data?.rows ?? [], view, data?.dependenciesComplete ?? false), [data, view])
  const axis = useMemo(() => timelineAxis(schedule.tasks, data?.baseline, zoom, timezone, schema.fields.find(field => field.id === view.layout.startFieldId)?.type === 'date'), [schedule, data, zoom, timezone, schema])
  const start = view.layout.startFieldId!, end = view.layout.endFieldId
  const writable = (row: RecordRow) => [start, ...(end ? [end] : [])].every(id => { const field = schema.fields.find(field => field.id === id); return !!field && !field.readOnly && row.fields[id]?.state === 'value' }) && row.allowedActions.some(action => action.action === 'record.patch' && action.enabled)
  const draft = (row: RecordRow) => { setProblem(''); setMoving(row); setDestination(recordDate(row, start, timezone) ?? '') }
  async function move(row: RecordRow, date: string) {
    setProblem('')
    if (history.busy || !writable(row)) { setProblem('These dates are read only under your current access.'); return }
    try {
      const changes = movedDates(row, start, end, date, timezone)
      if (await history.execute([{ recordId: row.id, changes }], [row])) { setMoving(null); setRefresh(value => value + 1) }
    } catch (error) { setProblem((error as Error).message) }
  }
  const conflicts = schedule.tasks.filter(task => task.issues.includes('Starts before a predecessor ends')).length
  return <div className="cr-timeline-workspace">
    <div className="cr-toolbar"><div className="cr-actions" role="group" aria-label="Timeline zoom">{(['day', 'week', 'month', 'quarter', 'year'] as const).map(value => <button key={value} type="button" className="cr-button cr-button--quiet" aria-pressed={zoom === value} onClick={() => setZoom(value)}>{value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div><button type="button" className="cr-button cr-button--quiet" onClick={() => setRefresh(value => value + 1)}>Refresh timeline</button></div>
    <p className="cr-muted">{timezone} · Drag a bar or use Move date. Each move changes only that record and keeps its duration. Undo and redo use the table’s edit history.</p>
    <TimelineBaselineControl view={view} baseline={data?.baseline ?? view.timelineBaseline} loading={!data} />
    {problem && <p className="cr-notice" role="alert">{problem}</p>}
    {moving && <form className="cr-records-panel cr-form" onSubmit={event => { event.preventDefault(); void move(moving, destination) }}><h3>Move <CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === view.layout.titleFieldId)} cell={moving.fields[view.layout.titleFieldId]} /></h3><label className="cr-field">New start date<input type="date" required value={destination} onChange={event => setDestination(event.target.value)} /></label><div className="cr-actions"><button className="cr-button" disabled={history.busy || !writable(moving)}>Move record</button><button type="button" className="cr-button cr-button--quiet" onClick={() => setMoving(null)}>Cancel move</button></div></form>}
    {!data ? loaded?.key === key && loaded.error ? <p role="alert" className="cr-notice">{loaded.error}</p> : <p role="status">Loading complete timeline…</p> : <>
      <p role="status">{data.rows.length} records in this timeline{view.layout.dependencyFieldId ? ` · ${conflicts} dependency conflicts${schedule.complete ? ` · Critical path duration: ${Number((schedule.duration / DAY).toFixed(3))} days` : ''}` : ''}</p>
      {view.layout.dependencyFieldId && <p className="cr-muted">Each linked record is a predecessor. Critical path uses task durations across this entire saved view; placement conflicts stay visible and do not reschedule any task. Red links mark conflicts; highlighted bars and links mark the critical path.</p>}
      {view.layout.dependencyFieldId && schedule.problems.map(message => <p key={message} role="alert" className="cr-notice">{message}</p>)}
      {axis.overflow ? <p className="cr-notice" role="alert">This date range exceeds {timelineLimits.axisIntervals.toLocaleString('en-US')} axis intervals. Choose a wider zoom or narrow the saved view filters.</p> : <TimelineChart schema={schema} view={view} schedule={schedule} baseline={data.baseline} axis={axis} writable={writable} busy={history.busy} move={(row, date) => void move(row, date)} onDraft={draft} match={match} />}
    </>}
  </div>
}
