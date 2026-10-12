import { useEffect, useState } from 'react'
import type { RecoveryReview } from '../../domains/operations/contracts'
import type { RecoveryPlan } from '../../domains/releases/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState, Timestamp } from '../shared/presentation'
type Review = RecoveryReview & { plan?: RecoveryPlan }
export function RecoveryReviewPage({ recoveryId }: { recoveryId: string }) {
  const review = useResource<Review>(`/api/v1/operations/recovery/${recoveryId}`, { refreshMs: 5000 })
  return <OperatorFeaturePage currentPath="/app/operations" title=""><div className="cr-page"><a href="/app" className="cr-link">← Today</a><h1>Review recovery</h1><ResourceState resource={review.resource} operation="recovery decision" retry={review.refresh}>{value => <RecoveryOutcome key={`${value.id}:${value.version}`} value={value} onChanged={review.refresh} />}</ResourceState></div></OperatorFeaturePage>
}
function RecoveryOutcome({ value, onChanged }: { value: Review; onChanged: () => void }) {
  const session = useResource<{ member: { id: string } }>('/api/v1/session')
  const command = useCommand<RecoveryReview>(`recovery-decision:${value.id}`)
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false)
  const assigned = session.resource.state === 'ready' && session.resource.data.member.id === value.assigneeId
  const available = value.state === 'awaiting' && Date.parse(value.expiresAt) > Date.now() && assigned && ['idle','failed'].includes(command.result.state)
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  function decide(outcome: 'approved' | 'rejected') { void command.submit('/api/v1/commands/operation.recovery.outcome', { id: value.id, version: value.version, inputHash: value.inputHash, outcome, reason }, []) }
  return <section className="cr-card cr-stack"><p className="cr-eyebrow">{value.state}</p><h2>{value.recommendation}</h2>{value.reasons.map((reason, index) => <p key={index}>{reason}</p>)}<p>Decision expires <Timestamp value={value.expiresAt} />.</p>{value.plan ? <section><h3>Exact recovery</h3><p>{value.plan.kind === 'compatible_rollback' ? 'Return to the rehearsed compatible release.' : value.plan.kind === 'forward_repair' ? 'Apply the rehearsed forward repair.' : 'Stop new work while preserving current data.'}</p><p>{value.plan.inFlight === 'revalidate' ? 'Work already in progress will be checked again against current authority.' : 'Work that has not started will be cancelled.'}</p><p>Applied history is preserved. Already-sent commitments stay in the record; any compensation needs separate authority.</p><details><summary>Rehearsed source and target</summary><p>Plan {value.plan.id} · target release {value.plan.targetReleaseId ?? 'No replacement release'} · rehearsal {value.plan.rehearsalArtifactHash}</p></details></section> : <p className="cr-notice">The exact recovery plan is not available for review. Approval remains unavailable.</p>}{!assigned && <p>This decision belongs to its designated reviewer.</p>}<label className="cr-field">Reason<textarea required value={reason} onChange={event => setReason(event.target.value)} /></label><label className="cr-choice"><input type="checkbox" checked={confirmed} disabled={!available || !value.plan} onChange={event => setConfirmed(event.target.checked)} />I reviewed this exact recovery and the work already in progress.</label><div className="cr-actions"><button className="cr-button" disabled={!available || !value.plan || !confirmed || !reason.trim()} onClick={() => decide('approved')}>Authorize recovery</button><button className="cr-button cr-button--quiet" disabled={!available || !reason.trim()} onClick={() => decide('rejected')}>Keep stopped</button></div><CommandFeedback {...command} /><details><summary>Decision version</summary><p>Version {value.version} · source {value.sourceHash} · input {value.inputHash}</p></details></section>
}
