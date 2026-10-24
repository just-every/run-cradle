import type { Page } from '../../../contracts/primitives'
import type { Field, View } from '../../../domains/records/contracts'
import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import type { Resource } from '../../shared/api'
import { ResourceState } from '../../shared/presentation'

export type PickerViews = { resource: Resource<Page<View>>; refresh: () => void }
const scalarTypes = ['email','rating','duration','phone','text', 'url', 'number', 'date', 'instant', 'money', 'boolean', 'select', 'person']
const valueType = (field: Field) => field.type === 'computed' ? field.resultType : field.type
export function LinkPickerSettings({ field, target, savedViews, onChange }: { field: Field; target?: SchemaDraft['tables'][number]; savedViews?: PickerViews; onChange: (field: Field) => void }) {
 const settings = field.linkPicker
 const primaryId=target?.primaryFieldId??target?.fields[0]?.id
 const searchable = target?.fields.filter(item => ['email','phone','text', 'url'].includes(valueType(item) ?? '')) ?? []
 const displayable = target?.fields.filter(item => scalarTypes.includes(valueType(item) ?? '')) ?? []
 function customize(enabled: boolean) {
  const next = { ...field }
  if (enabled) next.linkPicker = { searchFieldIds: searchable.filter(item => item.id === (target?.primaryFieldId ?? target?.fields[0]?.id)).map(item => item.id), displayFieldIds: displayable.slice(0, 4).map(item => item.id) }
  else delete next.linkPicker
  onChange(next)
 }
 function toggle(key: 'searchFieldIds' | 'displayFieldIds', id: string, enabled: boolean) {
  if (settings) onChange({ ...field, linkPicker: { ...settings, [key]: enabled ? [...settings[key], id] : settings[key].filter(value => value !== id) } })
 }
 return <details className="cr-detail"><summary>Linked-record picker settings</summary>
  <p className="cr-muted">Choose searchable text and URL fields, context shown beside each record, and an optional shared view whose current filters and order limit candidates.</p>
  <label className="cr-choice"><input type="checkbox" disabled={!target} checked={!!settings} onChange={event => customize(event.target.checked)} />Customize linked-record picker</label>
  {!settings && <p>Uses the default primary-field search and record context. Operators can see the effective settings in the picker.</p>}
  {settings && <div className="cr-field-extra">
   <p className="cr-muted">The readable primary text field is always searched. Choose additional search fields below.</p><fieldset><legend>Search fields</legend>{searchable.map(item => <label className="cr-choice" key={item.id}><input type="checkbox" disabled={item.id===primaryId} checked={item.id===primaryId||settings.searchFieldIds.includes(item.id)} onChange={event => toggle('searchFieldIds', item.id, event.target.checked)} />{item.label}</label>)}{!searchable.length && <p>No text or URL fields are available to search.</p>}</fieldset>
   <fieldset><legend>Display and context fields</legend>{displayable.map(item => <label className="cr-choice" key={item.id}><input type="checkbox" checked={settings.displayFieldIds.includes(item.id)} onChange={event => toggle('displayFieldIds', item.id, event.target.checked)} />{item.label}</label>)}</fieldset>
   <p className="cr-muted">Only existing shared views of the linked table can be configured. Create and share a saved view after adopting this base, then return here.</p>
   {savedViews ? <ResourceState resource={savedViews.resource} operation="shared picker views" retry={savedViews.refresh}>{data => {
    const views = data.items.filter(view => view.entityId === target?.id && view.visibility === 'app')
    const unavailable = settings.viewId && !views.some(view => view.id === settings.viewId)
    return <><label className="cr-field">Limit to shared view<select aria-label="Limit to shared view" value={settings.viewId ?? ''} onChange={event => onChange({ ...field, linkPicker: { ...settings, viewId: event.target.value || undefined } })}><option value="">All permitted linked records</option>{unavailable && <option disabled value={settings.viewId}>Selected view unavailable</option>}{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>{unavailable && <p className="cr-error" role="alert">The selected view is unavailable or no longer shared. Choose another view or remove this limit before adopting.</p>}{!views.length && <p>No shared views are available for this linked table.</p>}</>
   }}</ResourceState> : <p>Shared views become configurable after this base is adopted.</p>}
  </div>}
 </details>
}
