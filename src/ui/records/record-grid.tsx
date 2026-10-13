import { useId } from 'react'
import type { EntitySchema, Field, RecordRow } from '../../domains/records/contracts'
import { CellDisplay } from './record-fields'
import { primaryRecordField, recordLabel } from './record-label'
import { fieldTypeLabel } from './schema/field-type-label'
/** A lookup through a relation the grid also shows repeats that relation's label; phone rows leave it out. */
function echoes(field: Field, visible: string[]) {
 const expression = field.type === 'computed' ? field.expression : undefined
 return expression?.kind === 'rollup' && expression.aggregate === 'lookup' && visible.includes(expression.relationFieldId)
}
/** A lifecycle state as words: "active" reads "Active". */
const lifecycleLabel = (state: string) => state.charAt(0).toUpperCase() + state.slice(1).replaceAll('_', ' ')
function cellClass(field: Field, row: RecordRow, primary: Field | undefined, visible: string[]) {
 const value = row.fields[field.id]
 return [field.id === primary?.id && 'cr-col-primary', field.type === 'boolean' && 'cr-cell--flag', field.id !== primary?.id && value?.state === 'value' && value.value === null && 'cr-cell--empty', echoes(field, visible) && 'cr-cell--echo'].filter(Boolean).join(' ') || undefined
}
function FieldHeader({ field, id }: { field: Field; id: string }) {
 return <th id={id} scope="col">{field.label}<span className="cr-th-type" aria-hidden="true">{fieldTypeLabel(field)}</span></th>
}
export function RecordsGrid({schema,rows,visible,groupBy,selection,onSelection}:{schema:EntitySchema;rows:RecordRow[];visible:string[];groupBy?:string;selection:RecordRow[];onSelection:(rows:RecordRow[])=>void}){
 const tableId=useId()
 const fields=visible.map(id=>schema.fields.find(f=>f.id===id)).filter(f=>!!f)
 const primary=primaryRecordField(schema),primaryVisible=!!primary&&visible.includes(primary.id)
 const groups=new Map<string,RecordRow[]>()
 for(const row of rows){const key=groupBy?JSON.stringify(row.fields[groupBy]):'';groups.set(key,[...(groups.get(key)??[]),row])}
 const href=(row:RecordRow)=>`/app/records/${schema.appId}/${schema.id}/${row.id}`
 const headers=(column:string,group:number)=>`${tableId}-${column}${groupBy?` ${tableId}-rowgroup-${group}`:''}`
 return <div className="cr-table-wrap" tabIndex={0} role="region" aria-label={`${schema.label} table; scroll for more columns`}><table className="cr-table cr-records-table"><thead><tr><th id={`${tableId}-select`} scope="col" className="cr-col-select"><span className="cr-sr-only">Select</span></th>{groupBy&&<th id={`${tableId}-group`} scope="col">Group</th>}{!primaryVisible&&<th id={`${tableId}-record`} scope="col">Record</th>}{fields.map(f=><FieldHeader key={f.id} id={`${tableId}-field-${f.id}`} field={f} />)}<th id={`${tableId}-state`} scope="col" className="cr-col-state">State</th></tr></thead>{[...groups].map(([key,records],group)=><tbody key={key}>{groupBy&&<tr><th id={`${tableId}-rowgroup-${group}`} className="cr-record-group" colSpan={fields.length+2+(groupBy?1:0)+(primaryVisible?0:1)} scope="rowgroup"><CellDisplay appId={schema.appId} field={schema.fields.find(f=>f.id===groupBy)} cell={records[0]!.fields[groupBy]} /> · {records.length} on this page</th></tr>}{records.map(row=><tr key={row.id}><td className="cr-col-select" headers={headers('select',group)}><label className="cr-selection"><input type="checkbox" aria-label={`Select ${recordLabel(row,schema)}`} checked={selection.some(r=>r.id===row.id)} onChange={e=>onSelection(e.target.checked?[...selection,row]:selection.filter(r=>r.id!==row.id))} /></label></td>{groupBy&&<td headers={headers('group',group)}><CellDisplay appId={schema.appId} field={schema.fields.find(f=>f.id===groupBy)} cell={row.fields[groupBy]} /></td>}{!primaryVisible&&<td className="cr-col-primary" headers={headers('record',group)}><a href={href(row)}>Open record</a></td>}{fields.map(f=><td key={f.id} className={cellClass(f,row,primary,visible)} data-label={f.label} headers={headers(`field-${f.id}`,group)}>{f.id===primary?.id?<a href={href(row)}>{row.fields[f.id]?.state==='redacted'||row.fields[f.id]?.state==='unavailable'?<CellDisplay appId={schema.appId} field={f} cell={row.fields[f.id]} />:recordLabel(row,schema)}</a>:<CellDisplay appId={schema.appId} field={f} cell={row.fields[f.id]} />}</td>)}<td className={`cr-col-state${row.lifecycle===schema.lifecycle.initial?' cr-cell--initial':''}`} headers={headers('state',group)}>{lifecycleLabel(row.lifecycle)}</td></tr>)}</tbody>)}</table></div>
}
