import { useEffect, useState } from 'react'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { sessionFetch } from '../shared/session-fetch'
import { Empty } from '../shared/presentation'
import type { SearchHit } from '../../core/features/search/service'

export function SearchPage() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [state, setState] = useState<{ kind: 'idle' | 'loading' } | { kind: 'ready'; hits: SearchHit[] } | { kind: 'failed'; message: string }>({ kind: 'idle' })
  useEffect(() => {
    if (!query.trim()) { setState({ kind: 'idle' }); return }
    const abort = new AbortController(); setState({ kind: 'loading' })
    sessionFetch(`/api/search?q=${encodeURIComponent(query)}&archived=${archived}`, { signal: abort.signal }).then(async response => { const body = await response.json() as { error?: { message?: string }; items?: SearchHit[] }; if (!response.ok) throw new Error(body?.error?.message ?? `Search returned ${response.status}.`); if (!Array.isArray(body.items)) throw new Error('Search returned invalid results.'); if (!abort.signal.aborted) setState({ kind: 'ready', hits: body.items }) }).catch((error: unknown) => { if (!abort.signal.aborted) setState({ kind: 'failed', message: error instanceof Error ? error.message : 'Search failed.' }) })
    return () => abort.abort()
  }, [query, archived])

  return <OperatorFeaturePage currentPath="/app/search" title=""><div className="cr-page"><header className="cr-page-header"><h1>Find your work.</h1></header><form className="cr-toolbar" role="search" onSubmit={e => { e.preventDefault(); setQuery(input.trim()) }}><div className="cr-field"><label htmlFor="global-search">Search all bases</label><input id="global-search" type="search" value={input} onChange={e => setInput(e.target.value)} placeholder="A name, code or the beginning of a word…" /></div><button className="cr-button">Search</button><label className="cr-choice"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />Include archived records</label></form><p className="cr-muted">Searches the records and fields you can read across all your bases. Up to 20 results per table. Comments are excluded.</p>{state.kind === 'idle' && <Empty title="Start with what you remember">Search a name, code or the beginning of a word.</Empty>}{state.kind === 'loading' && <p role="status">Searching current records…</p>}{state.kind === 'failed' && <p className="cr-notice" role="alert">{state.message}</p>}{state.kind === 'ready' && (state.hits.length === 0 ? <Empty title="No matching records">Try a different word or include archived records.</Empty> : <div className="cr-stack" aria-live="polite">{state.hits.map(hit => <article className="cr-card" key={`${hit.appId}:${hit.entityId}:${hit.id}`}><span className="cr-eyebrow">{hit.baseName} · {hit.recordType}</span><h3 style={{ marginTop: 8 }}><a href={hit.href}>{hit.name}</a></h3>{hit.overdue === true && <span className="cr-tag cr-tag--warn">Overdue</span>}</article>)}</div>)}</div></OperatorFeaturePage>
}
