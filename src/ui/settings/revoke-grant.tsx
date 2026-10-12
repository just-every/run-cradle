import { useEffect, useState } from 'react'
import { AUTHORITY_ENTITY_IDS, type Grant } from '../../domains/authority/contracts'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
export function RevokeGrant({ grant, onChanged }: { grant: Grant; onChanged: () => void }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState('')
  const command = useCommand(`revoke:${grant.id}`)
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  if (!grant.allowedActions?.some(action => action.action === 'grant.revoke' && action.enabled)) return null
  return <>{open ? <form onSubmit={event => { event.preventDefault(); void command.submit('/api/v1/commands/grant.revoke', { grantId: grant.id, reason }, [{ ref: { appId: grant.appId, entityId: AUTHORITY_ENTITY_IDS.grant, recordId: grant.id }, version: grant.version }]) }}><p>Stop future use of this authority. This does not undo work already sent to another service.</p><label className="cr-field">Reason<textarea required value={reason} onChange={event => setReason(event.target.value)} /></label><button className="cr-button" disabled={!reason.trim() || !['idle', 'failed'].includes(command.result.state)}>Revoke authority</button><button type="button" className="cr-button cr-button--quiet" onClick={() => setOpen(false)}>Keep authority</button></form> : <button className="cr-button cr-button--quiet" onClick={() => setOpen(true)}>Revoke authority</button>}<CommandFeedback {...command} /></>
}
