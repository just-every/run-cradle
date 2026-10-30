import { useState } from 'react'
import type { CellValue } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
import { RECORD_SCHEMA_ENTITY_ID } from '../../domains/records/contracts'
import type { UpdateButton } from '../../domains/records/buttons/update.server'
import { isButtonField } from '../../domains/records/buttons/fields'
import { FieldInput } from '../records/record-fields'
import { readApi, useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'

/** Uses the ordinary field controls; authoring stays beside template buttons. */
export function RecordUpdateButtonEditor({ schema, button, onCreated }: { schema: EntitySchema; button?: UpdateButton; onCreated?: () => void }) {
  const [name, setName] = useState(button?.name ?? '')
  const [fieldId, setFieldId] = useState(button?.fieldId ?? '')
  const [value, setValue] = useState<CellValue>(button?.value ?? null)
  const [confirmation, setConfirmation] = useState(button?.confirmation ?? true)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const command = useCommand<UpdateButton>(`update-button-config:${schema.appId}:${schema.id}:${button?.id ?? 'new'}`)
  const busy = reading || ['submitting', 'pending', 'unknown'].includes(command.result.state)
  const current = command.result.state === 'committed' ? command.result.value : button
  const field = schema.fields.find(item => item.id === fieldId && isButtonField(item))
  async function save() {
    if (!name.trim() || !field || busy) return
    setReading(true); setError('')
    try {
      const latest = (await readApi<EntitySchema>(`/api/v1/apps/${schema.appId}/entities/${schema.id}`)).data
      const saved = await command.submit('/api/v1/commands/record.template-button-save', {
        kind: 'update-field', appId: schema.appId, entityId: schema.id, name: name.trim(), fieldId, value, confirmation,
        ...(current ? { id: current.id, buttonVersion: current.version } : {}),
      }, [{ ref: { appId: schema.appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: schema.id }, version: latest.version }])
      if (saved && !button) onCreated?.()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read the current table.') }
    finally { setReading(false) }
  }
  if (button && !button.fieldId) return <p>Current base authorship and field access are required to edit {button.name}.</p>
  return <fieldset className="cr-card cr-stack" disabled={busy} style={{ minWidth: 0, fontSize: 'max(13px, 1em)' }}><legend>{button ? 'Update button' : 'New update button'}</legend>
    <label className="cr-field">Button name<input value={name} maxLength={160} required onChange={event => setName(event.target.value)} /></label>
    <p>Update one field on the record where this button is used.</p>
    <label className="cr-field">Field to update<select aria-label="Field to update" value={fieldId} onChange={event => { setFieldId(event.target.value); setValue(null) }}><option value="">Choose a field</option>{schema.fields.filter(isButtonField).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    {field && <FieldInput key={field.id} appId={schema.appId} entityId={schema.id} field={{ ...field, label: 'New value', help: undefined, unique: false }} value={value} onChange={setValue} inputId={`button-value-${button?.id ?? 'new'}`} />}
    <label className="cr-choice"><input type="checkbox" checked={confirmation} onChange={event => setConfirmation(event.target.checked)} />Ask for confirmation before updating the record</label>
    <button type="button" className="cr-button" disabled={busy || !name.trim() || !field} onClick={() => void save()}>Save update button</button>
    {error && <p role="alert">{error}</p>}<CommandFeedback {...command} />
  </fieldset>
}
