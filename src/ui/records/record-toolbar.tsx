import type { Dispatch, SetStateAction } from 'react'
import type { EntitySchema, Filter, Query } from '../../domains/records/contracts'
import { UiIcon } from '../shared/ui-icon'
import { FilterEditor } from './filter-editor'

export type RecordPanel = 'filter' | 'columns' | 'forms' | 'views'
const chevron = <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m3 4.5 3 3 3-3" /></svg>
export const panelToggleId = (panel: RecordPanel) => `cr-toggle-${panel}`

/** The chip row above a table: filter, sort, group, direction, columns and saved views. Selects stay native for keyboard and screen readers. */
export function RecordToolbar({ schema, query, setQuery, filterDraft, setFilterDraft, onFilter, open, toggle, savingView, onSaveView }: { schema: EntitySchema; query: Query; setQuery: Dispatch<SetStateAction<Query>>; filterDraft: Filter; setFilterDraft: (filter: Filter) => void; onFilter: () => void; open: Set<RecordPanel>; toggle: (panel: RecordPanel) => void; savingView: boolean; onSaveView: () => void }) {
  const panelToggle = (panel: RecordPanel) => ({ id: panelToggleId(panel), 'aria-expanded': open.has(panel), 'aria-controls': `cr-panel-${panel}`, onClick: () => toggle(panel), type: 'button' as const })
  return <form className="cr-records-toolbar" onSubmit={event => { event.preventDefault(); onFilter() }}>
    <div className="cr-chip-row">
      <button className="cr-chip" {...panelToggle('filter')}><UiIcon name="funnel" />Filter records</button>
      <span className="cr-chip cr-chip-select"><label htmlFor="record-sort">Sort</label><span aria-hidden="true">:</span><select id="record-sort" value={query.sort?.[0]?.fieldId ?? ''} onChange={e => setQuery(current => ({ ...current, cursor: undefined, sort: e.target.value ? [{ fieldId: e.target.value, direction: 'asc' }] : [] }))}><option value="">Record order</option>{schema.fields.map(field => <option value={field.id} key={field.id}>{field.label}</option>)}</select></span>
      <span className="cr-chip cr-chip-select"><label htmlFor="record-group">Group</label><span aria-hidden="true">:</span><select id="record-group" value={query.groupBy?.[0] ?? ''} onChange={e => setQuery(current => ({ ...current, cursor: undefined, groupBy: e.target.value ? [e.target.value] : [] }))}><option value="">No grouping</option>{schema.fields.filter(f => ['select', 'boolean', 'text'].includes(f.type)).map(field => <option value={field.id} key={field.id}>{field.label}</option>)}</select></span>
      <span className="cr-chip cr-chip-select"><label className="cr-sr-only" htmlFor="sort-direction">Direction</label><select id="sort-direction" value={query.sort?.[0]?.direction ?? 'asc'} onChange={event => setQuery(current => ({ ...current, cursor: undefined, sort: current.sort?.map(sort => ({ ...sort, direction: event.target.value as 'asc' | 'desc' })) }))}><option value="asc">Ascending</option><option value="desc">Descending</option></select></span>
      <button className="cr-chip" {...panelToggle('columns')}>Visible columns{chevron}</button>
      <button type="button" className="cr-chip" aria-expanded={savingView} onClick={onSaveView}>Save view</button>
      <span className="cr-chip-toggles"><button className="cr-toggle" {...panelToggle('forms')}>Forms</button><button className="cr-toggle" {...panelToggle('views')}>Saved views</button></span>
    </div>
    {open.has('filter') && <div className="cr-records-panel" id="cr-panel-filter" role="group" aria-labelledby={panelToggleId('filter')}><FilterEditor schema={schema} filter={filterDraft} onChange={setFilterDraft} /><button className="cr-button cr-button--quiet">Apply filters</button></div>}
  </form>
}
