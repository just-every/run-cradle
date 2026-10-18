import { useEffect, useState } from 'react'
import type { CellValue, Page } from '../../contracts/primitives'
import type { Member } from '../../domains/authority/contracts'
import type { EntitySchema, Field, RecordRow } from '../../domains/records/contracts'
import { readApi } from '../shared/api'
import { recordLabel } from './record-label'

export type BoardColumn = { id: string; label: string; value: CellValue; selectable?: boolean }
export const boardKey = (value: CellValue) => value === null ? '__unset' : typeof value === 'string' ? value : typeof value === 'object' && !Array.isArray(value) && 'recordId' in value ? value.recordId : '__unavailable'
export const boardField = (field: Field) => field.type === 'select' || field.type === 'person' || field.type === 'relation' && field.relation?.cardinality === 'one'

/** Candidates come from the same current-policy doors as record editors. No record value is a grant. */
export function useBoardColumns(schema: EntitySchema, field?: Field) {
 const [state,setState]=useState<{key:string;items:BoardColumn[];next:string|null;error:string;loading:boolean}>({key:'',items:[],next:null,error:'',loading:false})
 const [search,setSearch]=useState(''),[cursor,setCursor]=useState<string>(),[revision,setRevision]=useState(0)
 const key=`${schema.appId}:${schema.id}:${field?.id ?? ''}:${search}`
 useEffect(()=>{setSearch('');setCursor(undefined)},[schema.appId,schema.id,field?.id])
 useEffect(()=>{
  if(!field||field.type==='select')return
  const abort=new AbortController();setState(old=>({key,items:cursor&&old.key===key?old.items:[],next:null,error:'',loading:true}))
  async function load(){
   let items:BoardColumn[],next:string|null
   if(field!.type==='person'){
    const {data}=await readApi<Page<Member>>(`/api/v1/members?appId=${encodeURIComponent(schema.appId)}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,{},abort.signal)
    items=data.items.filter(m=>m.state==='active'&&m.name.toLowerCase().includes(search.toLowerCase())).map(m=>({id:m.id,label:m.name,value:m.id}));next=data.nextCursor ?? null
   }else{
    const {data}=await readApi<{schema:EntitySchema;records:Page<RecordRow>}>('/api/v1/records/link-candidates',{method:'POST',body:JSON.stringify({appId:schema.appId,entityId:schema.id,fieldId:field!.id,search,cursor})},abort.signal)
    items=data.records.items.map(row=>({id:row.id,label:recordLabel(row,data.schema),value:row.ref}));next=data.records.nextCursor
   }
   if(!abort.signal.aborted)setState(old=>({key,items:[...new Map([...(cursor&&old.key===key?old.items:[]),...items].map(item=>[item.id,item])).values()],next,error:'',loading:false}))
  }
  void load().catch(error=>{if(!abort.signal.aborted)setState({key,items:[],next:null,error:error instanceof Error?error.message:'Board columns could not be read.',loading:false})})
  return()=>abort.abort()
 },[key,cursor,revision,field,schema.appId,schema.id])
 const columns:BoardColumn[]=field?.type==='select'?(field.options??[]).map(option=>({...option,value:option.id})):state.key===key?state.items:[]
 return {columns:[...columns,{id:'__unset',label:'Unassigned',value:null}],search,setSearch:(value:string)=>{setSearch(value);setCursor(undefined)},loading:state.key===key&&state.loading,error:state.key===key?state.error:'',next:state.next,more:()=>{if(state.next)setCursor(state.next)},refresh:()=>{setCursor(undefined);setRevision(n=>n+1)}}
}
