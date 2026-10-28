import { useEffect, useRef, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema, Query, RecordRow, ViewResult } from '../../domains/records/contracts'
import { readApi } from '../shared/api'
import { createFindReadableText } from './find-readable-text'

export type ViewMatch = { recordId: string; fieldId: string; cursor?: string }
export function FindInView({ schema, query, fields, viewId, onMatch, open: controlledOpen, onOpenChange }: { schema: EntitySchema; query: Query; fields: string[]; viewId?: string; onMatch(match: ViewMatch | null): void; open?: boolean; onOpenChange?(open: boolean): void }) {
  const [localOpen, setLocalOpen] = useState(false), [term, setTerm] = useState(''), [matches, setMatches] = useState<ViewMatch[]>([]), [index, setIndex] = useState(0), [state, setState] = useState('')
  const open = controlledOpen ?? localOpen
  const setOpen = (value: boolean | ((current: boolean) => boolean)) => { const next = typeof value === 'function' ? value(open) : value; if (onOpenChange) onOpenChange(next); else setLocalOpen(next) }
  useEffect(() => { if (open) input.current?.focus() }, [open])
  const input = useRef<HTMLInputElement>(null)
  const identity = JSON.stringify({ ...query, cursor: undefined, fields, viewId })
  const active = useRef<AbortController | null>(null)
  const searched = useRef(false), repeat = useRef<(() => void) | null>(null)
  repeat.current = open && term && searched.current ? () => { void search() } : null
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setOpen(true); setTimeout(() => input.current?.focus(), 0) } }
    const changed = () => { active.current?.abort(); setMatches([]); onMatch(null); if (repeat.current) repeat.current(); else setState('Records changed. Search again.') }
    window.addEventListener('records-changed', changed)
    window.addEventListener('records-live-changed', changed)
    window.addEventListener('keydown', key); return () => { window.removeEventListener('records-changed', changed); window.removeEventListener('records-live-changed', changed); window.removeEventListener('keydown', key); active.current?.abort() }
  }, [])
  useEffect(() => { active.current?.abort(); searched.current = false; setMatches([]); setState(''); onMatch(null) }, [identity])
  async function search() {
    searched.current = true
    active.current?.abort(); const abort = new AbortController(); active.current = abort
    setState('Searching every page…'); setMatches([]); onMatch(null)
    const found: ViewMatch[] = [], readableText = createFindReadableText(abort.signal)
    const needle = term.toLocaleLowerCase()
    const visibleFields = fields.flatMap(id => { const field = schema.fields.find(item => item.id === id); return field ? [field] : [] })
    try {
      let cursor: string | undefined
      do {
        const body = { ...query, cursor, fields:query.fields??fields, limit: query.limit ?? 50 }
        const { data } = await readApi<Page<RecordRow> | ViewResult>(viewId ? `/api/v1/views/${viewId}/query` : `/api/v1/apps/${schema.appId}/entities/${schema.id}/query`, { method: 'POST', body: JSON.stringify(body) }, abort.signal)
        const page = 'records' in data ? data.records : data
        const rowMatches: ViewMatch[][] = new Array(page.items.length)
        let nextRow = 0
        // At most four rows resolve labels concurrently. Fields and array items
        // stay sequential, so unique references cannot fan out unbounded reads.
        async function scanRows() {
          while (nextRow < page.items.length) {
            abort.signal.throwIfAborted()
            const rowIndex = nextRow++, row = page.items[rowIndex]!, matches: ViewMatch[] = []
            for (const field of visibleFields) {
              const text = await readableText(field, row.fields[field.id], schema.appId)
              if (text && text.toLocaleLowerCase().includes(needle)) matches.push({ recordId: row.id, fieldId: field.id, cursor })
            }
            rowMatches[rowIndex] = matches
          }
        }
        await Promise.all(Array.from({ length: Math.min(4, page.items.length) }, scanRows))
        for (const matches of rowMatches) found.push(...matches)
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      if (abort.signal.aborted) return
      setMatches(found); setIndex(0); setState(found.length ? '' : 'No matches'); onMatch(found[0] ?? null)
    } catch (error) { if (!abort.signal.aborted) { setState(error instanceof Error ? error.message : 'Could not search this view.'); abort.abort() } }
  }
  function step(delta: number) { const next = (index + delta + matches.length) % matches.length; setIndex(next); onMatch(matches[next]!) }
  return <div className="cr-grid-find">{controlledOpen === undefined && <button type="button" className="cr-button cr-button--quiet" onClick={() => { setOpen(value => !value); setTimeout(() => input.current?.focus(), 0) }}>Find in view</button>}{open && <form className="cr-actions" onSubmit={event => { event.preventDefault(); if (matches.length) step(1); else if (term) void search() }}><label className="cr-field">Find in visible fields<input ref={input} value={term} onChange={event => { active.current?.abort(); searched.current = false; setTerm(event.target.value); setMatches([]); setState(''); onMatch(null) }} onKeyDown={event => { if (event.key === 'Enter' && event.shiftKey && matches.length) { event.preventDefault(); step(-1) } }} /></label><button className="cr-button cr-button--quiet" disabled={!term}>Find</button><button type="button" className="cr-button cr-button--quiet" onClick={() => setOpen(false)}>Close find</button><span role="status">{matches.length ? `${index + 1} of ${matches.length} matching cells` : state}</span>{matches.length > 0 && <><button type="button" className="cr-button cr-button--quiet" onClick={() => step(-1)}>Previous match</button><button type="button" className="cr-button cr-button--quiet" onClick={() => step(1)}>Next match</button></>}</form>}</div>
}
