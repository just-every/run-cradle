import { useEffect, useState } from 'react'
import type { CellValue, Page, Ref } from '../../contracts/primitives'
import type { EntitySchema, Field, RecordRow } from '../../domains/records/contracts'
import { readApi } from '../shared/api'
import { recordLabel } from './record-label'
export function RelationshipPicker({ field, value, onChange }: { field: Field; value: CellValue; onChange: (value: CellValue) => void }) {
  const [options, setOptions] = useState<Page<RecordRow> | null>(null)
  const [schema, setSchema] = useState<EntitySchema | null>(null)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState<string | undefined>()
  const relation = field.relation
  useEffect(() => {
    const abort = new AbortController(); setOptions(null); setSchema(null); setError('')
    if (!relation) { setError('This relationship has no target schema.'); return }
    const base = `/api/v1/apps/${relation.ownerAppId}/entities/${relation.entityId}`
    Promise.all([readApi<EntitySchema>(base, undefined, abort.signal), readApi<Page<RecordRow>>(`${base}/query`, { method: 'POST', body: JSON.stringify({ limit: 50, ...(cursor ? { cursor } : {}) }) }, abort.signal)]).then(([schema, rows]) => { if (!abort.signal.aborted) { setSchema(schema.data); setOptions(rows.data) } }, (cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Linked records are unavailable.') })
    return () => abort.abort()
  }, [relation?.ownerAppId, relation?.entityId, cursor])
  const refs: Ref[] = value && typeof value === 'object' ? Array.isArray(value) ? value.filter((item): item is Ref => typeof item === 'object' && 'recordId' in item) : 'recordId' in value ? [value] : [] : []
  return <div><p className="cr-muted">Only records you can access are shown.</p>{error ? <p className="cr-error" role="alert">{error}</p> : !options || !schema ? <p role="status">Loading linked records…</p> : <><div role="group" aria-label={field.label}>{options.items.map(row => <label className="cr-choice" key={row.id}><input type={relation?.cardinality === 'many' ? 'checkbox' : 'radio'} name={`relation-${field.id}`} checked={refs.some(ref => ref.recordId === row.id)} onChange={event => onChange(relation?.cardinality === 'many' ? event.target.checked ? [...refs, row.ref] : refs.filter(ref => ref.recordId !== row.id) : row.ref)} /><span>{recordLabel(row, schema)}</span></label>)}</div>{!options.items.length && <p>No permitted linked records.</p>}<div className="cr-actions">{cursor && <button type="button" className="cr-button cr-button--quiet" onClick={() => setCursor(undefined)}>First page</button>}{options.nextCursor && <button type="button" className="cr-button cr-button--quiet" onClick={() => setCursor(options.nextCursor!)}>Next records</button>}{!field.required && <button type="button" className="cr-button cr-button--quiet" onClick={() => onChange(relation?.cardinality === 'many' ? [] : null)}>Clear selection</button>}</div></>}</div>
}
