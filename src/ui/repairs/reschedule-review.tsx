import {useEffect,useRef,useState} from 'react'
import type {RepairOperations} from '../../apps/repairs/operation-read.server'
import type {Source} from '../../domains/evidence/contracts'
import {REPAIRS_APP_ID} from '../../apps/repairs/model'
import {readApi,useCommand} from '../shared/api'
import {CommandFeedback} from '../shared/presentation'

/** Reopen terms deliberately after an observed terminal booking outcome. */
export function RescheduleReview({data,onChanged}:{data:RepairOperations;onChanged:()=>void}){
 const source=useCommand<{id:string}>(`repair-reschedule-source:${data.workOrder.ref.recordId}`),command=useCommand(`repair-reschedule:${data.workOrder.ref.recordId}`)
 const retained=useRef<{description:string;text:string;workOrder:RepairOperations['workOrder'];controlEpoch:number}|null>(null)
 const [working,setWorking]=useState(false),[error,setError]=useState('')
 const uncertain=[source.result.state,command.result.state].some(state=>['submitting','pending','unknown'].includes(state))
 useEffect(()=>{if(command.result.state==='committed')onChanged()},[command.result.state])
 async function submit(form:HTMLFormElement){
  if(working||uncertain||!navigator.onLine)return
  setWorking(true);setError('')
  try{
   if(!retained.current){const fields=new FormData(form),description=String(fields.get('scope')),reason=String(fields.get('reason'));retained.current={description,text:`Revised repair scope: ${description}\nRescheduling evidence: ${reason}`,workOrder:data.workOrder,controlEpoch:data.controlEpoch}}
   const original=retained.current
   const captured=source.result.state==='committed'?source.result.value:await source.submit('/api/v1/commands/source.capture',{appId:REPAIRS_APP_ID,kind:'form',text:original.text,fileIds:[],subject:data.store.ref},[])
   if(!captured)return
   const {data:evidence}=await readApi<Source>(`/api/v1/sources/${captured.id}?version=1`)
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(original.text))),byte=>byte.toString(16).padStart(2,'0')).join('')
   if(evidence.sha256!==hash)throw new Error('The confirmed evidence belongs to an earlier review. Review reschedule details before creating new terms.')
   await command.submit('/api/v1/commands/repair.revise-scope',{workOrder:original.workOrder,description:original.description,evidence:[{sourceId:evidence.id,sourceVersion:evidence.version,locator:{kind:'text',start:0,end:original.text.length},observedAt:evidence.knownAt}]},[original.workOrder],original.controlEpoch)
  }catch(cause){setError(cause instanceof Error?cause.message:'Current repair terms could not be confirmed')}finally{setWorking(false)}
 }
 return <details className="cr-detail"><summary>Reschedule with a new quote</summary><form className="cr-form cr-card" onSubmit={event=>{event.preventDefault();void submit(event.currentTarget)}}><p>The original booking is closed. Reopening quote review supersedes its quote and invalidates its approval. Record a new offered time, select the exact quote and obtain any required fresh approval before booking again.</p><fieldset disabled={working||uncertain||retained.current!==null}><label className="cr-field">Work to quote again<textarea name="scope" required maxLength={10000}/></label><label className="cr-field">Rescheduling reason and contractor evidence<textarea name="reason" required maxLength={20000}/></label></fieldset><button className="cr-button" disabled={working||uncertain||command.result.state==='committed'}>{retained.current?'Continue original reschedule review':'Reopen quote review for rescheduling'}</button>{(source.result.state==='failed'||command.result.state==='failed'||!!error)&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>{source.reset();command.reset();retained.current=null;setError('')}}>Review reschedule details</button>}{error&&<p className="cr-notice" role="alert">{error}</p>}<CommandFeedback {...source}/><CommandFeedback {...command}/></form></details>
}
