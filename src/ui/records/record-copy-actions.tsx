import { useState } from 'react'
import { RECORD_SCHEMA_ENTITY_ID, type EntitySchema, type RecordRow } from '../../domains/records/contracts'
import type { RecordTemplate } from '../../domains/records/templates/contracts'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'

export function RecordCopyActions({ schema, record }: { schema: EntitySchema; record: RecordRow }) {
  const [mode, setMode] = useState<'duplicate' | 'template' | null>(null)
  return <div className="cr-record-copy-actions">{mode ? <RecordCopyEditor key={mode} schema={schema} record={record} mode={mode} onClose={() => setMode(null)} /> : <div className="cr-actions"><button className="cr-button cr-button--quiet" onClick={() => setMode('duplicate')}>Duplicate record</button><button className="cr-button cr-button--quiet" onClick={() => setMode('template')}>Save as template</button></div>}</div>
}

function RecordCopyEditor({ schema, record, mode, onClose }: { schema: EntitySchema; record: RecordRow; mode: 'duplicate' | 'template'; onClose: () => void }) {
  const savingTemplate = mode === 'template'
  const [name, setName] = useState(''), [includeLinks, setIncludeLinks] = useState(false), [includeAttachments, setIncludeAttachments] = useState(false), [includeChildren, setIncludeChildren] = useState(false)
  const command = useCommand<RecordRow | RecordTemplate>(`record-copy:${record.id}:${mode}`)
  const busy = !['idle', 'failed'].includes(command.result.state)
  return <form aria-label={savingTemplate ? 'Save record template' : 'Duplicate record'} className="cr-form cr-record-copy-editor" onSubmit={event => {
    event.preventDefault()
    void command.submit(`/api/v1/commands/record.${savingTemplate ? 'template-save' : 'duplicate'}`, { ref: record.ref, includeLinks, includeAttachments, ...(savingTemplate ? { name: name.trim(), includeChildren } : {}) }, [{ ref: record.ref, version: record.version }, { ref: { appId: schema.appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: schema.id }, version: schema.version }])
  }}><h2>{savingTemplate ? 'Save as template' : 'Duplicate record'}</h2>{savingTemplate && <label className="cr-field">Template name<input required maxLength={160} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>}<fieldset className="cr-form-fields cr-record-copy-options" disabled={busy}><legend>Include in {savingTemplate ? 'template' : 'copy'}</legend><label className="cr-choice"><input type="checkbox" checked={includeLinks} onChange={event => setIncludeLinks(event.target.checked)} />Linked records</label><label className="cr-choice"><input type="checkbox" checked={includeAttachments} onChange={event => setIncludeAttachments(event.target.checked)} />Attachments</label>{savingTemplate && <label className="cr-choice"><input type="checkbox" checked={includeChildren} onChange={event => setIncludeChildren(event.target.checked)} />Child records</label>}</fieldset><CommandFeedback {...command} />{command.result.state === 'committed' ? <div className="cr-actions">{savingTemplate ? <p role="status">Template saved. Choose it when creating a record or submitting a form.</p> : <a className="cr-button" href={`/app/records/${schema.appId}/${schema.id}/${command.result.value.id}`}>Open duplicate</a>}<button type="button" className="cr-button cr-button--quiet" onClick={onClose}>Close</button></div> : <div className="cr-actions"><button className="cr-button" disabled={busy || savingTemplate && !name.trim()}>{savingTemplate ? 'Save template' : 'Create duplicate'}</button><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={onClose}>Cancel</button></div>}</form>
}
