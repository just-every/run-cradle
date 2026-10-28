import { LAUNCH_APP_ID } from '../../apps/launch/contracts'
import { ViewBar, type ViewPill } from './view-bar'
import { ViewSheet } from './view-sheet'
import { SortAndGroup } from './sort-and-group'
import { TableTools, TableToolsProvider, QuietUndo, type TableToolPanel } from './table-tools'
import './base-menu.css'
import { ViewSummary } from './view-summary'
import { GridHistoryProvider, useGridHistory } from './grid-history'
import { FindInView, type ViewMatch } from './find-in-view'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema, Filter, Query, RecordRow, View } from '../../domains/records/contracts'
import { LiveRecordsStatus, useLiveRecords } from './live-records'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'
import { BulkEditor } from './bulk-editor'
import { ExportCsv } from './export-csv'
import { FormsPanel } from './forms-panel'
import { ImportRecords } from './import-records'
import { ManualImport } from './manual-import'
import type { CsvImportSummary } from '../../domains/records/csv-import-contracts'
import { RecordEditor } from './record-editor'
import { RecordGallery } from './record-gallery'
import { primaryRecordField } from './record-label'
import { RecordBoard } from './record-board'
import { RecordsGrid } from './record-grid'
import { RecordToolbar, FilterChips, type RecordPanel } from './record-toolbar'
import { SavedRecordViews, SaveRecordView } from './saved-views'
import { Tooltip } from '../shared/tooltip'

/** One table of a base, in one card: its title, tabs and actions, the chip toolbar, open panels, then the records. */
export function RecordTable(props: { schema: EntitySchema; pills: ViewPill[]; heading: ReactNode }) { return <GridHistoryProvider key={`${props.schema.appId}:${props.schema.id}:${props.schema.version}`} schema={props.schema}><TableToolsProvider><RecordTableContent {...props} /></TableToolsProvider></GridHistoryProvider> }
function RecordTableContent({ schema, pills, heading }: { schema: EntitySchema; pills: ViewPill[]; heading: ReactNode }) {
  const history = useGridHistory()
  const [findOpen, setFindOpen] = useState(false)
  const [toolPanel, setToolPanel] = useState<TableToolPanel>(null)
  const [savedConfiguration, setSavedConfiguration] = useState('')
  const [match, setMatch] = useState<ViewMatch | null>(null)
  useEffect(() => { const refresh = () => setRevision(value => value + 1); window.addEventListener('records-changed', refresh); return () => window.removeEventListener('records-changed', refresh) }, [])
  const [query, setQuery] = useState<Query>({ limit: 50 })
  const [revision, setRevision] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<CsvImportSummary | null>(null)
  const [creating, setCreating] = useState(false)
  const [savingView, setSavingView] = useState(false)
  const [availableViews, setAvailableViews] = useState<View[]>([])
  const [savedView, setSavedView] = useState<View | null>(null)
  const [display, setDisplay] = useState<'grid' | 'board' | 'cards' | 'form'>('grid')
  const [boardFieldId, setBoardFieldId] = useState(schema.fields.find(field => field.type === 'select' && field.label === 'Status')?.id ?? schema.fields.find(field => field.type === 'select')?.id ?? schema.fields.find(field => field.type === 'person')?.id ?? schema.fields.find(field => field.type === 'relation' && field.relation?.cardinality === 'one')?.id ?? '')
  const [selection, setSelection] = useState<RecordRow[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [visible, setVisible] = useState<string[]>(() => { const primary = primaryRecordField(schema)?.id; return primary ? [primary, ...schema.fields.filter(field => field.id !== primary).map(field => field.id)] : schema.fields.map(field => field.id) })
  const toggleField = (id: string, checked: boolean) => setVisible(current => !checked ? current.filter(fieldId => fieldId !== id) : id === primaryRecordField(schema)?.id ? [id, ...current] : [...current, id])
  const [filterDraft, setFilterDraft] = useState<Filter>({ kind: 'all', conditions: [] })
  const [open, setOpen] = useState<Set<RecordPanel>>(new Set())
  const viewingSaved = savedView !== null
  const toggle = (panel: RecordPanel) => setOpen(current => { const next = new Set(current); if (!next.delete(panel)) next.add(panel); return next })
  const base = `/api/v1/apps/${schema.appId}/entities/${schema.id}`
  const readQuery = {...query,fields:schema.fields.map(field=>field.id)}
  const live = useLiveRecords<Page<RecordRow>>(`${base}/query`, readQuery, !viewingSaved && display !== 'form' ? `${base}/presence` : null, () => setQuery(current => ({ ...current, cursor: undefined })), revision)
  const resource = live.resource
  const rows = useMemo(() => resource.state === 'ready' ? history.reconcile(resource.data.items) : [], [history, resource])

  const configuration = JSON.stringify({ filter: query.filter?.kind === 'all' && !query.filter.conditions.length ? undefined : query.filter, sort: query.sort ?? [], groupBy: query.groupBy ?? [], visible, display, boardFieldId: display === 'board' ? boardFieldId : undefined })
  const initialConfiguration = useRef(configuration)
  const dirty = configuration !== (savedConfiguration || initialConfiguration.current)
  const workingCopy = () => {
    if (!savedView) return
    setQuery({ limit: 50, filter: savedView.filter, sort: savedView.sort, groupBy: savedView.groupBy })
    setVisible([...savedView.fields]); setDisplay(savedView.display === 'board' ? 'board' : savedView.display === 'cards' ? 'cards' : 'grid')
    if (savedView.layout.boardFieldId) setBoardFieldId(savedView.layout.boardFieldId)
    setSavedView(null); setSelection([])
  }
  const savedPills: ViewPill[] = availableViews.map(view => ({ label: view.name, href: `/app/records/${schema.appId}/${schema.id}`, current: savedView?.id === view.id, group: 'saved' }))
  const viewPills = [...pills, ...(['grid', 'board', ...(schema.appId === LAUNCH_APP_ID ? [] : ['cards'])] as const).map(mode => ({ label: mode === 'cards' ? 'Gallery' : mode === 'board' ? 'Board' : 'Grid', href: `/app/records/${schema.appId}/${schema.id}`, current: !viewingSaved && display === mode, group: 'displays' })), ...savedPills]
  const viewBar = <ViewBar pills={viewPills} currentLabel={!viewingSaved && display === 'cards' && schema.appId === LAUNCH_APP_ID ? 'Gallery' : !viewingSaved && display === 'form' ? 'Forms' : undefined} onSelect={pill => { if (pill.group === 'tables') { window.location.assign(pill.href); return }; if (pill.group === 'saved') { setSavedView(availableViews[savedPills.indexOf(pill)] ?? null); setSelection([]); setSavingView(false); return }; setSavedView(null); setDisplay(pill.label === 'Board' ? 'board' : pill.label === 'Gallery' ? 'cards' : 'grid'); setSelection([]); setSavingView(false) }} />
  const canCreate = schema.fields.some(field => !field.readOnly && field.type !== 'computed')
  const title = <header className="cr-page-header cr-base-heading-row">{heading}<Tooltip label="New record"><button type="button" className="cr-button cr-base-heading-row__new" disabled={creating || importing || !canCreate} onClick={() => setCreating(true)}><span className="cr-base-heading-row__label">New record</span><span className="cr-base-heading-row__symbol" aria-hidden="true">+</span></button></Tooltip></header>
  if (importing) { const Import = schema.physicalRevision.startsWith('manual_') ? ManualImport : ImportRecords; return <>{title}{viewBar}<Import schema={schema} onClose={() => setImporting(false)} onSaved={(summary?: CsvImportSummary) => { if (summary) setImportSummary(summary); live.reload(); setImporting(false); setRevision(value => value + 1) }} /></> }
  if (creating) return <>{title}<section className="cr-card cr-records-card">{viewBar}<RecordEditor schema={schema} onCancel={() => setCreating(false)} onSaved={() => { live.reload(); setCreating(false); setRevision(value => value + 1) }} /></section></>
  return <>{title}{viewBar}{bulkOpen && <BulkEditor schema={schema} records={selection} onChanged={() => { live.reload(); setRevision(value => value + 1) }} onClose={() => { setBulkOpen(false); setSelection([]) }} />}<section className="cr-card cr-records-card">
    {selection.length > 0 && <div className="cr-selection-bar"><button className="cr-button cr-button--quiet" onClick={() => setBulkOpen(true)}>Edit {selection.length} selected</button><button className="cr-button cr-button--quiet" onClick={() => setSelection([])}>Clear selection</button></div>}
    <div className="cr-table-controls">
      {!viewingSaved && display !== 'form' && <><RecordToolbar schema={schema} filterDraft={filterDraft} setFilterDraft={setFilterDraft} onFilter={() => { setSelection([]); setQuery(current => ({ ...current, cursor: undefined, filter: filterDraft })) }} open={open} toggle={toggle} /><SortAndGroup schema={schema} query={query} setQuery={setQuery} /></>}
      <TableTools exports={<ExportCsv schema={schema} query={savedView ? {} : { ...query, fields: visible }} viewId={savedView?.id} />} onImport={() => { setImportSummary(null); setImporting(true) }} onGallery={schema.appId === LAUNCH_APP_ID ? () => { setSavedView(null); setDisplay('cards') } : undefined} onForms={() => { setSavedView(null); setDisplay('form') }} onFind={() => { if (display === 'form') setDisplay('grid'); setFindOpen(true) }} onPanel={panel => { if (panel === 'columns') workingCopy(); setToolPanel(panel) }} onSave={() => { workingCopy(); setSavingView(true) }} />
      {!viewingSaved && display !== 'form' && <LiveRecordsStatus {...live} />}<QuietUndo />
    </div>
    {history.feedback}
    {!viewingSaved && <div className="cr-filter-chips"><FilterChips schema={schema} filter={query.filter} onChange={filter => { setFilterDraft(filter); setQuery(current => ({ ...current, cursor: undefined, filter })) }} />{dirty && !savingView && <button type="button" className="cr-button cr-button--quiet" onClick={() => setSavingView(true)}>Save view</button>}</div>}
    {importSummary && <p role="status">Import complete: {importSummary.creates} created · {importSummary.updates} updated · {importSummary.unchanged} unchanged · {importSummary.rejected} rejected.</p>}
    <SavedRecordViews onViews={setAvailableViews} findOpen={findOpen} onFindOpenChange={setFindOpen} schema={schema} appId={schema.appId} entityId={schema.id} selected={savedView} onSelection={view => { setSavedView(view); setSelection([]); setSavingView(false) }} />
    {!viewingSaved && display !== 'form' && <FindInView open={findOpen} onOpenChange={setFindOpen} schema={schema} query={readQuery} fields={visible} onMatch={value => { setMatch(value); if (value) setQuery(current => ({ ...current, cursor: value.cursor })) }} />}
    <ViewSheet wide title={toolPanel === 'columns' ? 'Visible columns' : toolPanel === 'summary' ? 'Summary' : 'Keyboard shortcuts'} open={toolPanel !== null} onClose={() => setToolPanel(null)}>
      {toolPanel === 'columns' && <div role="group" aria-label="Visible columns">{visible.concat(schema.fields.map(field => field.id).filter(id => !visible.includes(id))).map(id => schema.fields.find(field => field.id === id)!).map(field => <label key={field.id} className="cr-choice"><input type="checkbox" aria-label={field.label} checked={visible.includes(field.id)} onChange={event => toggleField(field.id, event.target.checked)} />{field.label}{visible.includes(field.id) && <Tooltip label={`Move column ${visible.indexOf(field.id) + 1} left`}><button type="button" className="cr-button cr-button--quiet" disabled={visible.indexOf(field.id) === 0} onClick={() => setVisible(current => { const next = [...current], index = next.indexOf(field.id); [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next })}>←</button></Tooltip>}</label>)}</div>}
      {toolPanel === 'summary' && <ViewSummary expanded schema={schema} viewId={savedView?.id} query={savedView ? { limit: 100 } : query} fields={savedView?.fields ?? visible} revision={revision} />}
      {toolPanel === 'shortcuts' && <dl className="cr-shortcuts"><dt>Find</dt><dd>Ctrl/Cmd + F</dd><dt>Undo</dt><dd>Ctrl/Cmd + Z</dd><dt>Redo</dt><dd>Shift + Ctrl/Cmd + Z</dd><dt>Fill down</dt><dd>Ctrl/Cmd + D on a selected range</dd><dt>Edit cell</dt><dd>Enter or F2</dd><dt>Select range</dt><dd>Shift + arrow keys</dd><dt>Copy and paste</dt><dd>Ctrl/Cmd + C and Ctrl/Cmd + V</dd></dl>}
    </ViewSheet>
    {savingView && <SaveRecordView schema={schema} defaultDisplay={display === 'board' ? 'board' : display === 'cards' ? 'cards' : 'grid'} defaultBoardFieldId={boardFieldId} query={query} fields={visible} onSaved={() => { setSavedConfiguration(configuration); setSavingView(false) }} />}
    {!viewingSaved && display === 'form' && <div className="cr-records-panel"><FormsPanel schema={schema} /></div>}
    {!viewingSaved && display === 'board' && <><div className="cr-toolbar">{boardFieldId ? <label className="cr-field">Board columns<select aria-label="Board columns" value={boardFieldId} onChange={event => setBoardFieldId(event.target.value)}>{schema.fields.filter(field => field.type === 'select' || field.type === 'person' || field.type === 'relation' && field.relation?.cardinality === 'one').map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label> : <p>Add a single select, person or single linked-record field to organize board columns.</p>}</div></>}
    {!viewingSaved && display !== 'form' && (display !== 'board' || !!boardFieldId) && <ResourceState resource={resource} operation={schema.label} retry={() => { setQuery(current => ({ ...current, cursor: undefined })); setRevision(value => value + 1) }}>{page => page.items.length === 0 ? <Empty headingLevel={2} title={query.filter ? 'No matching records' : 'No records yet'}>{query.filter ? 'Change your filters or add a record.' : 'Add your first record to this table.'}</Empty> : <>{display === 'board' ? <RecordBoard schema={schema} rows={rows} visible={visible} boardFieldId={boardFieldId} name={schema.label} coverFieldId={schema.fields.find(field => field.type === 'attachment')?.id} match={match} /> : display === 'cards' ? <RecordGallery schema={schema} rows={rows} visible={visible} titleFieldId={primaryRecordField(schema)?.id ?? schema.fields[0]!.id} groupBy={query.groupBy ?? []} coverFieldId={schema.fields.find(field => field.type === 'attachment')?.id} match={match} /> : <RecordsGrid schema={schema} rows={rows} visible={visible} groupBy={query.groupBy?.[0]} selection={selection} onSelection={setSelection} match={match} onCreate={canCreate ? () => setCreating(true) : undefined} />}<div className="cr-records-foot"><span>{page.total.value.toLocaleString()}{page.total.kind === 'at_least' ? '+' : ''} records · <Timestamp value={page.evaluatedAt} /></span>{query.cursor && <button className="cr-button cr-button--quiet" onClick={() => setQuery(current => ({ ...current, cursor: undefined }))}>First page</button>}{page.nextCursor && <button className="cr-button cr-button--quiet" onClick={() => setQuery(current => ({ ...current, cursor: page.nextCursor! }))}>Next page</button>}</div></>}</ResourceState>}
  </section></>
}
