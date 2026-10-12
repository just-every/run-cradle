import { useEffect, useState } from 'react'
import type { Ref } from '../../contracts/primitives'
import type { RepairOpenContextData } from '../../apps/repairs/case-runtime.server'
import type { Repair, Intake } from '../../apps/repairs/contracts'
import type { Source } from '../../domains/evidence/contracts'
import { REPAIRS_APP_ID, repairRef } from '../../apps/repairs/model'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState, Timestamp } from '../shared/presentation'
import { LinkedRecord } from '../records/linked-record'
import type { IntakeContext } from '../../apps/repairs/contracts'
export function IntakeDetailPage({ intakeId }: { intakeId: string }) {
  const intake = useResource<Intake>(`/api/v1/intakes/${intakeId}`, { refreshMs: 5000 })
  return <OperatorFeaturePage currentPath="/app/repairs" title=""><div className="cr-page"><a className="cr-link" href="/app/repairs">← Repairs</a><ResourceState resource={intake.resource} operation="problem report" retry={intake.refresh}>{value => <><header className="cr-page-header"><div><p className="cr-eyebrow">{value.state.replaceAll('_', ' ')}</p><h1>Problem report</h1><p>Received <Timestamp value={value.createdAt} /></p></div></header>{value.failure && <p className="cr-error">{value.failure.message}</p>}{value.question ? <ClarifyIntake key={value.version} value={value} onChanged={intake.refresh} /> : <section className="cr-card"><p>{intakeStatus[value.state]}</p>{value.exactIdentity && <p><LinkedRecord reference={value.exactIdentity} /></p>}{value.state === 'ready' && <OpenRepair value={value} onChanged={intake.refresh} />}{value.caseId && <a className="cr-button" href={`/app/cases/${value.caseId}`}>Open current work</a>}</section>}<details className="cr-detail"><summary>Provided evidence</summary>{value.sourceIds.map((id, index) => <p key={id}><a href={`/app/evidence/${id}`}>Supporting source {index + 1}</a></p>)}</details></>}</ResourceState></div></OperatorFeaturePage>
}
function ClarifyIntake({ value, onChanged }: { value: Intake; onChanged: () => void }) {
  const context = useResource<IntakeContext>('/api/v1/repairs/intake-context')
  const capture = useCommand<Source>(`clarification-source:${value.id}`)
  const command = useCommand<Intake>(`clarify-intake:${value.id}`)
  const [selected, setSelected] = useState<Ref | null>(null), [reason, setReason] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  async function submit() {
    if (!selected || busy) return
    setBusy(true)
    try {
      const source = capture.result.state === 'committed' ? capture.result.value : await capture.submit('/api/v1/commands/source.capture', { appId: REPAIRS_APP_ID, kind: 'form', text: reason, fileIds: [], subject: selected }, [])
      if (!source) return
      await command.submit('/api/v1/commands/intake.resolve-identity', { intakeId: value.id, identity: selected, reason, evidence: [{ sourceId: source.id, sourceVersion: source.version, locator: { kind: 'text', start: 0, end: reason.length }, observedAt: source.createdAt }] }, [{ ref: repairRef('intakes', value.id), version: value.version }])
    } finally { setBusy(false) }
  }
  const uncertain = [command.result.state, capture.result.state].some(state => ['unknown', 'pending', 'submitting'].includes(state))
  return <form className="cr-form cr-card" onSubmit={event => { event.preventDefault(); void submit() }}><h2>{value.question?.text}</h2><p>Keep the original report and photo. Only the missing identity needs confirmation.</p><ResourceState resource={context.resource} operation="permitted assets" retry={context.refresh}>{data => <fieldset disabled={busy || uncertain}><legend>Choose the faulty asset</legend>{data.assets.filter(asset => !value.candidates.length || value.candidates.some(candidate => candidate.ref.recordId === asset.ref.recordId)).map(asset => <label className="cr-choice" key={asset.ref.recordId}><input type="radio" name="intake-identity" checked={selected?.recordId === asset.ref.recordId} onChange={() => { setSelected(asset.ref); setReason(`Selected ${asset.name}${asset.serial ? ` (${asset.serial})` : ''} as the faulty asset.`); if (capture.result.state === 'committed') capture.reset() }} />{asset.name}{asset.serial ? ` · ${asset.serial}` : ''}</label>)}</fieldset>}</ResourceState><button className="cr-button" disabled={!selected || !reason.trim() || busy || uncertain}>Confirm asset</button>{capture.result.state !== 'committed' && <CommandFeedback {...capture} />}<CommandFeedback {...command} /></form>
}

const intakeStatus: Record<Intake['state'], string> = { received: 'Your report has been received and is waiting to be checked.', extracting: 'The report and evidence are being checked.', needs_identity: 'The faulty asset needs confirmation.', needs_review: 'The report needs a review before work can proceed.', ready: 'The report is ready for the next repair step.', admitted: 'Repair work is open.', duplicate: 'This report was already received.', failed: 'The report could not be processed. Review the issue above before trying again.' }

function OpenRepair({ value, onChanged }: { value: Intake; onChanged: () => void }) {
  const context = useResource<RepairOpenContextData>(`/api/v1/intakes/${value.id}/open-context`)
  const command = useCommand<Repair>(`open-repair:${value.id}`)
  const [mandateId, setMandateId] = useState<string | null>(null)
  useEffect(() => { if (command.result.state === 'committed') onChanged(); if (command.result.state === 'failed' && ['version_conflict', 'invalid_transition', 'stale_evidence'].includes(command.result.error.detail.code)) { setMandateId(null); context.refresh() } }, [command.result.state])
  return <ResourceState resource={context.resource} operation="current repair instructions" retry={context.refresh}>{data => <form className="cr-form" onSubmit={event => {
    event.preventDefault(); const mandate = data.mandates.find(item => item.id === mandateId); if (!mandate) return
    void command.submit('/api/v1/commands/repair.open', { intakeId: value.id, asset: data.asset, store: data.store, sourceVersions:data.sourceVersions.filter(source=>mandate.sourceIds.includes(source.id)||value.sourceIds.includes(source.id)), mandate: { id: mandate.id, version: mandate.version } }, [data.intake, data.asset, data.store])
  }}><h2>Open repair work</h2><p>{data.description}</p><p>Choose the reviewed operating instructions. Opening creates accountable repair work; it does not contact a contractor, book a visit or approve spending.</p>{data.blockedReason ? <p className="cr-notice">{data.blockedReason}</p> : <fieldset disabled={!['idle', 'failed'].includes(command.result.state)}><legend>Operating instructions</legend>{data.mandates.map(mandate => <label className="cr-choice" key={mandate.id}><input type="radio" name="repair-mandate" checked={mandateId === mandate.id} onChange={() => setMandateId(mandate.id)} /><span>{mandate.objective} · version {mandate.version}{mandate.constraints.map((constraint, index) => <span className="cr-muted" key={index}> · {constraint}</span>)}</span></label>)}</fieldset>}<button className="cr-button" disabled={!mandateId || !['idle', 'failed'].includes(command.result.state)}>Open repair work</button><CommandFeedback {...command} /></form>}</ResourceState>
}
