import { useEffect, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import { RECORD_SCHEMA_ENTITY_ID, type EntitySchema } from '../../domains/records/contracts'
import type { RecordTemplateButton, TemplateButtonSaveInput } from '../../domains/records/templates/buttons.server'
import { readApi, useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'

type Template = { id: string; name: string }
/** Configuration belongs in Settings; changes save as each field is completed. */
export function RecordTemplateButtonsPanel({ appId: suppliedAppId }: { appId?: string }) {
  const apps = useResource<Page<{ id: string; name: string }>>('/api/v1/apps?limit=200')
  const [chosen, setChosen] = useState('')
  const appId = suppliedAppId ?? chosen
  return <section className="cr-stack" aria-label="Record template buttons"><p>Configure buttons that create records from a saved template.</p><ResourceState resource={apps.resource} operation="bases" retry={apps.refresh}>{page => <>
    {!suppliedAppId && <label className="cr-field">Base<select value={chosen} onChange={event => setChosen(event.target.value)}><option value="">Choose a base</option>{page.items.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>}
    {appId && <TablePicker key={appId} appId={appId} />}
  </>}</ResourceState></section>
}
function TablePicker({ appId }: { appId: string }) {
  const tables = useResource<Page<EntitySchema>>(`/api/v1/apps/${appId}/entities?limit=200`)
  const [entityId, setEntityId] = useState('')
  return <ResourceState resource={tables.resource} operation="tables" retry={tables.refresh}>{page => <>
    <label className="cr-field">Table<select value={entityId} onChange={event => setEntityId(event.target.value)}><option value="">Choose a table</option>{page.items.map(table => <option key={table.id} value={table.id}>{table.label}</option>)}</select></label>
    {page.items.find(table => table.id === entityId) && <TableButtons key={entityId} schema={page.items.find(table => table.id === entityId)!} />}
  </>}</ResourceState>
}
function TableButtons({ schema }: { schema: EntitySchema }) {
  const base = `/api/v1/apps/${schema.appId}/entities/${schema.id}`
  const buttons = useResource<RecordTemplateButton[]>(`${base}/template-buttons`)
  const templates = useResource<Template[]>(`${base}/templates`)
  const [adding, setAdding] = useState(false)
  return <ResourceState resource={templates.resource} operation="record templates" retry={templates.refresh}>{options => <ResourceState resource={buttons.resource} operation="template buttons" retry={buttons.refresh}>{items => <div className="cr-stack">
    {items.map(button => <ButtonEditor key={button.id} schema={schema} templates={options} button={button} />)}
    {adding ? <ButtonEditor schema={schema} templates={options} onCreated={() => { setAdding(false); buttons.refresh() }} /> : <button type="button" className="cr-button cr-button--quiet" disabled={!options.length} onClick={() => setAdding(true)}>Add template button</button>}
    {!options.length && <p>Save a record as a template in this table first.</p>}
  </div>}</ResourceState>}</ResourceState>
}
function ButtonEditor({ schema, templates, button, onCreated }: { schema: EntitySchema; templates: Template[]; button?: RecordTemplateButton; onCreated?: () => void }) {
  const [name, setName] = useState(button?.name ?? '')
  const [templateId, setTemplateId] = useState(button?.templateId ?? '')
  const [confirmation, setConfirmation] = useState(button?.confirmation ?? true)
  const [readError, setReadError] = useState('')
  const command = useCommand<RecordTemplateButton>(`template-button-config:${schema.appId}:${schema.id}:${button?.id ?? 'new'}`)
  const busy = ['submitting', 'pending', 'unknown'].includes(command.result.state)
  const [reading, setReading] = useState(false)
  useEffect(() => { if (!button && command.result.state === 'committed') onCreated?.() }, [command.result.state])
  async function persist(next: Pick<TemplateButtonSaveInput, 'name' | 'templateId' | 'confirmation'>) {
    if (!next.name.trim() || !next.templateId || busy || reading) return
    setReadError(''); setReading(true)
    try {
      const current = (await readApi<EntitySchema>(`/api/v1/apps/${schema.appId}/entities/${schema.id}`)).data
      await command.submit('/api/v1/commands/record.template-button-save', { ...next, name: next.name.trim(), appId: schema.appId, entityId: schema.id, ...(button ? { id: button.id } : {}) }, [
        { ref: { appId: schema.appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: schema.id }, version: current.version },
      ])
    } catch (error) { setReadError(error instanceof Error ? error.message : 'Could not read the current table.') }
    finally { setReading(false) }
  }
  return <fieldset className="cr-card cr-stack" disabled={busy || reading} style={{ minWidth: 0, fontSize: 'max(13px, 1em)' }}><legend>{button ? 'Template button' : 'New template button'}</legend>
    <label className="cr-field">Button name<input value={name} maxLength={160} required onChange={event => setName(event.target.value)} onBlur={() => { if (name !== (button?.name ?? '')) void persist({ name, templateId, confirmation }) }} /></label>
    <label className="cr-field">Record template<select value={templateId} required onChange={event => { setTemplateId(event.target.value); void persist({ name, templateId: event.target.value, confirmation }) }}><option value="">Choose a template</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
    <label className="cr-choice"><input type="checkbox" checked={confirmation} onChange={event => { setConfirmation(event.target.checked); void persist({ name, templateId, confirmation: event.target.checked }) }} />Ask for confirmation before creating records</label>
    {!button && command.result.state === 'idle' && <p className="cr-muted">Enter a name and choose a template. Changes save automatically.</p>}
    {readError && <p role="alert">{readError}</p>}<CommandFeedback {...command} />
  </fieldset>
}
