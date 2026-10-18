import { useState } from 'react'
import { readApi } from '../shared/api'
type BaseDownload={filename:string;content:string;encoding:'utf8'|'base64';contentType:string;omissions?:string[]}
function saveDownload(data:BaseDownload){
 const content=data.encoding==='base64'?Uint8Array.from(atob(data.content),c=>c.charCodeAt(0)):data.content,url=URL.createObjectURL(new Blob([content],{type:data.contentType})),a=document.createElement('a')
 a.href=url;a.download=data.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
/** The "Export base" panel, opened from its pill in the base actions row. */
export function ExportBasePanel({appId,id}:{appId:string;id:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[includeRecords,setIncludeRecords]=useState(true)
 const [prepared,setPrepared]=useState<BaseDownload|null>(null),[confirmed,setConfirmed]=useState(false)
 async function download(format:'json'|'csv-set'){
  setBusy(true);setError('');setPrepared(null);setConfirmed(false)
  try{
   const {data}=await readApi<BaseDownload>('/api/v1/records/base-export',{method:'POST',body:JSON.stringify({appId,format,...(format==='json'?{includeRecords}:{})})})
   if(format==='json'&&!includeRecords)setPrepared(data);else saveDownload(data)
  }catch(error){setError(error instanceof Error?error.message:'Base export failed.')}finally{setBusy(false)}
 }
 return <div className="cr-tile cr-export-base" id={id}><p>JSON preserves schema, saved views and forms. To duplicate a base, download its JSON and use Import a base; existing identities are replaced with new identities. CSV exports every table for review with primary-value links.</p><label className="cr-choice"><input type="checkbox" checked={includeRecords} disabled={busy} onChange={event=>{setIncludeRecords(event.target.checked);setPrepared(null);setConfirmed(false)}} />Include records in base JSON</label><div className="cr-actions"><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void download('json')}>{includeRecords?'Download base JSON':'Prepare schema-only JSON'}</button><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void download('csv-set')}>Download all tables as CSV</button></div>{prepared&&<section className="cr-stack" aria-label="Review schema-only copy"><h3>Review the copy without records</h3><p>Your source base stays unchanged. The downloaded copy excludes these values and record-specific settings:</p>{prepared.omissions?.length?<ul>{prepared.omissions.map((omission,index)=><li key={index}>{omission}</li>)}</ul>:<p>This base has no records or record-specific settings to exclude.</p>}<label className="cr-choice"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} />I reviewed the exclusions from this copy.</label><button className="cr-button" type="button" disabled={!confirmed} onClick={()=>saveDownload(prepared)}>Download schema-only JSON</button></section>}{busy&&<p role="status">Preparing the complete base…</p>}{error&&<p role="alert" className="cr-error">{error}</p>}</div>
}
