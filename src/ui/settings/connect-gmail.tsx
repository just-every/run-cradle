import { useState, type FormEvent } from 'react'
import type { Page } from '../../contracts/primitives'
import type { AuthorityCapabilities } from '../../domains/authority/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'

export function ConnectGmail() {
  const apps = useResource<Page<{ id: string; name: string }>>('/api/v1/apps')
  const [appId, setAppId] = useState('')
  return <ResourceState resource={apps.resource} operation="applications" retry={apps.refresh}>{page => <div className="cr-stack">
    <label className="cr-field">Application for Gmail<select value={appId} onChange={event => setAppId(event.target.value)}><option value="">Choose an application</option>{page.items.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
    {appId && <GmailForm key={appId} appId={appId} />}
  </div>}</ResourceState>
}

function GmailForm({ appId }: { appId: string }) {
  const access = useResource<AuthorityCapabilities>(`/api/v1/authority/capabilities?appId=${encodeURIComponent(appId)}`)
  const configure = useCommand<{ connectionId: string }>(`gmail-configure:${appId}`)
  const consent = useCommand<{ authorizationUrl: string }>(`gmail-consent:${appId}`)
  const [mailbox, setMailbox] = useState('')
  const busy = [configure.result.state, consent.result.state].some(state => ['submitting', 'pending', 'unknown'].includes(state))
  async function connect(event: FormEvent) {
    event.preventDefault()
    const saved = configure.result.state === 'committed' ? configure.result.value : await configure.submit('/api/v1/commands/connection.configure', { appId, adapterId: 'gmail', name: mailbox, accountId: mailbox, scopes: [], ownership: [], credentialRef: null }, [])
    if (!saved) return
    const result = await consent.submit('/api/v1/commands/connection.begin-consent', { connectionId: saved.connectionId, returnTo: '/app/settings' }, [])
    if (result) window.location.assign(result.authorizationUrl)
  }
  return <ResourceState resource={access.resource} operation="connection setup authority" retry={access.refresh}>{authority => authority.allowedActions.some(action => action.action === 'connection.configure' && action.enabled) ? <form className="cr-stack" onSubmit={event => void connect(event)}>
    <p>Connect your Gmail mailbox to this application. Google will ask you to review access. No automatic mail actions are enabled.</p>
    <label className="cr-field">Gmail address<input type="email" autoComplete="email" required maxLength={254} value={mailbox} disabled={busy || configure.result.state === 'committed'} onChange={event => setMailbox(event.target.value)} /></label>
    <button className="cr-button" disabled={busy}>{busy ? 'Connecting…' : 'Connect Gmail'}</button>
    <CommandFeedback {...configure} /><CommandFeedback {...consent} />
  </form> : <p>Your workspace owner can connect Gmail.</p>}</ResourceState>
}
