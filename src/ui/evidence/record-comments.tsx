import { useRef, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { RecordRow } from '../../domains/records/contracts'
import { useCommand, useResource, type Resource } from '../shared/api'
import { CommandFeedback, ResourceState, Timestamp } from '../shared/presentation'
import { CommentComposer, type RecordComment } from './comment-composer'

type ThreadComment = RecordComment & { redacted: boolean; canRedact: boolean }
type Thread = Page<ThreadComment> & { canAdd: boolean }

export function RecordComments({ record, onChanged }: { record: RecordRow; onChanged?: () => void }) {
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const [redacting, setRedacting] = useState<string>()
  const query = new URLSearchParams({ appId: record.ref.appId, entityId: record.ref.entityId, recordId: record.id, q: search, limit: '30', ...(cursor ? { cursor } : {}) })
  const url = `/api/v1/comments?${query}`
  const thread = useResource<Thread>(url, { refreshMs: 1500 })
  const lastReady = useRef<{ url: string; resource: Resource<Thread> } | null>(null)
  if (thread.resource.state === 'ready') lastReady.current = { url, resource: thread.resource }
  const resource = thread.resource.state === 'loading' && lastReady.current?.url === url ? lastReady.current.resource : thread.resource
  const command = useCommand(`delete-comment:${record.id}`)
  function refresh() { setEditing(undefined); setRedacting(undefined); setCursor(undefined); thread.refresh(); onChanged?.() }
  async function remove(comment: RecordComment) {
    const result = await command.submit('/api/v1/commands/comment.delete', { subject: record.ref, id: comment.id, version: comment.version }, [{ ref: record.ref, version: record.version }])
    if (result) refresh()
  }
  return <section className="cr-card cr-section cr-record-comments" aria-label="Record comments">
    <h2>Comments</h2>
    <label className="cr-field">Search this thread<input type="search" value={search} onChange={event => { setSearch(event.target.value); setCursor(undefined) }} /></label>
    <ResourceState resource={resource} operation="record comments" retry={thread.refresh}>{page => <>
      <p className="cr-muted">{page.total.value}{page.total.kind === 'at_least' ? '+' : ''} {search ? 'matching ' : ''}{page.total.value === 1 ? 'comment' : 'comments'}</p>
      {page.items.length ? page.items.map(comment => <article className="cr-detail" key={comment.id}>
        <p><strong>{comment.authorLabel ?? comment.author.kind}</strong> · <Timestamp value={comment.createdAt} />{comment.edited && !comment.deletedAt && ' · edited'}</p>
        {editing === comment.id ? <CommentComposer record={record} comment={comment} onSaved={refresh} onCancel={() => setEditing(undefined)} /> : <>
          <p className="cr-comment-body">{comment.deletedAt ? 'Comment deleted' : comment.redacted ? 'Comment body redacted' : comment.body}</p>
          {!comment.deletedAt && comment.mentionLabels.length > 0 && <p className="cr-muted">{comment.mentionLabels.map(person => `@${person.name}`).join(', ')}</p>}
          {!comment.deletedAt && <div className="cr-actions">
            {comment.canEdit && <button className="cr-button cr-button--quiet" onClick={() => { setRedacting(undefined); setEditing(comment.id) }}>Edit comment</button>}
            {comment.canDelete && <button className="cr-button cr-button--quiet" onClick={() => void remove(comment)} disabled={!['idle', 'failed', 'committed', 'cancelled'].includes(command.result.state)}>Delete comment</button>}
            {comment.canRedact && redacting !== comment.id && <button className="cr-button cr-button--quiet" onClick={() => setRedacting(comment.id)}>Redact</button>}
          </div>}
          {redacting === comment.id && comment.canRedact && <RedactComment record={record} comment={comment} onSaved={refresh} onCancel={() => setRedacting(undefined)} />}
        </>}
      </article>) : <p className="cr-muted">{search ? 'No comments match your search.' : 'Start the conversation about this record.'}</p>}
      <div className="cr-actions">{cursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(undefined)}>First comments</button>}{page.nextCursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(page.nextCursor!)}>Next comments</button>}</div>
    </>}</ResourceState>
    <CommandFeedback {...command} />
    {resource.state === 'ready' && resource.data.canAdd && <CommentComposer record={record} onSaved={refresh} />}
  </section>
}

function RedactComment({ record, comment, onSaved, onCancel }: { record: RecordRow; comment: ThreadComment; onSaved: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  const command = useCommand(`redact-comment:${comment.id}`)
  const busy = !['idle', 'failed', 'committed', 'cancelled'].includes(command.result.state)
  async function redact() {
    const result = await command.submit('/api/v1/commands/comment.redact', { subject: record.ref, id: comment.id, version: comment.version, reason }, [{ ref: record.ref, version: record.version }])
    if (result) onSaved()
  }
  return <form className="cr-form" aria-label="Redact comment body" onSubmit={event => { event.preventDefault(); void redact() }}>
    <label className="cr-field">Redaction reason<input autoFocus required maxLength={280} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <CommandFeedback {...command} />
    <div className="cr-actions"><button className="cr-button" disabled={busy || !reason.trim()}>Redact comment body</button><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={onCancel}>Cancel redaction</button></div>
  </form>
}
