import { DurationInput } from './duration-input'
import { durationText } from '../../domains/records/typed-values'
import { phoneText } from '../../domains/records/phone'
import { FileUpload } from '../evidence/file-upload'
import { LinkedRecord } from './linked-record'
import { MoneyInput } from './money-input'
import { RelationshipPicker } from './relationship-picker'
import { PersonPicker } from './person-picker'
import { StoreReferenceView } from './store-reference-view'
import { StoreChooser } from './store-chooser'
import type { Cell, CellValue, Money, Page, Ref, StoreReference } from '../../contracts/primitives'
import type { Field } from '../../domains/records/contracts'
import type { Member } from '../../domains/authority/contracts'
import { useEffect, useState } from 'react'
import { readApi } from '../shared/api'
import { money, Timestamp, useLocalTime, zoneName } from '../shared/presentation'
import './record-person.css'
import { decimal, format } from '../../domains/records/exact'

const toneByMeaning: Record<string, ChipTone> = { high: 'coral', blocked: 'coral', critical: 'coral', lost: 'coral', medium: 'butter', 'in progress': 'butter', qualified: 'butter', low: 'mint', ready: 'mint', done: 'mint', won: 'mint', planning: 'lilac', new: 'lilac' }
const toneCycle = ['lilac', 'butter', 'mint', 'coral'] as const
export type ChipTone = typeof toneCycle[number]
/** A select option's chip colour: by meaning where known, otherwise by option order. */
export function chipTone(field: Field, optionId: string): ChipTone {
  const index = field.options?.findIndex(option => option.id === optionId) ?? -1
  const label = index >= 0 ? field.options![index]!.label.trim().toLowerCase() : ''
  return toneByMeaning[label] ?? toneCycle[Math.max(index, 0) % toneCycle.length]!
}
/** A stored fraction shown as a percentage: the exact decimal moves two places and the stored value is not touched. */
export function percentText(value: string) { try { const exact = decimal(value); return `${format({ units: exact.units * 100n, scale: exact.scale })}%` } catch { return value } }
export function CellDisplay({ cell, field, appId, record }: { cell: Cell | undefined; field?: Field; appId?: string; record?: Ref & { fieldId: string } }) {
  if (!cell) return <span className="cr-muted">Not recorded</span>
  if (cell.state === 'redacted') return <span className="cr-muted">{cell.reason === 'erased' ? 'Erased' : 'Restricted'}</span>
  if (cell.state === 'unavailable') return <span title={cell.message} className="cr-error">Unavailable · {cell.message}</span>
  const value = cell.value
  if (value === null) return <span className="cr-muted">Not set</span>
  if (typeof value === 'boolean') return value ? <>Yes</> : <span className="cr-muted">No</span>
  if (field?.type === 'computed' && field.resultType === 'array' && Array.isArray(value)) {
    if (!value.length) return <span className="cr-muted">No values</span>
    const elementField = { ...field, resultType: field.resultElementType, resultElementType: undefined }
    return <>{(value as CellValue[]).map((item, index) => <span key={index}>{index ? ', ' : ''}<CellDisplay cell={{ state: 'value', value: item }} field={elementField} appId={appId} /></span>)}</>
  }
  if (field?.type === 'select' || field?.type === 'multi_select' || field?.type === 'computed' && field.resultType === 'select') { const ids = Array.isArray(value) ? value : [value]; return <>{ids.map((id, index) => <span className={`cr-record-chip cr-record-chip--${typeof id === 'string' ? chipTone(field, id) : 'lilac'}`} key={index}>{index ? <span className="cr-sr-only">, </span> : null}{field.options?.find(option => option.id === id)?.label ?? <span className="cr-error">Option unavailable</span>}</span>)}</> }
  if ((field?.type === 'person' || field?.type === 'computed' && field.resultType === 'person') && typeof value === 'string') return appId ? <PersonName appId={appId} id={value} /> : <span className="cr-error">Person lookup unavailable</span>
  if (typeof value === 'string' && (field?.type === 'phone' || field?.type === 'computed' && field.resultType === 'phone')) return <>{phoneText(value)}</>
  if (typeof value === 'string' && (field?.type === 'duration' || field?.type === 'computed' && field.resultType === 'duration')) return <>{durationText(value)}</>
  if (typeof value === 'string' && (field?.type === 'instant' || field?.type === 'computed' && field.resultType === 'instant')) return <Timestamp value={value} zone />
  if (field?.type === 'computed' && typeof value === 'string') return <span className="cr-derived">{value}</span>
  if (typeof value === 'string' && field?.numberFormat === 'percent') return <>{percentText(value)}</>
  if (typeof value === 'string') return <>{value}</>
  if ('minor' in value) return <>{money(value as Money).replace('USD ', '$')}</>
  const values = Array.isArray(value) ? value : [value]
  return <>{values.map((item, i) => <span key={i} className={typeof item === 'object' && item !== null && 'recordId' in item ? 'cr-record-link' : undefined}>{i > 0 ? ', ' : ''}{typeof item === 'object' && item !== null && 'recordId' in item ? <LinkedRecord reference={item} /> : typeof item === 'object' && item !== null && 'reference' in item ? <StoreReferenceView reference={(item as { reference: StoreReference }).reference} record={record} /> : typeof item === 'object' && item !== null && 'fileId' in item ? <a href={`/api/v1/files/${item.fileId}/content`}>Open attachment</a> : <CellDisplay cell={{ state: 'value', value: item }} field={field} appId={appId} />}</span>)}</>
}
/** The viewer's wall-clock minutes for a datetime-local input; `new Date` reads that offset-free form back in the same zone. */
function localInput(value: string) {
  const date = new Date(value), two = (part: number) => String(part).padStart(2, '0')
  return `${String(date.getFullYear()).padStart(4, '0')}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`
}
export function FieldInput({ appId, entityId, subject, field, value, onChange, error, inputId }: { appId: string; entityId: string; subject?: Ref; inputId?: string; field: Field; value: CellValue; onChange: (value: CellValue) => void; error?: string }) {
  const id = inputId ?? `field-${field.id}`
  // Until hydration the zone is unknown, so an instant is edited and named in UTC, as the server rendered it.
  const local = useLocalTime()
  const common = { id, required: field.required, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined }
  let input
  if (field.type === 'boolean') input = <div className="cr-boolean"><input {...common} type="checkbox" required={false} aria-required={field.required} aria-describedby={`${id}-state${error ? ` ${id}-error` : ''}`} checked={value === true} onChange={e => onChange(e.target.checked)} /><span id={`${id}-state`}>{value === null ? 'Not set' : value ? 'Yes' : 'No'}</span>{!field.required && value !== null && <button type="button" className="cr-button cr-button--quiet" onClick={() => onChange(null)}>Clear {field.label}</button>}</div>
  else if (field.type === 'select' || field.type === 'multi_select') input = <select {...common} multiple={field.type === 'multi_select'} value={field.type === 'multi_select' ? Array.isArray(value) ? value as string[] : [] : typeof value === 'string' ? value : ''} onChange={e => onChange(field.type === 'multi_select' ? Array.from(e.target.selectedOptions, item => item.value) : e.target.value || null)}>{field.type === 'select' && <option value="">Choose…</option>}{field.options?.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}</select>
  else if (field.type === 'money') input = <MoneyInput field={field} value={value} onChange={onChange} />
  else if (field.type === 'relation') input = <RelationshipPicker appId={appId} entityId={entityId} inputId={id} field={field} value={value} onChange={onChange} />
  else if (field.type === 'person') input = <PersonPicker appId={appId} field={field} value={value} onChange={onChange} />
  else if (field.type === 'attachment') input = <><CellDisplay cell={{ state: 'value', value }} appId={appId} record={subject ? { ...subject, fieldId: field.id } : undefined} />{subject && <StoreChooser appId={appId} entityId={entityId} fieldId={field.id} subject={subject} value={value} onChange={onChange} />}<FileUpload label={`Add ${field.label}`} fieldId={field.id} appId={appId} subject={subject} onUploaded={file => onChange([...(Array.isArray(value) ? value.filter(item => typeof item === 'object' && item !== null && ('fileId' in item || 'reference' in item)) : []), { fileId: file.id }])} /></>
  else if (field.type === 'duration') input = <DurationInput {...common} value={value} onChange={onChange} />
  else if (field.type === 'text') input = <textarea {...common} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} />
  else if (field.type === 'instant') input = <input {...common} type="datetime-local" value={typeof value === 'string' ? local ? localInput(value) : value.slice(0, 16) : ''} onChange={e => onChange(e.target.value ? new Date(local ? e.target.value : `${e.target.value}Z`).toISOString() : null)} />
  else input = <input {...common} type={field.type === 'rating' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'} min={field.type === 'rating' ? '1' : undefined} max={field.type === 'rating' ? field.validation?.max??'5' : undefined} step={field.type === 'rating' ? '1' : undefined} inputMode={field.type === 'number' ? 'decimal' : undefined} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || null)} />
  return <div className="cr-field"><label htmlFor={id}>{field.label}{field.type === 'instant' ? ` · ${local ? zoneName(typeof value === 'string' ? new Date(value) : new Date()) : 'UTC'}` : ''}{field.required ? ' *' : ''}</label>{input}{field.unique && <small>Each record must have a distinct value.</small>}{error && <p id={`${id}-error`} className="cr-error">{error}</p>}</div>
}

// A render batch shares the policy-checked people read rather than fetching once per cell.
// Only in-flight work is shared: a later mount always rechecks current access.
const peopleReads = new Map<string, Promise<Member[]>>()
function readPeople(appId: string) {
  let pending = peopleReads.get(appId)
  if (!pending) {
    pending = (async () => {
      const members: Member[] = []
      let cursor: string | null = null
      do {
        const { data }: { data: Page<Member> } = await readApi<Page<Member>>(`/api/v1/members?appId=${encodeURIComponent(appId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
        members.push(...data.items)
        cursor = data.nextCursor
      } while (cursor)
      return members
    })().finally(() => peopleReads.delete(appId))
    peopleReads.set(appId, pending)
  }
  return pending
}
function PersonName({ appId, id }: { appId: string; id: string }) {
  const [state, setState] = useState<{ appId: string; members?: Member[]; failed?: boolean }>({ appId })
  useEffect(() => {
    let current = true
    void readPeople(appId).then(members => { if (current) setState({ appId, members }) }, () => { if (current) setState({ appId, failed: true }) })
    return () => { current = false }
  }, [appId])
  if (state.appId !== appId || !state.members && !state.failed) return <span className="cr-muted">Reading person…</span>
  if (state.failed) return <span className="cr-error">Person unavailable</span>
  const member = state.members?.find(member => member.id === id)
  return member ? <span className="cr-record-person"><span className="cr-record-person__avatar" aria-hidden="true">{member.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span><span>{member.name}</span></span> : <span className="cr-muted">Person restricted or removed</span>
}
