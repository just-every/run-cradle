import {SavedGroupCounts} from './saved-group-counts'
import { useEffect, useId, useRef, useState } from 'react'
import { RequestFailure } from '../shared/api'
import { Timestamp } from '../shared/presentation'
import { readViewSummary, type ViewSummaryInput, type ViewSummarySnapshot } from './view-summary-query'
import { summaryNumeric, type SummaryAggregate } from './view-summary-values'

export { readViewSummary } from './view-summary-query'
export { summaryEmpty } from './view-summary-values'
export type { SummaryAggregate, SummaryValue } from './view-summary-values'

type SummaryState = { identity: string; status: 'idle' | 'loading' | 'failed'; message?: string } | { identity: string; status: 'ready'; snapshot: ViewSummarySnapshot }
const aggregates: { id: SummaryAggregate; label: string; numeric?: true }[] = [
  { id: 'sum', label: 'Sum', numeric: true }, { id: 'average', label: 'Average', numeric: true },
  { id: 'min', label: 'Minimum', numeric: true }, { id: 'max', label: 'Maximum', numeric: true },
  { id: 'count', label: 'Count (filled)' }, { id: 'empty', label: 'Empty' }, { id: 'percent-filled', label: 'Percent filled' },
]

/** Session-local controls. Opening the panel does not read the whole query; Calculate does. */
export function ViewSummary({ schema, query, fields, viewId, revision, expanded }: ViewSummaryInput & { revision?: number | string; expanded?: boolean }) {
  const panelId = useId(), active = useRef<AbortController | null>(null)
  const [open, setOpen] = useState(false), [fieldId, setFieldId] = useState(''), [aggregate, setAggregate] = useState<SummaryAggregate>('count')
  const identity = JSON.stringify({ schema, query, fields, viewId, revision })
  const [state, setState] = useState<SummaryState>({ identity, status: 'idle' })
  const visible = [...new Set(fields)].flatMap(id => { const field = schema.fields.find(field => field.id === id); return field ? [field] : [] })
  const field = visible.find(item => item.id === fieldId) ?? visible[0]
  const current = state.identity === identity ? state : { identity, status: 'idle' as const, message: 'The view changed. Calculate a fresh summary.' }

  useEffect(() => {
    active.current?.abort()
    setState({ identity, status: 'idle' })
    setFieldId(''); setAggregate('count')
    return () => active.current?.abort()
  }, [identity])
  useEffect(() => {
    const changed = () => { active.current?.abort(); setState({ identity, status: 'idle', message: 'Records changed. Refresh the summary to see current values.' }) }
    window.addEventListener('records-changed', changed)
    return () => window.removeEventListener('records-changed', changed)
  }, [identity])

  async function calculate() {
    active.current?.abort()
    const abort = new AbortController(); active.current = abort
    setState({ identity, status: 'loading' })
    try {
      const snapshot = await readViewSummary({ schema, query, fields, viewId }, abort.signal)
      if (!abort.signal.aborted) setState({ identity, status: 'ready', snapshot })
    } catch (error) {
      if (abort.signal.aborted) return
      const message = error instanceof RequestFailure && error.detail.code === 'stale_cursor' ? 'Records or access changed during the summary. Refresh the summary and calculate again.' : error instanceof Error ? error.message : 'Could not calculate the summary. Refresh and try again.'
      setState({ identity, status: 'failed', message })
    }
  }
  function toggle() {
    if (open) { active.current?.abort(); setState({ identity, status: 'idle' }) }
    setOpen(value => !value)
  }
  const result = current.status === 'ready' && field ? current.snapshot.aggregates[field.id]?.[aggregate] : null
  return <div className="cr-grid-find">
    {expanded === undefined && <button type="button" className="cr-button cr-button--quiet" aria-expanded={open} aria-controls={panelId} onClick={toggle}>Summary</button>}
    {(expanded ?? open) && <section id={panelId} className="cr-records-panel cr-stack" aria-label="Whole-query summary">
      <p>Summarise every matching record you can read, across all pages. Up to 500,000 matching records; counts and totals are streamed across every page.</p>
      {!visible.length ? <p className="cr-notice">No visible, readable fields are available.</p> : <>
        <form className="cr-stack" onSubmit={event => { event.preventDefault(); void calculate() }}>
          <label className="cr-field">Summary field<select value={field?.id ?? ''} onChange={event => { setFieldId(event.target.value); setAggregate('count') }}>{visible.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="cr-field">Calculation<select value={aggregate} onChange={event => setAggregate(event.target.value as SummaryAggregate)}>{aggregates.map(item => <option key={item.id} value={item.id} disabled={item.numeric && (!field || !summaryNumeric(field))}>{item.label}</option>)}</select></label>
          <div className="cr-actions"><button className="cr-button cr-button--quiet" disabled={current.status === 'loading'}>{current.status === 'idle' && !current.message ? 'Calculate summary' : 'Refresh summary'}</button>{current.status === 'loading' && <button type="button" className="cr-button cr-button--quiet" onClick={() => { active.current?.abort(); setState({ identity, status: 'idle', message: 'Calculation cancelled. No partial totals are shown.' }) }}>Cancel</button>}</div>
        </form>
        {current.status === 'loading' && <p role="status">Reading every matching page… No partial totals are shown.</p>}
        {current.status !== 'ready' && current.message && <p className="cr-notice" role={current.status === 'failed' ? 'alert' : 'status'}>{current.message}</p>}
        {current.status === 'ready' && <div className="cr-stack" role="status">
          <p><strong>{current.snapshot.total.toLocaleString()} matching records</strong> across all pages · <Timestamp value={current.snapshot.evaluatedAt} /></p>
          {result && (result.available ? <p className="cr-notice cr-notice--submitting"><strong>{field?.label} · {aggregates.find(item => item.id === aggregate)?.label}: {result.value}</strong>{result.note && <><br />{result.note}</>}</p> : <p className="cr-notice">Summary unavailable: {result.reason}</p>)}
          <SavedGroupCounts schema={schema} snapshot={current.snapshot} showFieldNames />
        </div>}
      </>}
    </section>}
  </div>
}
