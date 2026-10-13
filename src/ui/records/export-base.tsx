import { useState } from 'react'
import { readApi } from '../shared/api'
/** The "Export base" panel, opened from its pill in the base actions row. */
export function ExportBasePanel({appId,id}:{appId:string;id:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function download(format:'json'|'csv-set'){setBusy(true);setError('');try{const {data}=await readApi<{filename:string;content:string;encoding:'utf8'|'base64';contentType:string}>('/api/v1/records/base-export',{method:'POST',body:JSON.stringify({appId,format})});const content=data.encoding==='base64'?Uint8Array.from(atob(data.content),c=>c.charCodeAt(0)):data.content,url=URL.createObjectURL(new Blob([content],{type:data.contentType})),a=document.createElement('a');a.href=url;a.download=data.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(error){setError(error instanceof Error?error.message:'Base export failed.')}finally{setBusy(false)}}
 return <div className="cr-tile cr-export-base" id={id}><p>JSON preserves record identities, schema, saved views and forms. CSV exports every table for review with primary-value links.</p><div className="cr-actions"><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void download('json')}>Download base JSON</button><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void download('csv-set')}>Download all tables as CSV</button></div>{busy&&<p role="status">Preparing the complete base…</p>}{error&&<p role="alert" className="cr-error">{error}</p>}</div>
}
