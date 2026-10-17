import { ViewSummary } from './view-summary'
import { RecordBoard } from './record-board'
import { BoardHistoryToolbar } from './board-history-toolbar'
import { primaryRecordField } from './record-label'
import { RecordsGrid } from './record-grid'
import { FindInView, type ViewMatch } from './find-in-view'
import { ExportCsv } from './export-csv'
import { DateViews } from './date-views'
import { useEffect, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema, Query, RecordRow, View, ViewResult } from '../../domains/records/contracts'
import { RECORD_SCHEMA_ENTITY_ID, RECORD_VIEW_ENTITY_ID } from '../../domains/records/contracts'
import { readApi, useCommand, useResource } from '../shared/api'
import { CommandFeedback, Empty, ResourceState } from '../shared/presentation'
import { CellDisplay } from './record-fields'

export function SaveRecordView({ schema, query, fields, initial, defaultDisplay = 'grid', defaultBoardFieldId, onSaved }: { schema: EntitySchema; query: Query; fields: string[]; initial?: View; defaultDisplay?: View['display']; defaultBoardFieldId?: string; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [display, setDisplay] = useState<View['display']>(initial?.display ?? defaultDisplay)
  const [titleField, setTitleField] = useState(initial?.layout.titleFieldId ?? primaryRecordField(schema)?.id ?? schema.fields[0]?.id ?? '')
  const [dateField, setDateField] = useState(initial?.layout.startFieldId ?? '')
  const [endField, setEndField] = useState(initial?.layout.endFieldId ?? '')
  const [boardField, setBoardField] = useState(initial?.layout.boardFieldId ?? defaultBoardFieldId ?? schema.fields.find(field => field.type === 'select')?.id ?? '')
  const [visibility, setVisibility] = useState<View['visibility']>(initial?.visibility ?? 'private')
  const command = useCommand<View>(`view:${schema.appId}:${schema.id}:${initial?.id ?? 'new'}`)
  useEffect(() => { if (command.result.state === 'committed') { window.dispatchEvent(new Event('record-views-changed')); onSaved() } }, [command.result.state])
  const dated = ['calendar', 'timeline', 'agenda'].includes(display)
  return <form className="cr-card cr-form" onSubmit={e => { e.preventDefault(); void command.submit('/api/v1/commands/view.save', { ...(initial ? { id: initial.id } : {}), view: { appId: schema.appId, entityId: schema.id, name, display, fields, filter: query.filter ?? { kind: 'all', conditions: [] }, sort: query.sort ?? [], groupBy: query.groupBy ?? [], layout: { titleFieldId: titleField, ...(dated ? { startFieldId: dateField } : {}), ...(display === 'timeline' ? { endFieldId: endField } : {}), ...(display === 'board' ? { boardFieldId: boardField } : {}) }, visibility, shipped: initial?.shipped ?? false } }, [{ ref: { appId: schema.appId, entityId: initial ? RECORD_VIEW_ENTITY_ID : RECORD_SCHEMA_ENTITY_ID, recordId: initial?.id ?? schema.id }, version: initial?.version ?? schema.version }]) }}><h3>{initial ? 'Edit this view' : 'Save this work view'}</h3><p>Current fields, filters and sorting will be kept. A view never grants additional record access.</p><div className="cr-field"><label htmlFor="view-name">Name</label><input id="view-name" value={name} onChange={e => setName(e.target.value)} required /></div><div className="cr-field"><label htmlFor="view-display">Display</label><select id="view-display" value={display} onChange={e => setDisplay(e.target.value as View['display'])}>{['grid', 'cards', 'board', 'calendar', 'timeline', 'agenda'].map(type => <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>)}</select></div><div className="cr-field"><label htmlFor="view-title">Record title</label><select id="view-title" value={titleField} onChange={e => setTitleField(e.target.value)} required>{schema.fields.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></div>{dated && <div className="cr-field"><label htmlFor="view-date">Date</label><select id="view-date" value={dateField} onChange={e => setDateField(e.target.value)} required><option value="">Choose date field</option>{schema.fields.filter(field => field.type === 'date' || field.type === 'instant').map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></div>}{display === 'timeline' && <div className="cr-field"><label htmlFor="view-end-date">End date</label><select id="view-end-date" value={endField} onChange={event => setEndField(event.target.value)} required><option value="">Choose date field</option>{schema.fields.filter(field => field.type === 'date' || field.type === 'instant').map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></div>}{display === 'board' && <div className="cr-field"><label htmlFor="view-group">Columns</label><select id="view-group" value={boardField} onChange={e => setBoardField(e.target.value)} required><option value="">Choose a field</option>{schema.fields.filter(field => field.type === 'select').map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></div>}<label className="cr-field">Who can use this view<select value={visibility} onChange={event => setVisibility(event.target.value as View['visibility'])}><option value="private">Only me</option><option value="app">People with application access</option></select></label><CommandFeedback {...command} /><button className="cr-button" disabled={!['idle', 'failed'].includes(command.result.state)}>Save view</button></form>
}
export function SavedRecordViews({ schema, appId, entityId, selected, onSelection }: { schema: EntitySchema; appId: string; entityId: string; selected: View | null; onSelection: (selected: View | null) => void }) {
  const views = useResource<Page<View>>(`/api/v1/apps/${appId}/views`)
  useEffect(() => { window.addEventListener('record-views-changed', views.refresh); return () => window.removeEventListener('record-views-changed', views.refresh) }, [views.refresh])
  return <ResourceState resource={views.resource} operation="saved views" retry={views.refresh}>{page => <>
    {page.items.some(view => view.entityId === entityId) && <nav className="cr-tabs cr-saved-view-tabs" aria-label="Saved views">{page.items.filter(view => view.entityId === entityId).map(view => <button type="button" className="cr-tab" key={view.id} aria-pressed={selected?.id === view.id} onClick={() => onSelection(selected?.id === view.id ? null : view)}>{view.name}</button>)}</nav>}
    {selected && <><ViewSettings key={`settings-${selected.id}`} view={selected} onChanged={() => { onSelection(null); views.refresh() }} /><SavedViewResult key={selected.id} view={selected} schema={schema} /></>}
  </>}</ResourceState>
}
function SavedViewResult({ view, schema }: { view: View; schema: EntitySchema }) {
  const [revision, setRevision] = useState(0)
  const [match, setMatch] = useState<ViewMatch | null>(null)
  const [selection, setSelection] = useState<RecordRow[]>([])
  useEffect(() => { const refresh = () => setRevision(value => value + 1); window.addEventListener('records-changed', refresh); return () => window.removeEventListener('records-changed', refresh) }, [])
  const [result, setResult] = useState<ViewResult | null>(null)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState<string | undefined>()
  useEffect(() => { const abort = new AbortController(); setResult(null); setError(''); readApi<ViewResult>(`/api/v1/views/${view.id}/query`, { method: 'POST', body: JSON.stringify({ limit: 100, fields: [...new Set([...view.fields,...view.groupBy,...Object.values(view.layout)])], ...(cursor ? { cursor } : {}) }) }, abort.signal).then(({ data }) => { if (!abort.signal.aborted) setResult(data) }, (cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not read the saved view.') }); return () => abort.abort() }, [view.id, view.version, cursor, revision])
  const find = <FindInView schema={schema} viewId={view.id} query={{ limit: 100 }} fields={view.fields} onMatch={value => { setMatch(value); if (value) setCursor(value.cursor) }} />
  const summary = <ViewSummary schema={schema} query={{limit:100}} fields={view.fields} viewId={view.id} revision={revision} />
  const history = view.display === 'board' ? <BoardHistoryToolbar /> : null
  if (error) return <>{find}{summary}{history}<p className="cr-notice" role="alert">{error}</p></>
  if (!result) return <>{find}{summary}{history}<p role="status">Reading current view…</p></>
  if (!result.records.items.length) return <>{find}{summary}{history}<Empty headingLevel={2} title="No matching records">This view currently selects no records you can access.</Empty></>
  const card = (record: RecordRow) => <article key={record.id} className="cr-card"><h3><CellDisplay appId={result.schema.appId} field={result.schema.fields.find(field => field.id === view.layout.titleFieldId)} cell={record.fields[view.layout.titleFieldId]} /></h3>{view.fields.filter(id => id !== view.layout.titleFieldId).map(id => <p key={id}><span className="cr-eyebrow">{result.schema.fields.find(field => field.id === id)?.label}</span><br /><CellDisplay appId={result.schema.appId} field={result.schema.fields.find(field => field.id === id)} cell={record.fields[id]} /></p>)}<a className="cr-link" href={`/app/records/${record.ref.appId}/${record.ref.entityId}/${record.id}`}>Open record</a></article>
  return <>{find}{summary}{history}<section className="cr-section cr-saved-view-result"><header className="cr-section-title"><h2>{view.name}</h2><ExportCsv schema={result.schema} query={{}} viewId={view.id} /><p>{view.display} · {result.records.total.value} records</p></header>{view.display === 'grid' ? <RecordsGrid schema={schema} rows={result.records.items} visible={view.fields} groupBy={view.groupBy.length ? view.groupBy : undefined} selection={selection} onSelection={setSelection} match={match} /> : view.display === 'board' && view.layout.boardFieldId ? <RecordBoard schema={result.schema} rows={result.records.items} visible={view.fields} boardFieldId={view.layout.boardFieldId} titleFieldId={view.layout.titleFieldId} name={view.name} /> : ['calendar', 'timeline', 'agenda'].includes(view.display) ? <DateViews schema={result.schema} records={result.records.items} view={view} /> : <div className={view.display === 'cards' ? 'cr-record-cards' : 'cr-stack'}>{result.records.items.map(card)}</div>}{cursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(undefined)}>First page</button>}{result.records.nextCursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(result.records.nextCursor!)}>Next page</button>}</section></>
}

function ViewSettings({ view, onChanged }: { view: View; onChanged: () => void }) {
  const [editing, setEditing] = useState(false), [removing, setRemoving] = useState(false)
  const schema = useResource<EntitySchema>(editing ? `/api/v1/apps/${view.appId}/entities/${view.entityId}` : null)
  const command = useCommand<{ deletedId: string }>(`delete-view:${view.id}`)
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  return <div className="cr-stack"><div className="cr-actions"><button type="button" className="cr-button cr-button--quiet" onClick={() => setEditing(value => !value)}>{editing ? 'Close view editor' : 'Edit view'}</button>{!view.shipped && <button type="button" className="cr-button cr-button--quiet" onClick={() => setRemoving(true)}>Delete view</button>}</div>{editing && <ResourceState resource={schema.resource} operation="view fields" retry={schema.refresh}>{value => <SaveRecordView schema={value} initial={view} query={{ filter: view.filter, sort: view.sort, groupBy: view.groupBy }} fields={view.fields} onSaved={onChanged} />}</ResourceState>}{removing && <div className="cr-notice"><p>Delete “{view.name}”? Its records remain available.</p><button type="button" className="cr-button cr-button--danger" disabled={!['idle','failed'].includes(command.result.state)} onClick={() => void command.submit('/api/v1/commands/view.delete', { viewId: view.id }, [{ ref: { appId: view.appId, entityId: RECORD_VIEW_ENTITY_ID, recordId: view.id }, version: view.version }])}>Delete this view</button><button type="button" className="cr-button cr-button--quiet" onClick={() => setRemoving(false)}>Keep view</button></div>}<CommandFeedback {...command} /></div>
}
