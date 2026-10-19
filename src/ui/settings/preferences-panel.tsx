import { useEffect, useState } from 'react'
import { notificationKinds } from '../../domains/channels/ports'
import type { Preferences } from '../../domains/channels/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
export function PreferencesPanel() {
  const settings = useResource<{ preferences: Preferences }>('/api/v1/settings')
  return <ResourceState resource={settings.resource} operation="notification preferences" retry={settings.refresh}>{data => <PreferenceForm key={data.preferences.version} value={data.preferences} onSaved={settings.refresh} />}</ResourceState>
}
function PreferenceForm({ value, onSaved }: { value: Preferences; onSaved: () => void }) {
  const [timezone, setTimezone] = useState(value.timezone ?? ''), [digest, setDigest] = useState(value.digestEnabled === null ? 'workspace' : value.digestEnabled ? 'on' : 'off'), [progress, setProgress] = useState(value.progressEnabled)
  const [mutedKinds, setMutedKinds] = useState(value.mutedKinds)
  const command = useCommand<Preferences>('notification-preferences')
  useEffect(() => { if (command.result.state === 'committed') onSaved() }, [command.result.state])
  return <form className="cr-form" onSubmit={event => { event.preventDefault(); void command.submit('/api/v1/commands/preferences.update', { version: value.version, preferences: { timezone: timezone.trim() || null, mutedKinds, digestEnabled: digest === 'workspace' ? null : digest === 'on', progressEnabled: progress } }, []) }}><h2>Your notifications</h2><p>Decisions and meaningful exceptions remain visible in the workspace.</p><label className="cr-field">Personal timezone<input value={timezone} placeholder="Use workspace timezone" onChange={event => setTimezone(event.target.value)} /></label><label className="cr-field">Digest<select value={digest} onChange={event => setDigest(event.target.value)}><option value="workspace">Use workspace setting</option><option value="on">Receive digest</option><option value="off">Do not receive digest</option></select></label><label className="cr-choice"><input type="checkbox" checked={progress} onChange={event => setProgress(event.target.checked)} />Include progress notifications</label><fieldset><legend>Mute email by notification kind</legend><p>Muted kinds stay in your notification inbox.</p>{notificationKinds.map(kind => <label className="cr-choice" key={kind}><input type="checkbox" checked={mutedKinds.includes(kind)} onChange={event => setMutedKinds(current => event.target.checked ? [...current, kind] : current.filter(value => value !== kind))} />Mute {kind.replaceAll('-', ' ')} email</label>)}</fieldset><CommandFeedback {...command} /><button className="cr-button" disabled={!['idle','failed'].includes(command.result.state)}>Save my preferences</button></form>
}
