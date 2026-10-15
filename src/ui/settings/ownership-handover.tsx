import { useEffect, useState } from 'react'
import { AUTHORITY_ENTITY_IDS, type Member } from '../../domains/authority/contracts'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
import { sessionFetch } from '../shared/session-fetch'

/** OPS-002 handover: after a fresh email-link confirmation, another active member becomes the
 * installation owner; the former owner can then remove themselves. */
export function OwnershipHandover({ member, appId, onDone, onCancel }: { member: Member; appId: string; onDone: () => void; onCancel: () => void }) {
 const command = useCommand<{ id: string; owner: boolean }>(`owner-transfer:${member.id}`)
 const [proof, setProof] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
 useEffect(() => { if (command.result.state === 'committed') onDone() }, [command.result.state])
 const needsProof = command.result.state === 'failed' && command.result.error.detail.blockers?.some(blocker => blocker.code === 'step_up_required')
 async function sendProof() {
  setProof('sending')
  const response = await sessionFetch('/auth/step-up', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'owner:transfer', returnTo: '/app/settings' }) }).catch(() => null)
  setProof(response?.ok ? 'sent' : 'failed')
 }
 return <div className="cr-form">
  <p>{member.name} becomes the installation owner with your access in every application. You become an admin and are signed out; sign in again to keep your access until you remove yourself, which you can do once you no longer own campaigns or hold assigned decisions.</p>
  {needsProof ? <div className="cr-notice" role="status"><p>Confirm it is you first. We email a link to your own address; open it in this browser, then hand over within 10 minutes.</p>{proof === 'sent' ? <p>Check your email for the confirmation link.</p> : <button type="button" className="cr-button cr-button--quiet" disabled={proof === 'sending'} onClick={() => void sendProof()}>Email me a confirmation link</button>}{proof === 'failed' && <p className="cr-error">The confirmation email could not be sent. Try again.</p>}</div> : <CommandFeedback {...command} />}
  <div className="cr-actions"><button type="button" className="cr-button" disabled={['submitting', 'pending', 'unknown'].includes(command.result.state)} onClick={() => { command.reset(); void command.submit('/api/v1/commands/member.transfer-ownership', { memberId: member.id }, [{ ref: { appId, entityId: AUTHORITY_ENTITY_IDS.member, recordId: member.id }, version: member.version }]) }}>Hand over ownership to {member.name}</button><button type="button" className="cr-button cr-button--quiet" onClick={onCancel}>Cancel</button></div>
 </div>
}
