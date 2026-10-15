import { useEffect, useState } from 'react'
import { LAUNCH_APP_ID, launchEntities } from '../../apps/launch/contracts'
import type { CampaignCustomField } from '../../core/features/portfolio/ui/portfolio-types'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'

type Value = CampaignCustomField['value']
const shown = (value: Value) => value === null ? 'Not set' : Array.isArray(value) ? value.join(', ') || 'Not set' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value

/** Fill a campaign's custom fields defined in Settings (CAMP-008). */
export function CampaignCustomFields({ campaign, fields, onSaved }: { campaign: { id: string; version: number }; fields: CampaignCustomField[]; onSaved: () => void }) {
 const [editing, setEditing] = useState(false), [draft, setDraft] = useState<Record<string, Value>>({})
 const save = useCommand(`launch-campaign-custom:${campaign.id}`)
 useEffect(() => { if (save.result.state === 'committed') { setEditing(false); onSaved() } }, [save.result.state])
 if (!fields.length) return <p className="cr-muted">No custom fields are defined. Add them in <a className="cr-link" href="/app/settings">Settings</a>.</p>
 const value = (field: CampaignCustomField) => field.id in draft ? draft[field.id]! : field.value
 const set = (field: CampaignCustomField, next: Value) => setDraft(current => ({ ...current, [field.id]: next }))
 const input = (field: CampaignCustomField) => {
  const current = value(field)
  if (field.type === 'boolean') return <select value={current === null ? '' : String(current)} onChange={event => set(field, event.target.value === '' ? null : event.target.value === 'true')}><option value="">Not set</option><option value="true">Yes</option><option value="false">No</option></select>
  if (field.type === 'select') return <select value={typeof current === 'string' ? current : ''} onChange={event => set(field, event.target.value || null)}><option value="">Not set</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
  if (field.type === 'multi_select') return <fieldset className="launch-custom-choices">{field.options.map(option => { const chosen = Array.isArray(current) ? current : []; return <label className="cr-choice" key={option}><input type="checkbox" checked={chosen.includes(option)} onChange={event => set(field, event.target.checked ? [...chosen, option] : chosen.filter(item => item !== option))} />{option}</label> })}</fieldset>
  return <input type={field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={typeof current === 'string' ? current : ''} onChange={event => set(field, event.target.value.trim() ? event.target.value : null)} />
 }
 if (!editing) return <><dl className="portfolio-detail-facts launch-custom-values">{fields.map(field => <div key={field.id}><dt>{field.name}</dt><dd>{shown(field.value)}</dd></div>)}</dl><button type="button" className="cr-button cr-button--quiet" onClick={() => { setDraft({}); save.reset(); setEditing(true) }}>Edit custom fields</button></>
 const changes = Object.fromEntries(Object.entries(draft).filter(([id, next]) => JSON.stringify(fields.find(field => field.id === id)?.value ?? null) !== JSON.stringify(Array.isArray(next) && !next.length ? null : next)).map(([id, next]) => [id, Array.isArray(next) && !next.length ? null : next]))
 return <form className="cr-form" onSubmit={event => { event.preventDefault(); void save.submit('/api/v1/commands/launch.campaign.patch', { id: campaign.id, changes: { customFields: changes } }, [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: campaign.id }, version: campaign.version }]) }}>
  {fields.map(field => field.type === 'multi_select' ? <div className="cr-field" key={field.id}><span>{field.name}</span>{input(field)}</div> : <label className="cr-field" key={field.id}>{field.name}{input(field)}</label>)}
  <div className="cr-actions"><button className="cr-button" disabled={!Object.keys(changes).length || ['submitting', 'pending', 'unknown'].includes(save.result.state)}>Save custom fields</button><button type="button" className="cr-button cr-button--quiet" onClick={() => setEditing(false)}>Cancel</button></div>
  <CommandFeedback {...save} />
 </form>
}
