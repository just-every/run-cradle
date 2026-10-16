import { useEffect, useState } from 'react'
import { campaignLifecycle } from '../../apps/launch/lifecycle'
import { LAUNCH_APP_ID, launchEntities } from '../../apps/launch/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
import { LaunchOwnerPicker } from './owner-picker'

export type BulkTarget = { id: string; version: number }
type CustomField = { id: string; name: string; type: string; options: string[] }
type Applied = { bulkId: string; count: number; undoExpiresAt: string }
const kinds = { ownerId: 'Owner', phase: 'Phase', status: 'Status', 'tag-add': 'Add a tag', 'tag-remove': 'Remove a tag', 'custom-field': 'Custom field', archive: 'Archive' } as const
type Kind = keyof typeof kinds

/** One change applied to every selected campaign or none, undoable once within an hour (CAMP-013). */
export function BulkCampaigns({ selected, onClear, onChanged }: { selected: BulkTarget[]; onClear: () => void; onChanged: () => void }) {
 const [kind, setKind] = useState<Kind>('ownerId'), [value, setValue] = useState(''), [fieldId, setFieldId] = useState('')
 const custom = useResource<{ items: CustomField[] }>(kind === 'custom-field' ? '/api/v1/launch/custom-fields' : null)
 const apply = useCommand<Applied>('launch-bulk-apply'), undo = useCommand<{ restored: number }>('launch-bulk-undo')
 const [last, setLast] = useState<Applied | null>(null)
 useEffect(() => { if (apply.result.state === 'committed') { setLast(apply.result.value); onChanged() } }, [apply.result.state])
 useEffect(() => { if (undo.result.state === 'committed') { setLast(null); onChanged() } }, [undo.result.state])
 const field = custom.resource.state === 'ready' ? custom.resource.data.items.find(item => item.id === fieldId) : undefined
 const change = kind === 'archive' ? { kind } : kind === 'tag-add' || kind === 'tag-remove' ? { kind, value: value.trim() } : kind === 'custom-field' ? { kind, fieldId, value: field?.type === 'boolean' ? value === 'true' : field?.type === 'multi_select' ? value.split('|').map(part => part.trim()).filter(Boolean) : value.trim() || null } : { kind: 'field', field: kind, value }
 const ready = kind === 'archive' || (kind === 'custom-field' ? !!field : !!value.trim())
 const busy = [apply.result.state, undo.result.state].some(state => ['submitting', 'pending', 'unknown'].includes(state))
 const submit = () => { apply.reset(); undo.reset(); void apply.submit('/api/v1/commands/launch.bulk.apply', { recordType: 'Campaign', ids: selected.map(item => item.id), change }, selected.map(item => ({ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: item.id }, version: item.version }))) }
 if (!selected.length && !last && apply.result.state !== 'failed' && undo.result.state === 'idle') return null
 return <section className="cr-card launch-bulk" aria-label="Bulk edit selected campaigns">
  {selected.length > 0 && <form className="launch-bulk-form" onSubmit={event => { event.preventDefault(); submit() }}>
   <p className="launch-bulk-count"><strong>{selected.length}</strong> selected <button type="button" className="cr-link-button" onClick={onClear}>Clear</button></p>
   <label className="cr-field">Change<select value={kind} onChange={event => { setKind(event.target.value as Kind); setValue(''); setFieldId('') }}>{(Object.keys(kinds) as Kind[]).map(item => <option key={item} value={item}>{kinds[item]}</option>)}</select></label>
   {kind === 'ownerId' && <div className="cr-field"><label htmlFor="bulk-owner">New owner</label><LaunchOwnerPicker id="bulk-owner" value={value} onChange={setValue} /></div>}
   {(kind === 'phase' || kind === 'status') && <label className="cr-field">New {kind}<select required value={value} onChange={event => setValue(event.target.value)}><option value="">Choose</option>{(kind === 'phase' ? campaignLifecycle.phases : campaignLifecycle.statuses).map(item => <option key={item}>{item}</option>)}</select></label>}
   {(kind === 'tag-add' || kind === 'tag-remove') && <label className="cr-field">Tag<input required value={value} onChange={event => setValue(event.target.value)} /></label>}
   {kind === 'custom-field' && <><label className="cr-field">Field<select required value={fieldId} onChange={event => { setFieldId(event.target.value); setValue('') }}><option value="">Choose a field</option>{custom.resource.state === 'ready' && custom.resource.data.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {field && (field.type === 'select' || field.type === 'boolean' ? <label className="cr-field">Value<select value={value} onChange={event => setValue(event.target.value)}><option value="">Clear the value</option>{(field.type === 'boolean' ? ['true', 'false'] : field.options).map(option => <option key={option}>{option}</option>)}</select></label> : <label className="cr-field">Value{field.type === 'multi_select' ? ' (separate with |)' : ''}<input type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'} value={value} onChange={event => setValue(event.target.value)} /></label>)}</>}
   <button className="cr-button" disabled={!ready || busy}>{kind === 'archive' ? `Archive ${selected.length}` : `Apply to ${selected.length}`}</button>
  </form>}
  {last && <div className="cr-notice cr-notice--committed launch-bulk-done" role="status"><span>Changed {last.count} campaigns. You can undo this once until {new Date(last.undoExpiresAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.</span><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={() => void undo.submit('/api/v1/commands/launch.bulk.undo', { bulkId: last.bulkId }, [])}>Undo bulk change</button></div>}
  {apply.result.state === 'failed' && <CommandFeedback {...apply} />}
  {undo.result.state === 'committed' ? <p className="cr-notice cr-notice--committed" role="status">Restored {undo.result.value.restored} campaigns to their earlier values.</p> : <CommandFeedback {...undo} />}
 </section>
}
