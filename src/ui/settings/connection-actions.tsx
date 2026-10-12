import { useEffect, useState } from 'react'
import type { Connection } from '../../domains/connections/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
type Action = { action: string; description: string }
export function ConnectionActions({ connection, onChanged }: { connection: Connection; onChanged: () => void }) {
  const actions = useResource<Action[]>('/api/v1/actions')
  const command = useCommand<{ authorizationUrl?: string }>(`connection:${connection.id}`)
  const [revoke, setRevoke] = useState(false)
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  const busy = ['submitting', 'pending', 'unknown'].includes(command.result.state)
  function submit(action: string) { void command.submit(`/api/v1/commands/${action}`, { connectionId: connection.id, ...(action === 'connection.begin-consent' ? { returnTo: '/app/settings' } : {}) }, []) }
  return <div className="cr-stack"><ResourceState resource={actions.resource} operation="connection permissions" retry={actions.refresh}>{catalogue => { const permitted = (action: string) => catalogue.some(item => item.action === action); return <><div className="cr-actions">{connection.state === 'consent_required' && permitted('connection.begin-consent') && <button className="cr-button" disabled={busy} onClick={() => submit('connection.begin-consent')}>Review provider consent</button>}{connection.state === 'connected' && <>{permitted('connection.check') && <button className="cr-button cr-button--quiet" disabled={busy} onClick={() => submit('connection.check')}>Check connection</button>}{permitted('connection.sync') && <button className="cr-button cr-button--quiet" disabled={busy} onClick={() => submit('connection.sync')}>Sync permitted sources</button>}</>}{connection.state !== 'revoked' && permitted('connection.revoke') && <button className="cr-button cr-button--quiet" disabled={busy} onClick={() => setRevoke(true)}>Disconnect</button>}</div>{revoke && <div className="cr-notice"><p>Disconnect this service? New access stops immediately. Anything already sent may still finish; Cradle will check the result.</p><div className="cr-actions"><button className="cr-button cr-button--danger" disabled={busy} onClick={() => { setRevoke(false); submit('connection.revoke') }}>Disconnect {connection.name}</button><button className="cr-button cr-button--quiet" onClick={() => setRevoke(false)}>Keep connected</button></div></div>}</> }}</ResourceState><CommandFeedback {...command} />{command.result.state === 'committed' && command.result.value.authorizationUrl && <a className="cr-button" href={command.result.value.authorizationUrl}>Continue to provider</a>}</div>
}
