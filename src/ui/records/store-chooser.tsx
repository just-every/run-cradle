import { useEffect, useState } from 'react'
import type { CellValue, Ref, StoreReference } from '../../contracts/primitives'
import { readApi, useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
import { storeLabels } from './store-reference-view'

type Item = { itemId: string; name: string; mediaType: string; size: number | null; modifiedAt: string | null; link: string }
type Choice = { id: string; provider: StoreReference['provider']; name: string; state: string }
type Browse = { provider: StoreReference['provider']; attachedBy: string; items: Item[]; next: string | null }
const connectable = ['google-drive', 'onedrive', 'dropbox', 'box'] as const
/** Pick a file from the person's own connected store. Nothing is copied and the store's sharing is not touched. */
export function StoreChooser({ appId, entityId, fieldId, subject, value, onChange }: { appId: string; entityId: string; fieldId: string; subject: Ref; value: CellValue; onChange: (value: CellValue) => void }) {
  const [connections, setConnections] = useState<Choice[] | null>(null), [selected, setSelected] = useState(''), [query, setQuery] = useState('')
  const [browse, setBrowse] = useState<Browse | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [open, setOpen] = useState(false)
  const [chestLink, setChestLink] = useState(''), [chestName, setChestName] = useState('')
  const configure = useCommand<{ connectionId: string }>(`store-configure:${appId}`), consent = useCommand<{ authorizationUrl: string }>(`store-consent:${appId}`)
  useEffect(() => { let live = true; void readApi<{ connections: Choice[] }>(`/api/v1/records/file-stores/connections?appId=${appId}`).then(r => { if (live) { setConnections(r.data.connections); setSelected(current => current || r.data.connections.find(c => c.state === 'connected')?.id || '') } }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Could not read your file stores.') }); return () => { live = false } }, [appId])
  const members = Array.isArray(value) ? (value as unknown[]).filter(item => typeof item === 'object' && item !== null && ('fileId' in item || 'reference' in item)) as CellValue[] : []
  async function search(cursor: string | null) {
    if (!selected) return
    setBusy(true); setError('')
    try { setBrowse((await readApi<Browse>('/api/v1/records/file-stores/browse', { method: 'POST', body: JSON.stringify({ appId, entityId, fieldId, connectionId: selected, query: query.trim() || null, cursor }) })).data) }
    catch (e) { setError(e instanceof Error ? e.message : 'The file store did not answer.') } finally { setBusy(false) }
  }
  function attach(reference: StoreReference) {
    const duplicate = members.some(m => typeof m === 'object' && m !== null && 'reference' in m && (m as { reference: StoreReference }).reference.provider === reference.provider && (m as { reference: StoreReference }).reference.itemId === reference.itemId)
    if (!duplicate) onChange([...members, { reference }] as CellValue)
    setOpen(false); setBrowse(null)
  }
  async function connect(provider: typeof connectable[number]) {
    const saved = await configure.submit('/api/v1/commands/connection.configure', { appId, adapterId: provider, name: `My ${storeLabels[provider]}`, accountId: 'me', scopes: [], ownership: [], credentialRef: null }, [])
    if (!saved) return
    const result = await consent.submit('/api/v1/commands/connection.begin-consent', { connectionId: saved.connectionId, returnTo: `${location.pathname}${location.search}` }, [])
    if (result) window.location.assign(result.authorizationUrl)
  }
  const mine = (connections ?? []).filter(c => c.state === 'connected'), attacher = browse?.attachedBy
  return <div className="cr-stack cr-store-chooser">
    <button type="button" className="cr-button cr-button--quiet" aria-expanded={open} onClick={() => setOpen(!open)}>Choose from a file store</button>
    {open && <div className="cr-stack" role="group" aria-label="Choose a file from your file store">
      <p className="cr-muted">The file stays where it is and keeps the store’s own sharing. Cradle keeps only its name, type and link.</p>
      {mine.length > 0 ? <div className="cr-stack">
        <label className="cr-field">Your file store<select value={selected} onChange={event => { setSelected(event.target.value); setBrowse(null) }}>{mine.map(c => <option key={c.id} value={c.id}>{c.name} ({storeLabels[c.provider]})</option>)}</select></label>
        <label className="cr-field">Search by name<input type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search(null) } }} /></label>
        <button type="button" className="cr-button" disabled={busy || !selected} onClick={() => void search(null)}>{busy ? 'Looking…' : browse ? 'Search' : 'Show files'}</button>
      </div> : <div className="cr-stack"><p>{connections === null ? 'Checking your connections…' : 'Connect a store with read-only access.'}</p><div className="cr-actions">{connectable.map(provider => <button type="button" key={provider} className="cr-button cr-button--quiet" disabled={[configure.result.state, consent.result.state].includes('submitting')} onClick={() => void connect(provider)}>Connect {storeLabels[provider]}</button>)}</div><CommandFeedback {...configure} /><CommandFeedback {...consent} /></div>}
      {error && <p className="cr-error" role="alert">{error}</p>}
      {browse && (browse.items.length ? <ul className="cr-store-items">{browse.items.map(item => <li key={item.itemId}><span>{item.name}<small className="cr-muted"> {item.mediaType}</small></span><button type="button" className="cr-button cr-button--quiet" aria-label={`Attach ${item.name}`} onClick={() => attach({ provider: browse.provider, itemId: item.itemId, name: item.name, mediaType: item.mediaType, size: item.size, modifiedAt: item.modifiedAt, link: item.link, connectionId: selected, attachedBy: attacher! })}>Attach</button></li>)}</ul> : <p>No files match.</p>)}
      {browse?.next && <button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={() => void search(browse.next)}>More files</button>}
      <details><summary>Add a Chest link</summary><div className="cr-stack"><p className="cr-muted">Chest is a sibling RunEditRun product; this adds the link only.</p>
        <label className="cr-field">Chest link<input type="url" value={chestLink} onChange={event => setChestLink(event.target.value)} maxLength={2048} /></label>
        <label className="cr-field">Name<input value={chestName} onChange={event => setChestName(event.target.value)} maxLength={500} /></label>
        <button type="button" className="cr-button cr-button--quiet" disabled={!chestLink || !chestName} onClick={() => { void readApi<{ attachedBy: string }>('/api/v1/records/file-stores/identity').then(r => attach({ provider: 'chest', itemId: chestLink, name: chestName, mediaType: 'application/octet-stream', size: null, modifiedAt: null, link: chestLink, connectionId: null, attachedBy: r.data.attachedBy })).catch(e => setError(e instanceof Error ? e.message : 'Could not add the link.')) }}>Attach Chest link</button></div></details>
    </div>}
  </div>
}
