import { useState } from 'react'
import type { View } from '../../domains/records/contracts'
import { readApi, useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'
type Feed = { id: string; createdAt: string; revokedAt: string | null }
export function CalendarFeed({ view }: { view: View }) {
  const [open, setOpen] = useState(false), [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const endpoint = `/api/v1/views/${view.id}/calendar-feed`, feeds = useResource<{ items: Feed[] }>(open ? endpoint : null)
  async function change(id?: string) {
    setBusy(true); setError('')
    try { const { data } = await readApi<{ url?: string }>(id ? `${endpoint}/${id}` : endpoint, { method: id ? 'DELETE' : 'POST', ...(id ? {} : { body: '{}' }) }); setUrl(data.url ?? ''); feeds.refresh() } catch (problem) { setError((problem as Error).message) } finally { setBusy(false) }
  }
  return <section className="cr-section cr-calendar-feed"><button className="cr-button cr-button--quiet" aria-expanded={open} onClick={() => setOpen(value => !value)}>Calendar subscription</button>{open && <div className="cr-records-panel"><h3>Private iCal subscription</h3><p>Anyone with this secret link can read this view under your current access. Add it by URL in Google Calendar or Outlook. Revoking stops future refreshes; copies already downloaded remain there.</p><button className="cr-button" disabled={busy} onClick={() => void change()}>Create subscription link</button>{url && <label className="cr-field">Subscription URL (shown once)<input readOnly value={url} onFocus={event => event.target.select()} /></label>}{error && <p role="alert">{error}</p>}<ResourceState resource={feeds.resource} operation="calendar subscriptions" retry={feeds.refresh}>{data => <ul>{data.items.map(feed => <li key={feed.id}>{new Date(feed.createdAt).toLocaleString()} · {feed.revokedAt ? 'Revoked' : <button className="cr-button cr-button--quiet" disabled={busy} onClick={() => void change(feed.id)}>Revoke subscription</button>}</li>)}</ul>}</ResourceState></div>}</section>
}
