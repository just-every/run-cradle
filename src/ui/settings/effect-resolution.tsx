import { FileUpload } from '../evidence/file-upload'
import { FileSummary } from '../evidence/source-page'
import { useEffect, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { Attempt, AttemptReview, Receipt } from '../../domains/execution/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState, Timestamp } from '../shared/presentation'

export function EffectResolutions({ connectionId }: { connectionId: string }) {
 const [revision, setRevision] = useState(0)
 return <details className="cr-detail"><summary>Review external outcomes</summary><p>Use evidence from the provider or recipient to resolve an uncertain action. The original action will not be sent again.</p><AttemptList key={`unknown-${revision}`} connectionId={connectionId} kind="unknowns" onChanged={() => setRevision(value => value + 1)} /><AttemptList key={`resolved-${revision}`} connectionId={connectionId} kind="resolutions" onChanged={() => setRevision(value => value + 1)} /></details>
}
function AttemptList({ connectionId, kind, onChanged }: { connectionId: string; kind: 'unknowns' | 'resolutions'; onChanged: () => void }) {
 const [cursor, setCursor] = useState<string | null>(null)
 const list = useResource<Page<Attempt>>(`/api/v1/connections/${connectionId}/${kind}?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
 return <section><h4>{kind === 'unknowns' ? 'Needs evidence' : 'Recorded decisions'}</h4><ResourceState resource={list.resource} operation="external outcomes" retry={list.refresh}>{page => <>{page.items.length ? page.items.map(attempt => <EffectReview key={attempt.id} attemptId={attempt.id} onChanged={onChanged} />) : <p className="cr-muted">{kind === 'unknowns' ? 'No uncertain actions on this page.' : 'No human decisions on this page.'}</p>}{page.nextCursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(page.nextCursor)}>More outcomes</button>}{cursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(null)}>Back to first outcomes</button>}</>}</ResourceState></section>
}
export function EffectReview({ attemptId, onChanged }: { attemptId: string; onChanged: () => void }) {
 const review = useResource<AttemptReview>(`/api/v1/attempts/${attemptId}/review`)
 return <ResourceState resource={review.resource} operation="action evidence" retry={review.refresh}>{value => <article className="cr-card"><h4>{value.attempt.action} · {value.attempt.state}</h4><p className="cr-muted" style={{ overflowWrap: 'anywhere' }}>Original action {value.attempt.id}</p><p>First possible effect <Timestamp value={value.attempt.firstPossibleEffectAt} /></p>{value.receipt?.humanResolution ? <ResolutionReceipt receipt={value.receipt} /> : value.canResolve ? <ResolutionForm value={value} onChanged={() => { review.refresh(); onChanged() }} /> : <p className="cr-muted">{value.attempt.state === 'dispatching' ? 'The provider call is still in progress. Wait for its outcome before recording a decision.' : 'An authorized operator must record the evidence for this action.'}</p>}</article>}</ResourceState>
}
function ResolutionReceipt({ receipt }: { receipt: Receipt }) {
 const decision = receipt.humanResolution!
 return <div><p><strong>{decision.outcome === 'done' ? 'Done — effect occurred' : 'Not done — effect did not occur'}</strong></p><p style={{ overflowWrap: 'anywhere' }}>Recorded by {decision.actorId} at <Timestamp value={decision.resolvedAt} />.</p><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{decision.evidence.summary}</p><p style={{ overflowWrap: 'anywhere' }}>Evidence reference: {decision.evidence.reference}</p>{receipt.evidenceFileId && <FileSummary id={receipt.evidenceFileId} />}<p className="cr-muted">Human evidence decision retained with the original effect. Changes require a separate audited action.</p></div>
}
function ResolutionForm({ value, onChanged }: { value: AttemptReview; onChanged: () => void }) {
 const [fileId, setFileId] = useState<string | null>(null)
 const [outcome, setOutcome] = useState<'done' | 'not_done'>('done'), [summary, setSummary] = useState(''), [reference, setReference] = useState('')
 const command = useCommand<Receipt>(`effect-resolution:${value.attempt.id}`)
 useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
 return <form className="cr-form" onSubmit={event => { event.preventDefault(); void command.submit('/api/v1/commands/attempt.resolve', { attemptId: value.attempt.id, expectedVersion: value.attempt.version, outcome, evidence: { summary, reference, ...(fileId ? { fileId } : {}) } }, []) }}><label className="cr-field">Outcome<select value={outcome} onChange={event => setOutcome(event.target.value as 'done' | 'not_done')}><option value="done">Done — effect occurred</option><option value="not_done">Not done — effect did not occur</option></select></label><label className="cr-field">Evidence<textarea required maxLength={8000} value={summary} onChange={event => setSummary(event.target.value)} placeholder="Attach the confirmation or explain what was checked and what it establishes." /></label><label className="cr-field">Evidence reference<input required maxLength={2000} value={reference} onChange={event => setReference(event.target.value)} placeholder="Receipt, support ticket, or other traceable reference" /></label><FileUpload appId={value.appId} label="Attach evidence file (optional)" onUploaded={file => setFileId(file.id)} />{fileId && <p className="cr-muted">Verified file attached to this decision. <button type="button" className="cr-button cr-button--quiet" onClick={() => setFileId(null)}>Remove attachment</button></p>}<p className="cr-notice">This records a final decision for the original action. It cannot be replaced or silently retried.</p><button className="cr-button" disabled={!summary.trim() || !reference.trim() || !['idle', 'failed'].includes(command.result.state)}>Record outcome</button><CommandFeedback {...command} /></form>
}
