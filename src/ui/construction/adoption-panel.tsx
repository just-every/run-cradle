import { useEffect, useState } from 'react'
import type { AdoptionReview, Candidate } from '../../domains/construction/contracts'
import type { Release } from '../../domains/releases/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, Consequences, ResourceState } from '../shared/presentation'
export function AdoptionPanel({ candidate, onChanged }: { candidate: Candidate; onChanged: () => void }) {
  const review = useResource<AdoptionReview>(`/api/v1/candidates/${candidate.id}/adoption-review`)
  const command = useCommand<Release>(`adopt:${candidate.id}`)
  const [choiceId, setChoiceId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const reviewVersion = review.resource.state === 'ready' ? review.resource.data.expected.version : null
  const reviewHash = review.resource.state === 'ready' ? review.resource.data.sourceHash : null
  useEffect(() => { setConfirmed(false); setChoiceId('') }, [reviewVersion, reviewHash, candidate.version])
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  return <ResourceState resource={review.resource} operation="adoption authority" retry={review.refresh}>{data => {
    const choice = data.choices.find(choice => choice.id === choiceId)
    return <section className="cr-card"><h3>Adopt this operation</h3>{data.blockers.map((blocker, i) => <p className="cr-notice" key={i}>{blocker}</p>)}<p>Review the access, data sent outside this workspace, costs, migration and recovery details before confirming.</p><Consequences value={candidate.impact} fieldLabels={data.fieldLabels} />{data.choices.length > 0 && <div className="cr-field"><label htmlFor="adoption-authority">Use approved authority</label><select id="adoption-authority" value={choiceId} onChange={e => { setChoiceId(e.target.value); setConfirmed(false) }}><option value="">Choose authority</option>{data.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></div>}<label className="cr-choice"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={!data.allowed} /><span>I have reviewed this exact version and its consequential changes.</span></label><button className="cr-button" disabled={!data.allowed || !choice || !confirmed || candidate.state !== 'ready_for_decision' || !['idle', 'failed'].includes(command.result.state)} onClick={() => choice && void command.submit('/api/v1/commands/release.adopt', { candidateId: candidate.id, decisionId: choice.decisionId, releaseGrantId: choice.releaseGrantId, expectedLiveReleaseId: data.parentReleaseId }, [data.expected])}>Adopt operation</button><CommandFeedback {...command} /></section>
  }}</ResourceState>
}
