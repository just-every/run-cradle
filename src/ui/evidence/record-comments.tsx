import { useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { RecordRow } from '../../domains/records/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState, Timestamp } from '../shared/presentation'
import { CommentComposer, type RecordComment } from './comment-composer'

export function RecordComments({ record }: { record: RecordRow }) {
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const query = new URLSearchParams({ ...record.ref, q: search, limit: '30', ...(cursor ? { cursor } : {}) })
  const thread = useResource<Page<RecordComment> & {canAdd: boolean}>(`/api/v1/comments?${query}`)
  const command = useCommand(`delete-comment:${record.id}`)
  function refresh() { setEditing(undefined); setCursor(undefined); thread.refresh() }
  async function remove(comment: RecordComment) {
    const result = await command.submit('/api/v1/commands/comment.delete', { subject: record.ref, id: comment.id, version: comment.version }, [{ ref: record.ref, version: record.version }])
    if (result) refresh()
  }
  return <section className="cr-card cr-section cr-record-comments" aria-label="Record comments"><h2>Comments</h2><label className="cr-field">Search this thread<input type="search" value={search} onChange={event => { setSearch(event.target.value); setCursor(undefined) }} /></label><ResourceState resource={thread.resource} operation="record comments" retry={thread.refresh}>{page => <><p className="cr-muted">{page.total.value}{page.total.kind === 'at_least' ? '+' : ''} {search ? 'matching ' : ''}comments</p>{page.items.length ? page.items.map(comment => <article className="cr-detail" key={comment.id}><p><strong>{comment.authorLabel ?? comment.author.kind}</strong> · <Timestamp value={comment.createdAt} />{comment.edited && !comment.deletedAt && ' · edited'}</p>{editing === comment.id ? <CommentComposer record={record} comment={comment} onSaved={refresh} onCancel={() => setEditing(undefined)} /> : <><p className="cr-comment-body">{comment.deletedAt ? 'Comment deleted' : comment.body}</p>{!comment.deletedAt && comment.mentionLabels.length>0 && <p className="cr-muted">{comment.mentionLabels.map(person=>`@${person.name}`).join(', ')}</p>}{!comment.deletedAt && <div className="cr-actions">{comment.canEdit && <button className="cr-button cr-button--quiet" onClick={() => setEditing(comment.id)}>Edit comment</button>}{comment.canDelete && <button className="cr-button cr-button--quiet" onClick={() => void remove(comment)} disabled={!['idle', 'failed', 'committed', 'cancelled'].includes(command.result.state)}>Delete comment</button>}</div>}</>}</article>) : <p className="cr-muted">{search ? 'No comments match your search.' : 'Start the conversation about this record.'}</p>}<div className="cr-actions">{cursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(undefined)}>First comments</button>}{page.nextCursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(page.nextCursor!)}>Next comments</button>}</div></>}</ResourceState><CommandFeedback {...command} />{thread.resource.state === 'ready' && thread.resource.data.canAdd && <CommentComposer record={record} onSaved={refresh} />}</section>
}
