import type { CellValue } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
import type { RecordTemplate } from '../../domains/records/templates/contracts'
import { useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'

export function newRecordValues(schema: EntitySchema, presets: Record<string, CellValue> = {}): Record<string, CellValue> {
  return Object.fromEntries(schema.fields.filter(field => field.type !== 'computed' && !field.readOnly).map(field => [field.id, Object.hasOwn(presets, field.id) ? presets[field.id]! : field.defaultValue !== undefined ? field.defaultValue : field.type === 'boolean' ? false : null]))
}

export function RecordTemplatePicker({ schema, selected, onChange, disabled = false }: { schema: EntitySchema; selected: string; onChange: (template: RecordTemplate | null) => void; disabled?: boolean }) {
  const templates = useResource<RecordTemplate[]>(`/api/v1/apps/${schema.appId}/entities/${schema.id}/templates`)
  return <div className="cr-record-template-picker"><ResourceState resource={templates.resource} operation="record templates" retry={templates.refresh}>{items => {
    const template = items.find(item => item.id === selected)
    return <><label className="cr-field">Record template<select value={selected} disabled={disabled} onChange={event => onChange(items.find(item => item.id === event.target.value) ?? null)}><option value="">Blank record</option>{items.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{template && <p className="cr-muted" role="status">Preset values are ready to edit.{template.children.length ? ` Saving creates ${template.children.length} child ${template.children.length === 1 ? 'record' : 'records'}.` : ''}</p>}</>
  }}</ResourceState></div>
}
