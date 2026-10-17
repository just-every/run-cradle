import { FileUpload } from '../evidence/file-upload'
import { LinkedRecord } from './linked-record'
import { MoneyInput } from './money-input'
import { RelationshipPicker } from './relationship-picker'
import { PersonPicker } from './person-picker'
import type { Cell, CellValue, ScalarCellValue, Money, Page, Ref } from '../../contracts/primitives'
import type { Field } from '../../domains/records/contracts'
import type { Member } from '../../domains/authority/contracts'
import { useResource } from '../shared/api'
import { money } from '../shared/presentation'

const toneByMeaning: Record<string, ChipTone> = { high: 'coral', blocked: 'coral', critical: 'coral', lost: 'coral', medium: 'butter', 'in progress': 'butter', qualified: 'butter', low: 'mint', ready: 'mint', done: 'mint', won: 'mint', planning: 'lilac', new: 'lilac' }
const toneCycle = ['lilac', 'butter', 'mint', 'coral'] as const
export type ChipTone = typeof toneCycle[number]
/** A select option's chip colour: by meaning where known, otherwise by option order. */
export function chipTone(field: Field, optionId: string): ChipTone {
  const index = field.options?.findIndex(option => option.id === optionId) ?? -1
  const label = index >= 0 ? field.options![index]!.label.trim().toLowerCase() : ''
  return toneByMeaning[label] ?? toneCycle[Math.max(index, 0) % toneCycle.length]!
}
export function CellDisplay({ cell, field, appId }: { cell: Cell | undefined; field?: Field; appId?: string }) {
  if (!cell) return <span className="cr-muted">Not recorded</span>
  if (cell.state === 'redacted') return <span className="cr-muted">{cell.reason === 'erased' ? 'Erased' : 'Restricted'}</span>
  if (cell.state === 'unavailable') return <span title={cell.message} className="cr-error">Unavailable · {cell.message}</span>
  const value = cell.value
  if (value === null) return <span className="cr-muted">Not set</span>
  if (typeof value === 'boolean') return value ? <>Yes</> : <span className="cr-muted">No</span>
  if (field?.type === 'computed' && field.resultType === 'array' && Array.isArray(value)) {
    if (!value.length) return <span className="cr-muted">No values</span>
    const elementField = { ...field, resultType: field.resultElementType, resultElementType: undefined }
    return <>{(value as ScalarCellValue[]).map((item, index) => <span key={index}>{index ? ', ' : ''}<CellDisplay cell={{ state: 'value', value: item }} field={elementField} appId={appId} /></span>)}</>
  }
  if (field?.type === 'select' || field?.type === 'multi_select' || field?.type === 'computed' && field.resultType === 'select') { const ids = Array.isArray(value) ? value : [value]; return <>{ids.map((id, index) => <span className={`cr-record-chip cr-record-chip--${typeof id === 'string' ? chipTone(field, id) : 'lilac'}`} key={index}>{index ? <span className="cr-sr-only">, </span> : null}{field.options?.find(option => option.id === id)?.label ?? <span className="cr-error">Option unavailable</span>}</span>)}</> }
  if ((field?.type === 'person' || field?.type === 'computed' && field.resultType === 'person') && typeof value === 'string') return appId ? <PersonName appId={appId} id={value} /> : <span className="cr-error">Person lookup unavailable</span>
  if (field?.type === 'computed' && typeof value === 'string') return <span className="cr-derived">{value}</span>
  if (typeof value === 'string') return <>{value}</>
  if ('minor' in value) return <>{money(value as Money).replace('USD ', '$')}</>
  const values = Array.isArray(value) ? value : [value]
  return <>{values.map((item, i) => <span key={i}>{i > 0 ? ', ' : ''}{typeof item === 'object' && item !== null && 'recordId' in item ? <LinkedRecord reference={item} /> : typeof item === 'object' && item !== null && 'fileId' in item ? <a href={`/api/v1/files/${item.fileId}/content`}>Open attachment</a> : <CellDisplay cell={{ state: 'value', value: item }} field={field} appId={appId} />}</span>)}</>
}
export function FieldInput({ appId, subject, field, value, onChange, error }: { appId: string; subject?: Ref; field: Field; value: CellValue; onChange: (value: CellValue) => void; error?: string }) {
  const id = `field-${field.id}`
  const common = { id, required: field.required, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined }
  let input
  if (field.type === 'boolean') input = <div className="cr-boolean"><input {...common} type="checkbox" required={false} aria-required={field.required} aria-describedby={`${id}-state${error ? ` ${id}-error` : ''}`} checked={value === true} onChange={e => onChange(e.target.checked)} /><span id={`${id}-state`}>{value === null ? 'Not set' : value ? 'Yes' : 'No'}</span>{!field.required && value !== null && <button type="button" className="cr-button cr-button--quiet" onClick={() => onChange(null)}>Clear {field.label}</button>}</div>
  else if (field.type === 'select' || field.type === 'multi_select') input = <select {...common} multiple={field.type === 'multi_select'} value={field.type === 'multi_select' ? Array.isArray(value) ? value as string[] : [] : typeof value === 'string' ? value : ''} onChange={e => onChange(field.type === 'multi_select' ? Array.from(e.target.selectedOptions, item => item.value) : e.target.value || null)}>{field.type === 'select' && <option value="">Choose…</option>}{field.options?.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}</select>
  else if (field.type === 'money') input = <MoneyInput field={field} value={value} onChange={onChange} />
  else if (field.type === 'relation') input = <RelationshipPicker field={field} value={value} onChange={onChange} />
  else if (field.type === 'person') input = <PersonPicker appId={appId} field={field} value={value} onChange={onChange} />
  else if (field.type === 'attachment') input = <><CellDisplay cell={{ state: 'value', value }} /><FileUpload label={`Add ${field.label}`} fieldId={field.id} appId={appId} subject={subject} onUploaded={file => onChange([...(Array.isArray(value) ? value.filter(item => typeof item === 'object' && item !== null && 'fileId' in item) : []), { fileId: file.id }])} /></>
  else if (field.type === 'text') input = <textarea {...common} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} />
  else input = <input {...common} type={field.type === 'date' ? 'date' : field.type === 'instant' ? 'datetime-local' : field.type === 'url' ? 'url' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={typeof value === 'string' ? field.type === 'instant' ? value.slice(0, 16) : value : ''} onChange={e => onChange(e.target.value ? field.type === 'instant' ? new Date(`${e.target.value}Z`).toISOString() : e.target.value : null)} />
  return <div className="cr-field"><label htmlFor={id}>{field.label}{field.required ? ' *' : ''}{field.type === 'instant' ? ' (UTC)' : ''}</label>{input}{field.unique && <small>Each record must have a distinct value.</small>}{error && <p id={`${id}-error`} className="cr-error">{error}</p>}</div>
}

function PersonName({ appId, id }: { appId: string; id: string }) {
  const members = useResource<Page<Member>>(`/api/v1/members?appId=${encodeURIComponent(appId)}`)
  if (members.resource.state === 'loading') return <span className="cr-muted">Loading person…</span>
  if (members.resource.state !== 'ready') return <span className="cr-error">Person unavailable</span>
  const member = members.resource.data.items.find(member => member.id === id)
  return member ? <>{member.name}</> : <span className="cr-muted">Person restricted or removed</span>
}
