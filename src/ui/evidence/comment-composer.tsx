import { useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { RecordRow } from '../../domains/records/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
export type RecordComment = { id: string; version: number; body: string | null; mentions: string[]; mentionLabels: {id: string; name: string}[]; authorLabel: string | null; author: { id: string; kind: string }; createdAt: string; updatedAt: string; deletedAt: string | null; edited: boolean; canEdit: boolean; canDelete: boolean }

export function CommentComposer({ record, comment, onSaved, onCancel }: { record: RecordRow; comment?: RecordComment; onSaved: () => void; onCancel?: () => void }) {
  const [body, setBody] = useState(comment?.body ?? '')
  const [mentions, setMentions] = useState<string[]>(comment?.mentions ?? [])
  const [search, setSearch] = useState('')
  const query = new URLSearchParams({ ...record.ref, q: search })
  const people = useResource<Page<{ id: string; name: string }>>(`/api/v1/comments/mentions?${query}`)
  const command = useCommand(`comment:${record.id}:${comment?.id ?? 'new'}`)
  const busy = !['idle', 'failed', 'committed', 'cancelled'].includes(command.result.state)
  async function save() {
    const saved = await command.submit(`/api/v1/commands/comment.${comment ? 'edit' : 'add'}`, { subject: record.ref, body, mentions, ...(comment ? { id: comment.id, version: comment.version } : {}) }, [{ ref: record.ref, version: record.version }])
    if (saved) { setBody(''); setMentions([]); onSaved() }
  }
  return <form className="cr-form" onSubmit={event => { event.preventDefault(); void save() }}><label className="cr-field">{comment ? 'Edit comment' : 'Add a comment'}<textarea required maxLength={10000} value={body} onChange={event => setBody(event.target.value)} /></label>
    <details className="cr-detail"><summary>@ Mention people{mentions.length ? ` (${mentions.length})` : ''}</summary><label className="cr-field">Find people to mention<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><ResourceState resource={people.resource} operation="people who can read this record" retry={people.refresh}>{page => <fieldset><legend>Notify people who can read this record</legend>{page.items.length ? page.items.map(person => <label className="cr-choice" key={person.id}><input type="checkbox" checked={mentions.includes(person.id)} onChange={event => setMentions(ids => event.target.checked ? [...ids, person.id] : ids.filter(id => id !== person.id))} />@{person.name}</label>) : <p className="cr-muted">No matching people can read this record.</p>}</fieldset>}</ResourceState></details>
    <CommandFeedback {...command} /><div className="cr-actions"><button className="cr-button" disabled={busy || !body.trim()}>{comment ? 'Save comment' : 'Post comment'}</button>{onCancel && <button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={onCancel}>Cancel comment edit</button>}</div></form>
}
