import { useEffect, useState } from 'react'
import { LAUNCH_APP_ID, launchEntities } from '../../apps/launch/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, Empty, ResourceState } from '../shared/presentation'

type Field = { id: string; name: string; type: string; options: string[]; version: number; campaigns: number }
const types = { text: 'Text', number: 'Number', date: 'Date', boolean: 'Yes or no', select: 'Single choice', multi_select: 'Multiple choice', url: 'Link' } as const
type Type = keyof typeof types
const ref = (id: string) => ({ appId: LAUNCH_APP_ID, entityId: launchEntities.customField, recordId: id })
const optionList = (text: string) => text.split(/[\n,]/).map(option => option.trim()).filter(Boolean)

/** Campaign custom-field definitions (CAMP-008, SET-001). */
export function CustomFieldsPanel() {
 const fields = useResource<{ items: Field[] }>('/api/v1/launch/custom-fields')
 return <div className="cr-stack"><ResourceState resource={fields.resource} operation="custom fields" retry={fields.refresh}>{page => page.items.length ? <ul className="launch-settings-list">{page.items.map(field => <CustomFieldRow key={`${field.id}:${field.version}`} field={field} onChanged={fields.refresh} />)}</ul> : <Empty title="No custom fields yet">Add a field to record something every campaign should carry.</Empty>}</ResourceState><DefineField onSaved={fields.refresh} /></div>
}
function DefineField({ onSaved }: { onSaved: () => void }) {
 const [name, setName] = useState(''), [type, setType] = useState<Type>('text'), [options, setOptions] = useState('')
 const save = useCommand<{ id: string }>('launch-custom-field-create')
 useEffect(() => { if (save.result.state === 'committed') { setName(''); setOptions(''); onSaved() } }, [save.result.state])
 const choices = type === 'select' || type === 'multi_select'
 return <form className="cr-form launch-field-form" onSubmit={event => { event.preventDefault(); void save.submit('/api/v1/commands/launch.custom-field.save', { field: { name: name.trim(), type, ...(choices ? { options: optionList(options) } : {}) } }, []) }}>
  <h3>Add a field</h3>
  <label className="cr-field">Field name<input required value={name} onChange={event => setName(event.target.value)} /></label>
  <label className="cr-field">Type<select value={type} onChange={event => setType(event.target.value as Type)}>{(Object.keys(types) as Type[]).map(value => <option key={value} value={value}>{types[value]}</option>)}</select></label>
  {choices && <label className="cr-field">Choices<small>One per line or separated by commas.</small><textarea required value={options} onChange={event => setOptions(event.target.value)} /></label>}
  <button className="cr-button" disabled={!name.trim() || ['submitting', 'pending', 'unknown'].includes(save.result.state)}>Add field</button><CommandFeedback {...save} />
 </form>
}
function CustomFieldRow({ field, onChanged }: { field: Field; onChanged: () => void }) {
 const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view'), [name, setName] = useState(field.name), [options, setOptions] = useState(field.options.join('\n'))
 const save = useCommand(`launch-custom-field:${field.id}`), remove = useCommand(`launch-custom-field-delete:${field.id}`)
 useEffect(() => { if (save.result.state === 'committed' || remove.result.state === 'committed') onChanged() }, [save.result.state, remove.result.state])
 const choices = field.type === 'select' || field.type === 'multi_select'
 return <li className="launch-settings-item"><div className="launch-settings-summary"><strong>{field.name}</strong><span>{types[field.type as Type] ?? field.type}{choices ? ` · ${field.options.join(', ')}` : ''} · {field.campaigns} {field.campaigns === 1 ? 'campaign has' : 'campaigns have'} a value</span></div>
  {mode === 'view' && <div className="cr-actions"><button type="button" className="cr-button cr-button--quiet" onClick={() => setMode('edit')}>Edit</button><button type="button" className="cr-button cr-button--quiet" onClick={() => setMode('delete')}>Delete</button></div>}
  {mode === 'edit' && <form className="cr-form" onSubmit={event => { event.preventDefault(); void save.submit('/api/v1/commands/launch.custom-field.save', { id: field.id, field: { name: name.trim(), type: field.type, ...(choices ? { options: optionList(options) } : {}) } }, [{ ref: ref(field.id), version: field.version }]) }}>
   <label className="cr-field">Field name<input required value={name} onChange={event => setName(event.target.value)} /></label>
   {choices && <label className="cr-field">Choices<textarea required value={options} onChange={event => setOptions(event.target.value)} /></label>}
   <div className="cr-actions"><button className="cr-button">Save field</button><button type="button" className="cr-button cr-button--quiet" onClick={() => setMode('view')}>Cancel</button></div><CommandFeedback {...save} /></form>}
  {mode === 'delete' && <div className="cr-notice"><p>Deleting {field.name} also deletes the value stored on {field.campaigns} {field.campaigns === 1 ? 'campaign' : 'campaigns'}. This cannot be undone.</p><div className="cr-actions"><button type="button" className="cr-button cr-button--danger" onClick={() => void remove.submit('/api/v1/commands/launch.custom-field.delete', { id: field.id, confirmedAffectedCount: field.campaigns }, [{ ref: ref(field.id), version: field.version }])}>Delete field and {field.campaigns} values</button><button type="button" className="cr-button cr-button--quiet" onClick={() => setMode('view')}>Keep field</button></div><CommandFeedback {...remove} /></div>}
 </li>
}
