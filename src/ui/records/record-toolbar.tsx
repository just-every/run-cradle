import { useRef } from 'react'
import type { EntitySchema, Filter } from '../../domains/records/contracts'
import { Timestamp } from '../shared/presentation'
import { UiIcon } from '../shared/ui-icon'
import { CellDisplay } from './record-fields'
import { FilterEditor, filterWords } from './filter-editor'
import { ViewSheet } from './view-sheet'

export type RecordPanel = 'filter' | 'columns'
export const panelToggleId = (panel: RecordPanel) => `cr-toggle-${panel}`
export function RecordToolbar({ schema, filterDraft, setFilterDraft, onFilter, open, toggle }: { schema: EntitySchema; filterDraft: Filter; setFilterDraft(filter: Filter): void; onFilter(): void; open: Set<RecordPanel>; toggle(panel: RecordPanel): void }) {
  const anchor = useRef<HTMLButtonElement>(null)
  return <>
    <button ref={anchor} className="cr-chip" id={panelToggleId('filter')} type="button" aria-haspopup="dialog" aria-expanded={open.has('filter')} onClick={() => toggle('filter')}><UiIcon name="funnel" />Filter</button>
    <ViewSheet wide title="Filter" open={open.has('filter')} onClose={() => toggle('filter')} anchor={anchor}>
      <form className="cr-stack" onSubmit={event => { event.preventDefault(); onFilter(); toggle('filter') }}><FilterEditor schema={schema} filter={filterDraft} onChange={setFilterDraft} /><button className="cr-button">Apply filters</button></form>
    </ViewSheet>
  </>
}
export function FilterChips({ schema, filter, onChange }: { schema: EntitySchema; filter?: Filter; onChange(filter: Filter): void }) {
  if (!filter) return null
  if (filter.kind !== 'condition') return <>{filter.conditions.map((condition, index) => <FilterChips key={index} schema={schema} filter={condition} onChange={next => onChange({ ...filter, conditions: next.kind !== 'condition' && !next.conditions.length ? filter.conditions.filter((_, i) => i !== index) : filter.conditions.map((item, i) => i === index ? next : item) })} />)}</>
  const field = schema.fields.find(item => item.id === filter.fieldId)
  return <span className="cr-filter-chip"><span>{field?.label} {filterWords[filter.op]} {!['empty', 'not_empty'].includes(filter.op) && (field?.type === 'instant' && typeof filter.value === 'string' ? <Timestamp value={filter.value} /> : <CellDisplay appId={schema.appId} field={field} cell={{ state: 'value', value: filter.value ?? null }} />)}</span><button type="button" onClick={() => onChange({ kind: 'all', conditions: [] })} aria-label={`Remove ${field?.label ?? 'field'} filter`}>Remove</button></span>
}
