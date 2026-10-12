import { useEffect, useState } from 'react'
import type { Source } from '../../domains/evidence/contracts'
import type { CompletionReview as Completion } from '../../apps/repairs/contracts'
import { REPAIRS_APP_ID, repairRef } from '../../apps/repairs/model'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState, Timestamp } from '../shared/presentation'
import { SourceEvidence } from '../evidence/source-evidence'

export function CompletionReview({ repairId, onChanged }: { repairId: string; onChanged: () => void }) {
  const review = useResource<Completion>(`/api/v1/repairs/${repairId}/completion-review`)
  const capture = useCommand<Source>(`repair-observation:${repairId}`)
  const command = useCommand(`repair-acceptance:${repairId}`)
  const [readySources, setReadySources] = useState<Record<string, boolean>>({}), [observed, setObserved] = useState(''), [accepted, setAccepted] = useState<boolean | null>(null), [checked, setChecked] = useState(false), [working, setWorking] = useState(false)
  const version = review.resource.state === 'ready' ? review.resource.data.claim.version : null
  useEffect(() => { setChecked(false); setAccepted(null) }, [version])
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  return <ResourceState resource={review.resource} operation="contractor completion claim" retry={review.refresh}>{data => {
    const sources = Array.from(new Map(data.claim.evidence.map(evidence => [evidence.sourceId, evidence.sourceVersion])).entries())
    const busy = working || [capture.result.state, command.result.state].some(state => ['unknown', 'pending', 'submitting'].includes(state))
    const ready = sources.length > 0 && sources.every(([id]) => readySources[id])
    async function submit() {
      if (accepted === null || !checked || !ready || busy) return
      setWorking(true)
      try {
        const source = capture.result.state === 'committed' ? capture.result.value : await capture.submit('/api/v1/commands/source.capture', { appId: REPAIRS_APP_ID, kind: 'inspection', text: observed, fileIds: [], subject: repairRef('stores', data.store.id) }, [])
        if (!source) return
        await command.submit('/api/v1/commands/repair.store-acceptance', { workOrder: data.workOrder, claimId: data.claim.id, claimVersion: data.claim.version, accepted, reason: observed, evidence: [{ sourceId: source.id, sourceVersion: source.version, locator: { kind: 'text', start: 0, end: observed.length }, observedAt: source.createdAt }] }, [data.workOrder, { ref: repairRef('completionClaims', data.claim.id), version: data.claim.version }])
      } finally { setWorking(false) }
    }
    return <section className="cr-section"><h2>Check the physical repair</h2><p>{data.contractor?.name ?? 'Contractor identity unavailable'} reported completion for {data.store.name} on <Timestamp value={data.claim.createdAt} />. Review exact claim version {data.claim.version} and check the equipment yourself.</p>{sources.map(([id, version]) => <SourceEvidence key={`${id}:${version}`} id={id} version={version} onReady={(id, ready) => setReadySources(current => ({ ...current, [id]: ready }))} />)}<form className="cr-form cr-card" onSubmit={event => { event.preventDefault(); void submit() }}><fieldset disabled={busy}><legend>What did you find?</legend><label className="cr-choice"><input type="radio" name="physical-result" checked={accepted === true} onChange={() => { setAccepted(true); setChecked(false) }} />The repair works</label><label className="cr-choice"><input type="radio" name="physical-result" checked={accepted === false} onChange={() => { setAccepted(false); setChecked(false) }} />Still faulty — needs rework</label><label className="cr-field">Your observation<textarea required value={observed} onChange={event => { setObserved(event.target.value); setChecked(false); if (capture.result.state === 'committed') capture.reset() }} /></label><label className="cr-choice"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />I checked the physical result against this completion claim.</label></fieldset><p className="cr-muted">Store acceptance is separate from the contractor’s report. It does not record payment.</p><button className="cr-button" disabled={busy || !ready || !checked || accepted === null || !observed.trim() || !['idle', 'failed'].includes(command.result.state)}>{accepted === false ? 'Request rework' : 'Accept physical repair'}</button>{capture.result.state !== 'committed' && <CommandFeedback {...capture} />}<CommandFeedback {...command} /></form><details className="cr-detail"><summary>Exact claim trace</summary><p>Claim {data.claim.id}; version {data.claim.version}; scope {data.claim.scopeHash}; visit {data.claim.visitId}.</p></details></section>
  }}</ResourceState>
}
