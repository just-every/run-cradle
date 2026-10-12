import { ExportBase } from './export-base'
import { ImportReceipt } from './base-import/receipt'
import { BaseImporter } from './base-import/importer'
import { RecordsGrid } from './record-grid'
import './records.css'
import { ExportCsv } from './export-csv'
import { ManualImport } from './manual-import'
import { SchemaBuilderEntry } from './schema/schema-builder'
import { FormsPanel } from './forms-panel'
import { ImportRecords } from './import-records'
import { FilterEditor } from './filter-editor'
import { BulkEditor } from './bulk-editor'
import { SavedRecordViews, SaveRecordView } from './saved-views'
import { useEffect, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema, Filter, Query, RecordRow } from '../../domains/records/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { readApi, RequestFailure, useResource, type Resource } from '../shared/api'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'
import { RecordEditor } from './record-editor'

type AppSummary = { id: string; name: string; entryUrl: string }
export function RecordsPage({ appId, entityId, importBase = false, importJobId, receipt = false }: { appId?: string; entityId?: string; importBase?: boolean; importJobId?: string; receipt?: boolean }) {
  const apps = useResource<Page<AppSummary>>('/api/v1/apps')
  const [building, setBuilding] = useState(false)
  return <OperatorFeaturePage currentPath="/app/records" title=""><div className="cr-page cr-records-page">{importBase && receipt && importJobId ? <ImportReceipt jobId={importJobId} /> : importBase ? <BaseImporter initialJobId={importJobId} /> : <><header className="cr-page-header"><h1>Records</h1><a className="cr-button cr-button--quiet" href="/app/records/?import=base">Import a base</a></header><SchemaBuilderEntry appId={appId} onOpenChange={setBuilding} />{!building && <ResourceState resource={apps.resource} operation="applications" retry={apps.refresh}>{data => <><nav className="cr-actions" aria-label="Application records">{data.items.map(app => <a className="cr-button cr-button--quiet" href={`/app/records/${app.id}`} key={app.id} aria-current={app.id === appId ? 'page' : undefined}>{app.name}</a>)}</nav>{data.items.length === 0 ? <Empty headingLevel={2} title="Create your first base">Build your tables and fields above, or start from a template.</Empty> : appId ? <EntityBrowser appId={appId} entityId={entityId} /> : <Empty headingLevel={2} title="Choose an application">Each application keeps its own records and access rules.</Empty>}</>}</ResourceState>}</>}</div></OperatorFeaturePage>
}
function EntityBrowser({ appId, entityId }: { appId: string; entityId?: string }) {
  const entities = useResource<Page<EntitySchema>>(`/api/v1/apps/${encodeURIComponent(appId)}/entities`)
  return <ResourceState resource={entities.resource} operation="record types" retry={entities.refresh}>{data => <>{data.items.some(entity=>entity.physicalRevision.startsWith('manual_'))&&<ExportBase appId={appId} />}<nav aria-label="Record types" className="cr-toolbar">{data.items.filter(entity=>entity.label!=='Private source intake').map(entity => <a className="cr-button cr-button--quiet" key={entity.id} href={`/app/records/${appId}/${entity.id}`} aria-current={entity.id === entityId ? 'page' : undefined}>{entity.label}</a>)}</nav>{entityId ? data.items.find(item => item.id === entityId) ? <RecordTable key={entityId} schema={data.items.find(item => item.id === entityId)!} /> : <Empty headingLevel={2} title="Record type unavailable">Refresh the application or select another record type.</Empty> : <Empty headingLevel={2} title={data.items.length ? 'Choose a record type' : 'No record types yet'}>The application schema determines its fields, relationships and available actions.</Empty>}</>}</ResourceState>
}
function RecordTable({ schema }: { schema: EntitySchema }) {
  const [query, setQuery] = useState<Query>({ limit: 50 })
  const [revision, setRevision] = useState(0)
  const [resource, setResource] = useState<Resource<Page<RecordRow>>>({ state: 'loading', data: null })
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [savingView, setSavingView] = useState(false)
  const [selection, setSelection] = useState<RecordRow[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [visible, setVisible] = useState<string[]>(schema.fields.map(field => field.id))
  const [filterDraft, setFilterDraft] = useState<Filter>({ kind: 'all', conditions: [] })
  const base = `/api/v1/apps/${schema.appId}/entities/${schema.id}`
  useEffect(() => {
    const abort = new AbortController(); setResource({ state: 'loading', data: null })
    readApi<Page<RecordRow>>(`${base}/query`, { method: 'POST', body: JSON.stringify(query) }, abort.signal).then(({ data }) => { if (!abort.signal.aborted) setResource({ state: 'ready', data }) }, (error: unknown) => { if (abort.signal.aborted) return; const problem = error instanceof RequestFailure ? error : new RequestFailure(0, { requestId: '', operation: 'records', code: 'internal', message: 'Unable to read records.', retry: 'read' }); setResource({ state: problem.status === 401 ? 'signed_out' : problem.status === 403 ? 'forbidden' : problem.status === 404 ? 'not_found' : 'failed', data: null, error: problem }) })
    return () => abort.abort()
  }, [base, JSON.stringify(query), revision])
  if (importing) { const Import = schema.physicalRevision.startsWith('manual_') ? ManualImport : ImportRecords; return <Import schema={schema} onClose={() => setImporting(false)} onSaved={() => { setImporting(false); setRevision(value => value + 1) }} /> }
  if (creating) return <RecordEditor schema={schema} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setRevision(value => value + 1) }} />
  return <section>{bulkOpen && <BulkEditor schema={schema} records={selection} onChanged={() => setRevision(value => value + 1)} onClose={() => { setBulkOpen(false); setSelection([]) }} />}<details className="cr-detail"><summary>Forms</summary><FormsPanel schema={schema} /></details><details className="cr-detail"><summary>Saved views</summary><SavedRecordViews appId={schema.appId} entityId={schema.id} /></details><header className="cr-page-header cr-record-table-header"><h2>{schema.label}</h2>{selection.length > 0 && <button className="cr-button cr-button--quiet" onClick={() => setBulkOpen(true)}>Edit {selection.length} selected</button>}<ExportCsv schema={schema} query={{...query,fields:visible}} /><button className="cr-button cr-button--quiet" onClick={() => setImporting(true)}>Import CSV</button><button className="cr-button" disabled={!schema.fields.some(field => !field.readOnly && field.type !== 'computed')} onClick={() => setCreating(true)}>New record</button></header><form className="cr-toolbar" onSubmit={e => { e.preventDefault(); setSelection([]); setQuery(current => ({ ...current, cursor: undefined, filter: filterDraft })) }}><details className="cr-detail" style={{ width: '100%' }}><summary>Filter records</summary><FilterEditor schema={schema} filter={filterDraft} onChange={setFilterDraft} /><button className="cr-button cr-button--quiet">Apply filters</button></details><button type="button" className="cr-button cr-button--quiet" onClick={() => setSavingView(value => !value)}>Save view</button><div className="cr-field"><label htmlFor="record-sort">Sort</label><select id="record-sort" value={query.sort?.[0]?.fieldId??''} onChange={e => setQuery(current => ({ ...current, cursor: undefined, sort: e.target.value ? [{ fieldId: e.target.value, direction: 'asc' }] : [] }))}><option value="">Record order</option>{schema.fields.map(field => <option value={field.id} key={field.id}>{field.label}</option>)}</select></div><div className="cr-field"><label htmlFor="record-group">Group</label><select id="record-group" value={query.groupBy?.[0]??''} onChange={e=>setQuery(current=>({...current,cursor:undefined,groupBy:e.target.value?[e.target.value]:[]}))}><option value="">No grouping</option>{schema.fields.filter(f=>['select','boolean','text'].includes(f.type)).map(field=><option value={field.id} key={field.id}>{field.label}</option>)}</select></div><div className="cr-field"><label htmlFor="sort-direction">Direction</label><select id="sort-direction" value={query.sort?.[0]?.direction??'asc'} onChange={event => setQuery(current => ({ ...current, cursor: undefined, sort: current.sort?.map(sort => ({ ...sort, direction: event.target.value as 'asc' | 'desc' })) }))}><option value="asc">Ascending</option><option value="desc">Descending</option></select></div></form>{savingView && <SaveRecordView schema={schema} query={query} fields={visible} onSaved={() => setSavingView(false)} />}<details className="cr-detail"><summary>Visible columns</summary><div className="cr-actions">{schema.fields.map(field => <label key={field.id} className="cr-choice"><input type="checkbox" checked={visible.includes(field.id)} onChange={e => setVisible(current => e.target.checked ? [...current, field.id] : current.filter(id => id !== field.id))} />{field.label}</label>)}</div></details><ResourceState resource={resource} operation={schema.label} retry={() => {setQuery(current=>({...current,cursor:undefined}));setRevision(value => value + 1)}}>{page => page.items.length === 0 ? <Empty headingLevel={2} title="No matching records">Change your filters or add a record.</Empty> : <><RecordsGrid schema={schema} rows={page.items} visible={visible} groupBy={query.groupBy?.[0]} selection={selection} onSelection={setSelection} /><div className="cr-toolbar"><span>{page.total.value.toLocaleString()}{page.total.kind === 'at_least' ? '+' : ''} records · <Timestamp value={page.evaluatedAt} /></span>{query.cursor && <button className="cr-button cr-button--quiet" onClick={() => setQuery(current => ({ ...current, cursor: undefined }))}>First page</button>}{page.nextCursor && <button className="cr-button cr-button--quiet" onClick={() => setQuery(current => ({ ...current, cursor: page.nextCursor! }))}>Next page</button>}</div></>}</ResourceState></section>
}
