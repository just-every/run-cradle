import { useState } from 'react'
import type { WatchChannel, WatchTarget } from '../../domains/records/watching/contracts'
import { readApi, useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'

type WatchPreference = { enabled: boolean; mode: 'immediate' | 'daily'; channels: WatchChannel[]; assigned: boolean; version: number }
const channels: { value: WatchChannel; label: string }[] = [
  { value: 'in-app', label: 'In-app' }, { value: 'email', label: 'Email' },
  { value: 'slack', label: 'Slack' }, { value: 'teams', label: 'Teams' }, { value: 'nook', label: 'Nook' },
]

/** Personal notification preferences reuse the record and table Settings doors. */
export function WatchSettings({ target }: { target: WatchTarget }) {
  const label = target.recordId ? 'record' : target.viewId ? 'view' : 'table'
  const url = '/api/v1/watches?' + new URLSearchParams(target).toString()
  const preference = useResource<WatchPreference>(url)
  const [message, setMessage] = useState('')
  return <>{message && <p role="status">{message}</p>}<ResourceState resource={preference.resource} operation={`${label} watch settings`} retry={preference.refresh}>{data => <WatchForm key={`${url}:${data.version}`} target={target} preference={data} label={label} onSaved={() => { setMessage('Watch settings saved.'); preference.refresh() }} />}</ResourceState></>
}
function WatchForm({ target, preference, label, onSaved }: { target: WatchTarget; preference: WatchPreference; label: string; onSaved(): void }) {
  const [enabled, setEnabled] = useState(preference.enabled)
  const [mode, setMode] = useState(preference.mode)
  const [selected, setSelected] = useState(preference.channels)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save(nextEnabled = enabled) {
    setBusy(true); setError('')
    try {
      await readApi<WatchPreference>('/api/v1/watches', { method: 'PUT', body: JSON.stringify({ ...target, enabled: nextEnabled, mode, channels: selected.length ? selected : preference.channels }) })
      onSaved()
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Your watch settings could not be saved.') }
    finally { setBusy(false) }
  }
  return <form className="cr-form cr-records-panel" aria-label={`${label[0]!.toUpperCase() + label.slice(1)} watch settings`} onSubmit={event => { event.preventDefault(); void save() }}>
    <label className="cr-choice"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Watch {label}</label>
    {preference.assigned && preference.enabled && <p>You also watch this record’s comments through a user field.</p>}
    <label className="cr-field">Notification timing<select value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="immediate">Immediately</option><option value="daily">Daily digest</option></select></label>
    <fieldset className="cr-form"><legend>Delivery channels</legend>{channels.map(channel => <label key={channel.value} className="cr-choice"><input type="checkbox" checked={selected.includes(channel.value)} onChange={event => setSelected(current => event.target.checked ? [...current, channel.value] : current.filter(value => value !== channel.value))} />{channel.label}</label>)}</fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="cr-toolbar"><button className="cr-button" disabled={busy || enabled && selected.length === 0}>Save watch settings</button>{preference.enabled && <button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={() => void save(false)}>Unwatch {label}</button>}</div>
  </form>
}
