import { useEffect, useState } from 'react'
import type { CellValue, Page, Ref } from '../../contracts/primitives'
import type { EntitySchema, Field, RecordRow } from '../../domains/records/contracts'
import { readApi } from '../shared/api'
import { recordLabel } from './record-label'
import { CellDisplay } from './record-fields'
import { UiIcon } from '../shared/ui-icon'

type Candidates = { schema: EntitySchema; searchFieldIds: string[]; displayFieldIds: string[]; records: Page<RecordRow>; viewName?: string }
export function RelationshipPicker({ appId, entityId, inputId, field, value, onChange }: { appId: string; entityId: string; inputId: string; field: Field; value: CellValue; onChange: (value: CellValue) => void }) {
 const [result,setResult]=useState<Candidates|null>(null),[error,setError]=useState('')
 const [cursor,setCursor]=useState<string|undefined>(),[search,setSearch]=useState('')
 const [loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0)
 const relation=field.relation
 useEffect(()=>{setCursor(undefined);setSearch('');setResult(null)},[appId,entityId,field.id])
 useEffect(()=>{
  const abort=new AbortController();setError('');setLoading(true);setResult(null)
  if(!relation){setError('This relationship has no target schema.');setLoading(false);return}
  const timer=setTimeout(()=>{
   readApi<Candidates>('/api/v1/records/link-candidates',{method:'POST',body:JSON.stringify({appId,entityId,fieldId:field.id,search,cursor})},abort.signal).then(({data})=>{if(!abort.signal.aborted){setResult(data);setLoading(false)}},cause=>{if(!abort.signal.aborted){setError(cause instanceof Error?cause.message:'Linked records are unavailable.');setLoading(false)}})
  },search?200:0)
  return ()=>{clearTimeout(timer);abort.abort()}
 },[appId,entityId,field.id,relation,search,cursor,refresh])
 const refs:Ref[]=value&&typeof value==='object'?Array.isArray(value)?value.filter((item):item is Ref=>item!==null&&typeof item==='object'&&'recordId' in item):'recordId' in value?[value]:[]:[]
 return <div className="cr-relationship-picker">
  <p className="cr-muted">Only records and fields you can read are searched and shown.</p>
  <label className="cr-field">Search linked records<input id={inputId} type="search" value={search} maxLength={1000} onChange={event=>{setSearch(event.target.value);setCursor(undefined)}} /></label>
  {result&&<details className="cr-detail"><summary>Picker settings</summary><p>Searches: {result.searchFieldIds.map(id=>result.schema.fields.find(item=>item.id===id)?.label).filter(Boolean).join(', ')||'No searchable fields'}.</p><p>Shows: {result.displayFieldIds.map(id=>result.schema.fields.find(item=>item.id===id)?.label).filter(Boolean).join(', ')||'Record title'}.</p>{result.viewName&&<p>Limited to shared view: {result.viewName}. Current view filters and order apply.</p>}<p className="cr-muted">Picker settings are managed in the linked field’s schema.</p></details>}
  {error&&<p className="cr-error" role="alert">{error}</p>}
  {loading?<p role="status">Loading linked records…</p>:!error&&result&&<>
   <div role="group" aria-label={field.label}>{result.records.items.map(row=><div className="cr-choice" key={row.id}>
    <input id={`${inputId}-${row.id}`} aria-label={recordLabel(row,result.schema)} type={relation?.cardinality==='many'?'checkbox':'radio'} name={`relation-${inputId}`} checked={refs.some(ref=>ref.appId===row.ref.appId&&ref.entityId===row.ref.entityId&&ref.recordId===row.id)} onChange={event=>onChange(relation?.cardinality==='many'?event.target.checked?[...refs,row.ref]:refs.filter(ref=>ref.recordId!==row.id):row.ref)} />
    <div><label htmlFor={`${inputId}-${row.id}`} className="cr-record-chip"><UiIcon name="link" size={13} />{recordLabel(row,result.schema)}</label>{result.displayFieldIds.map(id=>{const item=result.schema.fields.find(item=>item.id===id);return item?<div key={id}><span className="cr-muted">{item.label}: </span><CellDisplay appId={result.schema.appId} field={item} cell={row.fields[id]} /></div>:null})}</div>
   </div>)}</div>
   {!result.records.items.length&&<p>No matching permitted linked records.</p>}
   <div className="cr-actions">{cursor&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>setCursor(undefined)}>First page</button>}{result.records.nextCursor&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>setCursor(result.records.nextCursor!)}>Next records</button>}</div>
  </>}
  <div className="cr-actions">{error&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>{setCursor(undefined);setRefresh(value=>value+1)}}>Refresh picker</button>}{!field.required&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>onChange(relation?.cardinality==='many'?[]:null)}>Clear selection</button>}</div>
 </div>
}
