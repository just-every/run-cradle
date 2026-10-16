import {useEffect, useState} from 'react'
import {readApi} from '../shared/api'

type Progress={id:string;phase:'building'|'complete'|'aborted';completed:number;total:number|null;contentHash:string|null}
export function ArchivePanel(){
 const [hydrated,setHydrated]=useState(false)
 useEffect(()=>setHydrated(true),[])
 const [job,setJob]=useState<Progress|null>(null),[starting,setStarting]=useState(false),[error,setError]=useState('')
 async function start(){
  setStarting(true);setError('')
  try{
   const {data}=await readApi<{id:string}>('/api/v1/commands/export.start',{method:'POST',body:JSON.stringify({scope:'installation',format:'archive'})})
   setJob({id:data.id,phase:'building',completed:0,total:null,contentHash:null})
  }catch(caught){setError(caught instanceof Error?caught.message:'The archive could not be started.')}finally{setStarting(false)}
 }
 async function advance(id:string){
  setError('')
  try{const {data}=await readApi<Progress>(`/api/v1/archive-jobs/${id}/advance`,{method:'POST'});setJob(data)}
  catch(caught){setError(caught instanceof Error?caught.message:'The archive could not be prepared.')}
 }
 useEffect(()=>{
  if(!job||job.phase!=='building'||error)return
  const timer=setTimeout(()=>void advance(job.id),250)
  return()=>clearTimeout(timer)
 },[job,error])
 const ready=job?.phase==='complete'&&!!job.contentHash
 return <section className="cr-card cr-archive"><h2>Export your installation</h2>
  <p>Create a portable archive of all your bases, records and files. Keep your source checkout too. Sign-in credentials and private connection settings are excluded; restoring requires fresh configuration and a review of access.</p>
  <button className="cr-button cr-button--quiet" disabled={!hydrated||starting||job?.phase==='building'} onClick={()=>void start()}>{starting?'Starting archive…':'Prepare archive'}</button>
  {error&&<div role="alert"><p className="cr-error">{error}</p>{job?.phase==='building'&&<button className="cr-button cr-button--quiet" onClick={()=>setError('')}>Continue preparing archive</button>}</div>}
  {job&&<div className="cr-notice" role="status"><p>{ready?'Archive prepared and verified.':job.phase==='aborted'?'This archive is no longer available. Prepare a new archive.':'Preparing your archive…'}</p>
   {ready&&<><a className="cr-button" href={`/api/v1/archive-jobs/${job.id}/content`}>Download verified archive</a><p>Restore this .rer file with <code>rer import --input your-archive.rer --yes</code>.</p></>}
  </div>}
 </section>
}
