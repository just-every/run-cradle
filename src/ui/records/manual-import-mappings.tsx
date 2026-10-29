import { useEffect, useState } from 'react'
import type { EntitySchema } from '../../domains/records/contracts'
import { CSV_CREATE_ALL } from '../../domains/records/csv-mapping-contracts'
import type { CsvMappingChoice, CsvSavedMapping } from '../../domains/records/csv-mapping-contracts'
import { readApi } from '../shared/api'

export function ManualImportMappings({schema,headers,mapping,merge,onUse,onBusyChange,disabled}: {
 schema:EntitySchema;headers:string[];mapping:Record<string,string>;merge:string
 onUse:(mapping:Record<string,string>,merge:string)=>void;onBusyChange:(busy:boolean)=>void;disabled:boolean
}) {
 const [choices,setChoices]=useState<CsvMappingChoice[]>([]),[sourceName,setSourceName]=useState('')
 const [selected,setSelected]=useState<CsvMappingChoice|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const working=(value:boolean)=>{setBusy(value);onBusyChange(value)}
 const identity={appId:schema.appId,entityId:schema.id}
 const send=<T,>(input:object,signal?:AbortSignal)=>readApi<T>('/api/v1/records/import-mappings',{method:'POST',body:JSON.stringify({...identity,...input})},signal)
 useEffect(()=>{
  const abort=new AbortController()
  setChoices([]);setSelected(null);setSourceName('');setError('');setMessage('')
  send<{mappings:CsvMappingChoice[]}>({action:'list'},abort.signal).then(result=>{if(!abort.signal.aborted)setChoices(result.data.mappings)},cause=>{if(!abort.signal.aborted)setError(cause instanceof Error?cause.message:'Saved mappings are unavailable.')})
  return ()=>abort.abort()
 },[schema.appId,schema.id,headers])
 async function useMapping(id:string){
  const choice=choices.find(choice=>choice.id===id)??null
  setSelected(choice);setSourceName(choice?.sourceName??'');setMessage('');setError('')
  if(!choice)return
  if(!choice.available){setError(choice.problem??'Update this mapping to use the current fields.');return}
  working(true)
  try{const {data}=await send<CsvSavedMapping>({action:'use',sourceName:choice.sourceName,headers});onUse(Object.fromEntries(data.mapping.map(item=>[item.column,item.fieldId])),data.mergeFieldId);setMessage(`Using ${data.sourceName}. ${data.mergeFieldId===CSV_CREATE_ALL?'Create all rows. ':''}Review the import before committing.`)}
  catch(cause){setError(cause instanceof Error?cause.message:'Could not use this mapping.')}
  finally{working(false)}
 }
 async function save(){
  working(true);setError('');setMessage('')
  try{
   const existing=choices.find(choice=>choice.sourceName===sourceName.trim())
   if(existing&&selected?.id!==existing.id)throw new Error('Select the existing source mapping before updating it.')
   const {data}=await send<CsvSavedMapping>({action:'save',sourceName,mapping:Object.entries(mapping).filter(([,fieldId])=>fieldId).map(([column,fieldId])=>({column,fieldId})),mergeFieldId:merge,expectedVersion:existing?.version??null})
   const choice={id:data.id,sourceName:data.sourceName,version:data.version,updatedAt:data.updatedAt,available:true}
   setSelected(choice);setSourceName(data.sourceName);setChoices([...choices.filter(item=>item.id!==data.id),choice].sort((a,b)=>a.sourceName.localeCompare(b.sourceName)));setMessage(`Saved ${data.sourceName}.`)
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not save this mapping.')}
  finally{working(false)}
 }
 return <fieldset disabled={disabled||busy||!headers.length}><legend>Recurring source mapping</legend>
  <label className="cr-field">Use saved mapping<select value={selected?.id??''} onChange={event=>void useMapping(event.target.value)}><option value="">New mapping</option>{choices.map(choice=><option key={choice.id} value={choice.id}>{choice.sourceName}{choice.available?'':' — needs updating'}</option>)}</select></label>
  <label className="cr-field">Source name<input value={sourceName} maxLength={200} placeholder="Weekly vendor export" onChange={event=>{setSourceName(event.target.value);setMessage('')}} /></label>
  <button type="button" className="cr-button cr-button--quiet" disabled={!sourceName.trim()||!merge||!Object.values(mapping).some(Boolean)} onClick={()=>void save()}>{selected?.sourceName===sourceName.trim()?'Update saved mapping':'Save mapping'}</button>
  {message&&<p role="status">{message}</p>}{error&&<p className="cr-error" role="alert">{error}</p>}
 </fieldset>
}
