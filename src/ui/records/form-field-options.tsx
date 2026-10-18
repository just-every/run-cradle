import type { EntitySchema, Form } from '../../domains/records/contracts'
import { ConditionEditor } from './schema/table-rules'

export function FormFieldOptions({ schema, fields, index, onChange }: { schema: EntitySchema; fields: Form['fields']; index: number; onChange: (fields: Form['fields']) => void }) {
  const selected = fields[index]!, field = schema.fields.find(f => f.id === selected.fieldId)!
  const earlier = fields.slice(0, index).flatMap(f => schema.fields.filter(s => s.id === f.fieldId))
  const update = (changes: Partial<typeof selected>) => onChange(fields.map((f, i) => i === index ? { ...f, ...changes } : f))
  const move = (offset: number) => { const next = [...fields]; [next[index], next[index + offset]] = [next[index + offset]!, next[index]!]; onChange(next) }
  return <fieldset className="cr-field-tile"><legend>{selected.label}</legend>
    <label className="cr-field">Label<input required value={selected.label} onChange={e => update({ label: e.target.value })} /></label>
    <label className="cr-field">Help text<input value={selected.help} onChange={e => update({ help: e.target.value })} /></label>
    <label className="cr-field">Page<input value={selected.page ?? ''} placeholder="First page" onChange={e => update({ page: e.target.value || undefined })} /></label>
    <label className="cr-field">Section<input value={selected.section ?? ''} onChange={e => update({ section: e.target.value || undefined })} /></label>
    <label className="cr-choice"><input type="checkbox" checked={selected.required} disabled={field.required} onChange={e => update({ required: e.target.checked })} />Required</label>
    <label className="cr-choice"><input type="checkbox" checked={!!selected.showWhen} disabled={!earlier.length || field.required || field.defaultValue !== undefined} onChange={e => update({ showWhen: e.target.checked ? { kind: 'condition', fieldId: earlier[0]!.id, op: 'not_empty' } : undefined })} />Show only when an earlier answer matches</label>
    {selected.showWhen && <ConditionEditor label="Show when" condition={selected.showWhen} fields={earlier} appId={schema.appId} entityId={schema.id} onChange={showWhen => update({ showWhen })} />}
    <div className="cr-actions"><button type="button" className="cr-button cr-button--quiet" disabled={!index} onClick={() => move(-1)}>Move up</button><button type="button" className="cr-button cr-button--quiet" disabled={index === fields.length - 1} onClick={() => move(1)}>Move down</button><button type="button" className="cr-button cr-button--quiet" disabled={field.required} onClick={() => onChange(fields.filter((_, i) => i !== index))}>Remove field</button></div>
  </fieldset>
}
