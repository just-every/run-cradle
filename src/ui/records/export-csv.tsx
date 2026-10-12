import { useState } from 'react'
import type { EntitySchema, Query } from '../../domains/records/contracts'
import { readApi } from '../shared/api'
export function ExportCsv({schema,query,viewId}:{schema:EntitySchema;query:Query;viewId?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function download(){setBusy(true);setError('');try{const {data}=await readApi<{csv:string;filename:string;count:number}>('/api/v1/records/export-csv',{method:'POST',body:JSON.stringify({appId:schema.appId,entityId:schema.id,viewId,query:{...query,cursor:undefined}})});const url=URL.createObjectURL(new Blob([data.csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=data.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(e instanceof Error?e.message:'Export failed.')}finally{setBusy(false)}}
 return <div><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void download()}>{busy?'Exporting…':'Export CSV'}</button>{error&&<p role="alert" className="cr-error">{error}</p>}</div>
}
