import { useState } from 'react'
import type { Cell, Page, Ref } from '../../contracts/primitives'
import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import { HistoryRestore } from './history-restore'
import { CellDisplay } from '../records/record-fields'
import type { Member } from '../../domains/authority/contracts'
import { useResource } from '../shared/api'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'
type AuditEntry = { id: string; commandId: string; actor: { id: string; kind: string }; action: string; subject: Ref | null; changes: { fieldId: string; before: Cell; after: Cell }[]; sourceIds: string[]; createdAt: string }
export function RecordHistory({ subject, schema, record, onRestored }: { subject: Ref; schema: EntitySchema; record?: RecordRow; onRestored?: () => void }) {
  const people = useResource<Page<Member>>(`/api/v1/members?appId=${encodeURIComponent(schema.appId)}`)
  const actorName = (id: string) => people.resource.state === 'loading' ? 'Loading person…' : people.resource.state === 'ready' ? people.resource.data.items.find(member => member.id === id)?.name ?? 'Person restricted or removed' : 'Person unavailable'
  const [cursor, setCursor] = useState<string>()
  const query = new URLSearchParams({ ...subject, limit: '30', ...(cursor ? { cursor } : {}) })
  const history = useResource<Page<AuditEntry>>(`/api/v1/history?${query}`)
  return <ResourceState resource={history.resource} operation="record history" retry={history.refresh}>{page => <>{page.items.length === 0 ? <Empty title="No history available">No permitted changes are recorded for this record.</Empty> : page.items.map(entry => <article key={entry.id} className="cr-detail"><p><Timestamp value={entry.createdAt} /> · {entry.actor.kind === 'human' ? actorName(entry.actor.id) : entry.actor.kind} · {entry.action.replaceAll('.', ' ').replaceAll('_', ' ')}</p>{entry.changes.map(change => <div key={change.fieldId}><strong>{schema.fields.find(field => field.id === change.fieldId)?.label ?? 'Field no longer in the current schema'}</strong><p><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === change.fieldId)} cell={change.before} /> → <CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === change.fieldId)} cell={change.after} /></p>{record && onRestored && <HistoryRestore auditId={entry.id} record={record} schema={schema} fieldId={change.fieldId} value={change.before} onRestored={onRestored} />}</div>)}{entry.sourceIds.map((sourceId, index) => <p key={sourceId}><a href={`/app/evidence/${sourceId}`}>Supporting source {index + 1}</a></p>)}<details><summary>Technical trace</summary><p>Command {entry.commandId}</p><p>Actor {entry.actor.kind}: {entry.actor.id}</p></details></article>)}<div className="cr-actions">{cursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(undefined)}>First page</button>}{page.nextCursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(page.nextCursor!)}>Next changes</button>}</div></>}</ResourceState>
}
