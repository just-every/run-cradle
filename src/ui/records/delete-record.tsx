import { useState } from 'react'
import type { Ref } from '../../contracts/primitives'
import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
import { LinkedRecord } from './linked-record'
import { recordLabel } from './record-label'
type DeletionImpact = { ref: Ref; references: { ref: Ref; version: number; fieldId: string; effect: 'restrict' | 'unlink' | 'cascade' }[] }
export function DeleteRecord({ schema, record, onClose }: { schema: EntitySchema; record: RecordRow; onClose: () => void }) {
  const review = useResource<DeletionImpact>(`/api/v1/apps/${schema.appId}/entities/${schema.id}/records/${record.id}/delete-impact`)
  const command = useCommand<{ deleted: Ref; erasureJobId: string }>(`delete-record:${record.id}`)
  const [confirmed, setConfirmed] = useState(false)
  if (command.result.state === 'committed') return <section className="cr-card" role="status"><h2>Record deleted</h2><p>Erasure has been requested. This deletion cannot be undone.</p><a className="cr-button" href={`/app/records/${schema.appId}/${schema.id}`}>Back to records</a></section>
  return <section className="cr-card"><h2>Delete {recordLabel(record, schema)}?</h2><p>This permanently deletes the record. Review affected relationships before continuing. There is no undo.</p><ResourceState resource={review.resource} operation="deletion impact" retry={() => { setConfirmed(false); review.refresh() }}>{impact => <>{impact.references.length ? <ul>{impact.references.map((reference, index) => <li key={index}><LinkedRecord reference={reference.ref} /> — {reference.effect === 'restrict' ? 'blocks deletion' : reference.effect === 'cascade' ? 'also deleted' : 'relationship removed'}</li>)}</ul> : <p>No affected relationships were found.</p>}<label className="cr-choice"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I understand this record and any listed dependent records will be permanently deleted.</span></label><div className="cr-actions"><button className="cr-button" disabled={!confirmed || impact.references.some(reference => reference.effect === 'restrict') || !['idle', 'failed'].includes(command.result.state)} onClick={() => void command.submit('/api/v1/commands/record.delete', { ref: record.ref, confirmation: record.id }, [{ ref: record.ref, version: record.version }])}>Permanently delete</button><button className="cr-button cr-button--quiet" onClick={onClose}>Keep record</button></div></>}</ResourceState><CommandFeedback {...command} /></section>
}
