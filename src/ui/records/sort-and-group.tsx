import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { EntitySchema, Query } from '../../domains/records/contracts'
import { ViewSheet } from './view-sheet'

export function SortAndGroup({ schema, query, setQuery }: { schema: EntitySchema; query: Query; setQuery: Dispatch<SetStateAction<Query>> }) {
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null)
  return <>
    <button ref={anchor} className="cr-chip" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Sort and group</button>
    <ViewSheet wide title="Sort and group" open={open} onClose={() => setOpen(false)} anchor={anchor}>
      <div className="cr-sort-row">
        <label className="cr-field">Sort<select aria-label="Sort" value={query.sort?.[0]?.fieldId ?? ''} onChange={event => setQuery(current => ({ ...current, cursor: undefined, sort: event.target.value ? [{ fieldId: event.target.value, direction: current.sort?.[0]?.direction ?? 'asc' }] : [] }))}><option value="">Record order</option>{schema.fields.map(field => <option value={field.id} key={field.id}>{field.label}</option>)}</select></label>
        <label className="cr-field">Direction<select aria-label="Direction" value={query.sort?.[0]?.direction ?? 'asc'} disabled={!query.sort?.length} onChange={event => setQuery(current => ({ ...current, cursor: undefined, sort: current.sort?.map(sort => ({ ...sort, direction: event.target.value as 'asc' | 'desc' })) }))}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
      </div>
      <label className="cr-field">Group<select aria-label="Group" value={query.groupBy?.[0] ?? ''} onChange={event => setQuery(current => ({ ...current, cursor: undefined, groupBy: event.target.value ? [event.target.value] : [] }))}><option value="">No grouping</option>{schema.fields.filter(field => ['select', 'boolean', 'text', 'person', 'relation'].includes(field.type)).map(field => <option value={field.id} key={field.id}>{field.label}</option>)}</select></label>
    </ViewSheet>
  </>
}
