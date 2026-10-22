import { useState } from 'react'
import type { EntitySchema, Query } from '../../domains/records/contracts'
import { readApi } from '../shared/api'
export function ExportCsv({schema,query,viewId}:{schema:EntitySchema;query:Query;viewId?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function download(format:'csv'|'xlsx'='csv'){setBusy(true);setError('');try{const {data}=await readApi<{csv:string;filename:string;count:number;content?:string;contentType?:string}>('/api/v1/records/export-'+format,{method:'POST',body:JSON.stringify({appId:schema.appId,entityId:schema.id,viewId,query:{...query,cursor:undefined}})});const url=URL.createObjectURL(new Blob([format==='csv'?data.csv:Uint8Array.from(atob(data.content!),c=>c.charCodeAt(0))],{type:data.contentType??'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=data.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(e instanceof Error?e.message:'Export failed.')}finally{setBusy(false)}}
 return <div className="cr-records-export"><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void download()}>{busy?'Exporting…':'Export CSV'}</button><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void download('xlsx')}>Export workbook (.xlsx)</button>{error&&<p role="alert" className="cr-error">{error}</p>}</div>
}
