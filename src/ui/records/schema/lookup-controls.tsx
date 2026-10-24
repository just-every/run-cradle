import type { Expr, Field, Sort } from '../../../domains/records/contracts'

type LookupExpression = Extract<Expr, { kind: 'rollup' }>
const sortableTypes = ['phone','text', 'url', 'number', 'date', 'instant', 'money', 'boolean', 'select', 'person']

export function LookupControls({ expression, fields, onChange }: { expression: LookupExpression; fields: Field[]; onChange: (expression: LookupExpression) => void }) {
  const sort = expression.sort ?? []
  const sortable = fields.filter(field => sortableTypes.includes(field.type === 'computed' ? field.resultType ?? '' : field.type))
  const unused = sortable.filter(field => !sort.some(item => item.fieldId === field.id))
  function updateSort(next: Sort[]) { onChange({ ...expression, sort: next.length ? next : undefined }) }

  return <>
    <fieldset className="cr-filter-group"><legend>Lookup order</legend>
      {sort.map((item, index) => <div className="cr-toolbar" key={index}>
        <label className="cr-field">{index ? 'Then sort by' : 'Sort by'}<select aria-label={`Lookup sort field ${index + 1}`} value={item.fieldId} onChange={e => updateSort(sort.map((value, i) => i === index ? { ...value, fieldId: e.target.value } : value))}>{sortable.filter(field => field.id === item.fieldId || unused.some(candidate => candidate.id === field.id)).map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>
        <label className="cr-field">Direction<select aria-label={`Lookup sort direction ${index + 1}`} value={item.direction} onChange={e => updateSort(sort.map((value, i) => i === index ? { ...value, direction: e.target.value as Sort['direction'] } : value))}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
        <button type="button" className="cr-button cr-button--quiet" aria-label={`Remove lookup sort ${index + 1}`} onClick={() => updateSort(sort.filter((_, i) => i !== index))}>Remove</button>
      </div>)}
      <button type="button" className="cr-button cr-button--quiet" disabled={sort.length >= 10 || !unused.length} onClick={() => { if (unused[0]) updateSort([...sort, { fieldId: unused[0].id, direction: 'asc' }]) }}>Add lookup sort</button>
      {!sort.length && <p className="cr-muted">Uses linked record order.</p>}
    </fieldset>
    <label className="cr-field">First N linked records<input aria-label="First N linked records" type="number" min={1} max={10000} step={1} value={expression.limit ?? ''} onChange={e => { if (!e.target.value) onChange({ ...expression, limit: undefined }); else if (Number.isFinite(e.target.valueAsNumber)) onChange({ ...expression, limit: e.target.valueAsNumber }) }} /><small>Optional. Keep 1–10,000 records after conditions and sorting.</small></label>
  </>
}
