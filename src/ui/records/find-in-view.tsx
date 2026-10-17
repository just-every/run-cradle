import { useEffect, useRef, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema, Query, RecordRow, ViewResult } from '../../domains/records/contracts'
import { readApi } from '../shared/api'
import { gridText } from './grid-values'

export type ViewMatch = { recordId: string; fieldId: string; cursor?: string }
export function FindInView({ schema, query, fields, viewId, onMatch }: { schema: EntitySchema; query: Query; fields: string[]; viewId?: string; onMatch(match: ViewMatch | null): void }) {
  const [open, setOpen] = useState(false), [term, setTerm] = useState(''), [matches, setMatches] = useState<ViewMatch[]>([]), [index, setIndex] = useState(0), [state, setState] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const identity = JSON.stringify({ ...query, cursor: undefined, fields, viewId })
  const active = useRef<AbortController | null>(null)
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setOpen(true); setTimeout(() => input.current?.focus(), 0) } }
    const changed = () => { active.current?.abort(); setMatches([]); setState('Records changed. Search again.'); onMatch(null) }
    window.addEventListener('records-changed', changed)
    window.addEventListener('keydown', key); return () => { window.removeEventListener('records-changed', changed); window.removeEventListener('keydown', key); active.current?.abort() }
  }, [])
  useEffect(() => { active.current?.abort(); setMatches([]); setState(''); onMatch(null) }, [identity])
  async function search() {
    active.current?.abort(); const abort = new AbortController(); active.current = abort
    setState('Searching every page…'); setMatches([]); onMatch(null)
    const found: ViewMatch[] = []
    try {
      let cursor: string | undefined
      do {
        const body = { ...query, cursor, fields, limit: query.limit ?? 50 }
        const { data } = await readApi<Page<RecordRow> | ViewResult>(viewId ? `/api/v1/views/${viewId}/query` : `/api/v1/apps/${schema.appId}/entities/${schema.id}/query`, { method: 'POST', body: JSON.stringify(body) }, abort.signal)
        const page = 'records' in data ? data.records : data
        for (const row of page.items) for (const id of fields) {
          const cell = row.fields[id], field = schema.fields.find(item => item.id === id)
          if (field && cell?.state === 'value' && gridText(field, cell.value).toLocaleLowerCase().includes(term.toLocaleLowerCase())) found.push({ recordId: row.id, fieldId: id, cursor })
        }
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      if (abort.signal.aborted) return
      setMatches(found); setIndex(0); setState(found.length ? '' : 'No matches'); onMatch(found[0] ?? null)
    } catch (error) { if (!abort.signal.aborted) setState(error instanceof Error ? error.message : 'Could not search this view.') }
  }
  function step(delta: number) { const next = (index + delta + matches.length) % matches.length; setIndex(next); onMatch(matches[next]!) }
  return <div className="cr-grid-find"><button type="button" className="cr-button cr-button--quiet" onClick={() => { setOpen(value => !value); setTimeout(() => input.current?.focus(), 0) }}>Find in view</button>{open && <form className="cr-actions" onSubmit={event => { event.preventDefault(); if (matches.length) step(1); else if (term) void search() }}><label className="cr-field">Find in visible fields<input ref={input} value={term} onChange={event => { active.current?.abort(); setTerm(event.target.value); setMatches([]); setState(''); onMatch(null) }} onKeyDown={event => { if (event.key === 'Enter' && event.shiftKey && matches.length) { event.preventDefault(); step(-1) } }} /></label><button className="cr-button cr-button--quiet" disabled={!term}>Find</button><span role="status">{matches.length ? `${index + 1} of ${matches.length} matching cells` : state}</span>{matches.length > 0 && <><button type="button" className="cr-button cr-button--quiet" onClick={() => step(-1)}>Previous match</button><button type="button" className="cr-button cr-button--quiet" onClick={() => step(1)}>Next match</button></>}</form>}</div>
}
