import { useEffect, useState } from 'react'
import type { CellValue, Page, Ref } from '../../contracts/primitives'
import type { EntitySchema, Field, RecordRow } from '../../domains/records/contracts'
import { readApi } from '../shared/api'
import { primaryRecordField, recordLabel } from './record-label'
import { UiIcon } from '../shared/ui-icon'

type Candidates={schema:EntitySchema;searchFieldIds:string[];records:Page<RecordRow>}
export function RelationshipPicker({ field, value, onChange }: { field: Field; value: CellValue; onChange: (value: CellValue) => void }) {
 const [result,setResult]=useState<Candidates|null>(null),[error,setError]=useState('')
 const [cursor,setCursor]=useState<string|undefined>(),[search,setSearch]=useState(''),[fieldIds,setFieldIds]=useState<string[]|undefined>()
 const [loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0)
 const relation=field.relation
 useEffect(()=>{setCursor(undefined);setSearch('');setFieldIds(undefined);setResult(null)},[relation?.ownerAppId,relation?.entityId])
 useEffect(()=>{
  const abort=new AbortController();setError('');setLoading(true)
  if(!relation){setError('This relationship has no target schema.');setLoading(false);return}
  const timer=setTimeout(()=>{
   readApi<Candidates>('/api/v1/records/link-candidates',{method:'POST',body:JSON.stringify({appId:relation.ownerAppId,entityId:relation.entityId,search,fieldIds,cursor})},abort.signal).then(({data})=>{if(!abort.signal.aborted){setResult(data);setLoading(false)}},cause=>{if(!abort.signal.aborted){setError(cause instanceof Error?cause.message:'Linked records are unavailable.');setLoading(false)}})
  },search?200:0)
  return ()=>{clearTimeout(timer);abort.abort()}
 },[relation?.ownerAppId,relation?.entityId,search,fieldIds,cursor,refresh])
 const refs:Ref[]=value&&typeof value==='object'?Array.isArray(value)?value.filter((item):item is Ref=>typeof item==='object'&&'recordId' in item):'recordId' in value?[value]:[]:[]
 const selected=fieldIds??result?.searchFieldIds??[],primary=result&&primaryRecordField(result.schema)
 return <div className="cr-relationship-picker">
  <p className="cr-muted">Only records and fields you can read are searched and shown.</p>
  <label className="cr-field">Search linked records<input type="search" value={search} maxLength={1000} onChange={event=>{setSearch(event.target.value);setCursor(undefined)}} /></label>
  {result&&<fieldset><legend>Search and show fields</legend>{result.schema.fields.filter(item=>['text','url'].includes(item.type==='computed'?item.resultType??'':item.type)).map(item=><label className="cr-choice" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={event=>{setFieldIds(event.target.checked?[...selected,item.id]:selected.filter(id=>id!==item.id));setCursor(undefined)}} />{item.label}</label>)}</fieldset>}
  {error&&<p className="cr-error" role="alert">{error}</p>}
  {loading?<p role="status">Loading linked records…</p>:!error&&result&&<>
   <div role="group" aria-label={field.label}>{result.records.items.map(row=><label className="cr-choice" key={row.id}>
    <input type={relation?.cardinality==='many'?'checkbox':'radio'} name={`relation-${field.id}`} checked={refs.some(ref=>ref.recordId===row.id)} onChange={event=>onChange(relation?.cardinality==='many'?event.target.checked?[...refs,row.ref]:refs.filter(ref=>ref.recordId!==row.id):row.ref)} />
    <span><span className="cr-record-chip"><UiIcon name="link" size={13} />{recordLabel(row,result.schema)}</span>{selected.filter(id=>id!==primary?.id).map(id=>{const item=result.schema.fields.find(item=>item.id===id),cell=row.fields[id];return item&&cell?.state==='value'&&typeof cell.value==='string'?<span className="cr-muted" key={id}> · {item.label}: {cell.value}</span>:null})}</span>
   </label>)}</div>
   {!result.records.items.length&&<p>No matching permitted linked records.</p>}
   <div className="cr-actions">{cursor&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>setCursor(undefined)}>First page</button>}{result.records.nextCursor&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>setCursor(result.records.nextCursor!)}>Next records</button>}</div>
  </>}
  <div className="cr-actions">{error&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>{setCursor(undefined);setFieldIds(undefined);setSearch('');setRefresh(value=>value+1)}}>Refresh picker</button>}{!field.required&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>onChange(relation?.cardinality==='many'?[]:null)}>Clear selection</button>}</div>
 </div>
}
