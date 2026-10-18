import type { EntitySchema, TimelineZoom } from '../../domains/records/contracts'

export function TimelineSettings({ schema, dependencyField, setDependencyField, zoom, setZoom, groups, setGroups }: {
  schema: EntitySchema; dependencyField: string; setDependencyField: (id: string) => void; zoom: TimelineZoom; setZoom: (zoom: TimelineZoom) => void; groups: string[]; setGroups: (ids: string[]) => void;
}) {
  return <fieldset className="cr-form"><legend>Timeline and Gantt</legend>
    <label className="cr-field">Predecessor links<select aria-label="Predecessor links" value={dependencyField} onChange={event => setDependencyField(event.target.value)}><option value="">No dependencies</option>{schema.fields.filter(field => field.type === 'relation' && field.relation?.ownerAppId === schema.appId && field.relation.entityId === schema.id).map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select><small>Each linked record must finish before this record starts.</small></label>
    <label className="cr-field">Default timeline zoom<select aria-label="Default timeline zoom" value={zoom} onChange={event => setZoom(event.target.value as TimelineZoom)}>{(['day','week','month','quarter','year'] as const).map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label>
    <label className="cr-field">Group timeline by<select aria-label="Group timeline by" value={groups[0] ?? ''} onChange={event => setGroups(event.target.value ? [event.target.value] : [])}><option value="">No grouping</option>{schema.fields.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>
  </fieldset>
}
