import { useId } from 'react'
import type { EntitySchema, Field, ListLevel } from '../../domains/records/contracts'
import { Tooltip } from '../shared/tooltip'
import { FilterEditor } from './filter-editor'
import { primaryRecordField } from './record-label'
import { useListSchemas } from './record-list-data'
import './record-list.css'

const parentLinks = (schema: EntitySchema, parentId: string) => schema.fields.filter(field => field.type === 'relation' && field.relation?.cardinality === 'one' && field.relation.ownerAppId === schema.appId && field.relation.entityId === parentId)
const initialFields = (schema: EntitySchema) => { const primary = primaryRecordField(schema); return primary ? [primary.id] : schema.fields.slice(0, 1).map(field => field.id) }

export function ListSettings({ schema, levels, onChange }: { schema: EntitySchema; levels: ListLevel[]; onChange(levels: ListLevel[]): void }) {
  const tables = useListSchemas(schema)
  const current = levels.length ? levels : [{ entityId: schema.id, fields: initialFields(schema), sort: [] }]
  function patch(index: number, changes: Partial<ListLevel>) { onChange(current.map((level, at) => at === index ? { ...level, ...changes } : level)) }
  return <details className="cr-list-settings"><summary>List settings</summary>
    {!tables.schemas && !tables.error && <p role="status">Reading permitted tables…</p>}
    {tables.error && <p role="alert">{tables.error} <button type="button" className="cr-button" onClick={tables.refresh}>Retry tables</button></p>}
    {tables.schemas && <>
      <p className="cr-muted">Choose up to five levels. A child’s parent link points to the preceding table.</p>
      {current.map((level, index) => {
        const table = tables.schemas!.find(item => item.id === level.entityId)
        const previousId = current[index - 1]?.entityId ?? schema.id
        const candidates = index ? tables.schemas!.filter(item => parentLinks(item, previousId).length) : tables.schemas!.filter(item => item.id === schema.id)
        return <fieldset key={`${index}:${level.entityId}`} className="cr-list-settings__level"><legend>Level {index + 1}</legend>
          <div className="cr-list-settings__links"><label className="cr-field">{index ? 'Child table' : 'Top table'}<select aria-label={index ? `Level ${index + 1} child table` : 'Top table'} value={level.entityId} disabled={!index} onChange={event => {
            const selected = candidates.find(item => item.id === event.target.value)!
            onChange([...current.slice(0, index), { entityId: selected.id, parentFieldId: parentLinks(selected, previousId)[0]!.id, fields: initialFields(selected), sort: [] }])
          }}>{candidates.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          {table && <label className="cr-field">{index ? 'Parent link' : 'Own parent link'}<select aria-label={`Level ${index + 1} parent link`} value={level.parentFieldId ?? ''} onChange={event => patch(index, { parentFieldId: event.target.value || undefined })}>
            {!index && <option value="">All records at the top</option>}{parentLinks(table, previousId).map(field => <option value={field.id} key={field.id}>{field.label}</option>)}
          </select></label>}
          {index > 0 && <button type="button" className="cr-button cr-button--quiet" onClick={() => onChange(current.slice(0, index))}>Remove level {index + 1}</button>}</div>
          {!table ? <p role="alert">This table is unavailable. Choose a permitted table.</p> : <>
            <ListFields fields={table.fields} visible={level.fields} onChange={fields => patch(index, { fields })} />
            <details><summary>Filter level {index + 1}</summary><FilterEditor schema={table} filter={level.filter ?? { kind: 'all', conditions: [] }} onChange={filter => patch(index, { filter })} /></details>
            <details><summary>Sort level {index + 1}{level.sort.length ? ` · ${level.sort.length}` : ''}</summary>
              {level.sort.map((sort, sortIndex) => <div className="cr-list-settings__sort" key={sortIndex}>
                <label className="cr-field">Sort field<select aria-label={`Level ${index + 1} sort field ${sortIndex + 1}`} value={sort.fieldId} onChange={event => patch(index, { sort: level.sort.map((item, at) => at === sortIndex ? { ...item, fieldId: event.target.value } : item) })}>{table.fields.map(field => <option value={field.id} key={field.id}>{field.label}</option>)}</select></label>
                <label className="cr-field">Direction<select value={sort.direction} onChange={event => patch(index, { sort: level.sort.map((item, at) => at === sortIndex ? { ...item, direction: event.target.value as 'asc' | 'desc' } : item) })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
                <Tooltip label="Remove sort"><button type="button" className="cr-button cr-button--quiet" onClick={() => patch(index, { sort: level.sort.filter((_, at) => at !== sortIndex) })}>×</button></Tooltip>
              </div>)}
              <button type="button" className="cr-button cr-button--quiet" disabled={level.sort.length >= table.fields.length} onClick={() => { const field = table.fields.find(item => !level.sort.some(sort => sort.fieldId === item.id)); if (field) patch(index, { sort: [...level.sort, { fieldId: field.id, direction: 'asc' }] }) }}>Add sort</button>
            </details>
          </>}
        </fieldset>
      })}
      {current.length < 5 && <button type="button" className="cr-button cr-button--quiet" disabled={!tables.schemas.some(item => parentLinks(item, current.at(-1)!.entityId).length)} onClick={() => {
        const parentId = current.at(-1)!.entityId, child = tables.schemas!.find(item => parentLinks(item, parentId).length)!
        onChange([...current, { entityId: child.id, parentFieldId: parentLinks(child, parentId)[0]!.id, fields: initialFields(child), sort: [] }])
      }}>Add level</button>}
    </>}
  </details>
}

function ListFields({ fields, visible, onChange }: { fields: Field[]; visible: string[]; onChange(fields: string[]): void }) {
  const id = useId()
  const ordered = [...visible, ...fields.map(field => field.id).filter(field => !visible.includes(field))]
  return <details><summary>Visible fields · {visible.length}</summary><div className="cr-list-settings__fields">{ordered.map(fieldId => {
    const field = fields.find(item => item.id === fieldId)
    if (!field) return null
    const index = visible.indexOf(fieldId)
    return <div key={fieldId} className="cr-list-settings__field"><label htmlFor={`${id}-${fieldId}`}><input id={`${id}-${fieldId}`} type="checkbox" checked={index >= 0} disabled={index >= 0 && visible.length === 1} onChange={event => onChange(event.target.checked ? [...visible, fieldId] : visible.filter(item => item !== fieldId))} />{field.label}</label>{index >= 0 && <Tooltip label={`Move ${field.label} earlier`}><button type="button" className="cr-button cr-button--quiet" disabled={!index} onClick={() => { const next = [...visible]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; onChange(next) }}>↑</button></Tooltip>}</div>
  })}</div></details>
}
