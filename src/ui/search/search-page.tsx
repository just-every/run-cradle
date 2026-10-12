import { useEffect, useState } from 'react'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { sessionFetch } from '../shared/session-fetch'
import { Empty } from '../shared/presentation'

type Hit = { id: string; name: string; recordType: string; code?: string; campaignCode?: string }
export function SearchPage() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [state, setState] = useState<{ kind: 'idle' | 'loading' } | { kind: 'ready'; hits: Hit[] } | { kind: 'failed'; message: string }>({ kind: 'idle' })
  useEffect(() => {
    if (!query.trim()) { setState({ kind: 'idle' }); return }
    const abort = new AbortController(); setState({ kind: 'loading' })
    sessionFetch(`/api/search?q=${encodeURIComponent(query)}&archived=${archived}`, { signal: abort.signal }).then(async response => { const body = await response.json() as { error?: { message?: string }; items?: Hit[] }; if (!response.ok) throw new Error(body?.error?.message ?? `Search returned ${response.status}.`); if (!Array.isArray(body.items)) throw new Error('Search returned invalid results.'); if (!abort.signal.aborted) setState({ kind: 'ready', hits: body.items }) }).catch((error: unknown) => { if (!abort.signal.aborted) setState({ kind: 'failed', message: error instanceof Error ? error.message : 'Search failed.' }) })
    return () => abort.abort()
  }, [query, archived])
  const href = (hit: Hit) => hit.recordType === 'Campaign' ? `/app/campaigns/${hit.id}` : hit.recordType === 'Risk' ? `/app/risks/${hit.id}` : hit.recordType === 'Milestone' ? `/app/milestones/${hit.id}` : hit.recordType === 'Decision' ? `/app/decisions/${hit.id}` : `/app/campaigns?search=${encodeURIComponent(hit.campaignCode ?? hit.name)}`
  return <OperatorFeaturePage currentPath="/app/search" title=""><div className="cr-page"><header className="cr-page-header"><h1>Find your work.</h1></header><form className="cr-toolbar" role="search" onSubmit={e => { e.preventDefault(); setQuery(input.trim()) }}><div className="cr-field"><label htmlFor="global-search">Search launch records</label><input id="global-search" type="search" value={input} onChange={e => setInput(e.target.value)} placeholder="A campaign, milestone, risk or decision…" /></div><button className="cr-button">Search</button><label className="cr-choice"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />Include archived campaigns</label></form><p className="cr-muted">Up to 20 results per record type. Comments are excluded.</p>{state.kind === 'idle' && <Empty title="Start with what you remember">Search a name, code or the beginning of a word.</Empty>}{state.kind === 'loading' && <p role="status">Searching current records…</p>}{state.kind === 'failed' && <p className="cr-notice" role="alert">{state.message}</p>}{state.kind === 'ready' && (state.hits.length === 0 ? <Empty title="No matching records">Try a different word or include archived campaigns.</Empty> : <div className="cr-stack" aria-live="polite">{state.hits.map(hit => <article className="cr-card" key={`${hit.recordType}:${hit.id}`}><span className="cr-eyebrow">{hit.recordType} {hit.campaignCode ?? hit.code ?? ''}</span><h3 style={{ marginTop: 8 }}><a href={href(hit)}>{hit.name}</a></h3></article>)}</div>)}</div></OperatorFeaturePage>
}
