import { useEffect, useState, type ReactNode } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema, Filter, Query, RecordRow } from '../../domains/records/contracts'
import { readApi, RequestFailure, type Resource } from '../shared/api'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'
import { BulkEditor } from './bulk-editor'
import { ExportCsv } from './export-csv'
import { FormsPanel } from './forms-panel'
import { ImportRecords } from './import-records'
import { ManualImport } from './manual-import'
import { RecordEditor } from './record-editor'
import { RecordsGrid } from './record-grid'
import { RecordToolbar, panelToggleId, type RecordPanel } from './record-toolbar'
import { SavedRecordViews, SaveRecordView } from './saved-views'

/** One table of a base, in one card: its title, tabs and actions, the chip toolbar, open panels, then the records. */
export function RecordTable({ schema, tabs }: { schema: EntitySchema; tabs: ReactNode }) {
  const [query, setQuery] = useState<Query>({ limit: 50 })
  const [revision, setRevision] = useState(0)
  const [resource, setResource] = useState<Resource<Page<RecordRow>>>({ state: 'loading', data: null })
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [savingView, setSavingView] = useState(false)
  const [savedViewSelected, setSavedViewSelected] = useState(false)
  const [selection, setSelection] = useState<RecordRow[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [visible, setVisible] = useState<string[]>(schema.fields.map(field => field.id))
  const [filterDraft, setFilterDraft] = useState<Filter>({ kind: 'all', conditions: [] })
  const [open, setOpen] = useState<Set<RecordPanel>>(new Set())
  const toggle = (panel: RecordPanel) => setOpen(current => { const next = new Set(current); if (!next.delete(panel)) next.add(panel); return next })
  const base = `/api/v1/apps/${schema.appId}/entities/${schema.id}`
  useEffect(() => {
    const abort = new AbortController(); setResource({ state: 'loading', data: null })
    readApi<Page<RecordRow>>(`${base}/query`, { method: 'POST', body: JSON.stringify(query) }, abort.signal).then(({ data }) => { if (!abort.signal.aborted) setResource({ state: 'ready', data }) }, (error: unknown) => { if (abort.signal.aborted) return; const problem = error instanceof RequestFailure ? error : new RequestFailure(0, { requestId: '', operation: 'records', code: 'internal', message: 'Unable to read records.', retry: 'read' }); setResource({ state: problem.status === 401 ? 'signed_out' : problem.status === 403 ? 'forbidden' : problem.status === 404 ? 'not_found' : 'failed', data: null, error: problem }) })
    return () => abort.abort()
  }, [base, JSON.stringify(query), revision])
  if (importing) { const Import = schema.physicalRevision.startsWith('manual_') ? ManualImport : ImportRecords; return <><div className="cr-tabs-row">{tabs}</div><Import schema={schema} onClose={() => setImporting(false)} onSaved={() => { setImporting(false); setRevision(value => value + 1) }} /></> }
  if (creating) return <section className="cr-card cr-records-card"><div className="cr-tabs-row">{tabs}</div><RecordEditor schema={schema} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setRevision(value => value + 1) }} /></section>
  return <>{bulkOpen && <BulkEditor schema={schema} records={selection} onChanged={() => setRevision(value => value + 1)} onClose={() => { setBulkOpen(false); setSelection([]) }} />}<section className="cr-card cr-records-card">
    <header className="cr-records-card-head"><h2>{schema.label}</h2>{tabs}<div className="cr-actions">{selection.length > 0 && <button className="cr-button cr-button--quiet" onClick={() => setBulkOpen(true)}>Edit {selection.length} selected</button>}<ExportCsv schema={schema} query={{ ...query, fields: visible }} /><button className="cr-button cr-button--quiet" onClick={() => setImporting(true)}>Import CSV</button><button className="cr-button" disabled={!schema.fields.some(field => !field.readOnly && field.type !== 'computed')} onClick={() => setCreating(true)}>New record</button></div></header>
    <RecordToolbar schema={schema} query={query} setQuery={setQuery} filterDraft={filterDraft} setFilterDraft={setFilterDraft} onFilter={() => { setSelection([]); setQuery(current => ({ ...current, cursor: undefined, filter: filterDraft })) }} open={open} toggle={toggle} savingView={savingView} onSaveView={() => setSavingView(value => !value)} />
    {savingView && <SaveRecordView schema={schema} query={query} fields={visible} onSaved={() => setSavingView(false)} />}
    {open.has('columns') && <div className="cr-records-panel" id="cr-panel-columns" role="group" aria-labelledby={panelToggleId('columns')}><div className="cr-actions">{schema.fields.map(field => <label key={field.id} className="cr-choice"><input type="checkbox" checked={visible.includes(field.id)} onChange={e => setVisible(current => e.target.checked ? [...current, field.id] : current.filter(id => id !== field.id))} />{field.label}</label>)}</div></div>}
    {open.has('forms') && <div className="cr-records-panel" id="cr-panel-forms" role="group" aria-labelledby={panelToggleId('forms')}><FormsPanel schema={schema} /></div>}
    {open.has('views') && <div className="cr-records-panel" id="cr-panel-views" role="group" aria-labelledby={panelToggleId('views')}><SavedRecordViews appId={schema.appId} entityId={schema.id} onSelection={setSavedViewSelected} /></div>}
    {!(open.has('views') && savedViewSelected) && <ResourceState resource={resource} operation={schema.label} retry={() => { setQuery(current => ({ ...current, cursor: undefined })); setRevision(value => value + 1) }}>{page => page.items.length === 0 ? <Empty headingLevel={3} title={query.filter ? 'No matching records' : 'No records yet'}>{query.filter ? 'Change your filters or add a record.' : 'Add your first record to this table.'}</Empty> : <><RecordsGrid schema={schema} rows={page.items} visible={visible} groupBy={query.groupBy?.[0]} selection={selection} onSelection={setSelection} /><div className="cr-records-foot"><span>{page.total.value.toLocaleString()}{page.total.kind === 'at_least' ? '+' : ''} records · <Timestamp value={page.evaluatedAt} /></span>{query.cursor && <button className="cr-button cr-button--quiet" onClick={() => setQuery(current => ({ ...current, cursor: undefined }))}>First page</button>}{page.nextCursor && <button className="cr-button cr-button--quiet" onClick={() => setQuery(current => ({ ...current, cursor: page.nextCursor! }))}>Next page</button>}</div></>}</ResourceState>}
  </section></>
}
