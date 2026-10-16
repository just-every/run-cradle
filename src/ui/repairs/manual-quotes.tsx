import { useEffect, useRef, useState } from 'react'
import type { QuoteReview } from '../../apps/repairs/quote-runtime.server'
import type { Quote, RepairActionInput } from '../../apps/repairs/contracts'
import type { Source } from '../../domains/evidence/contracts'
import { decimalMinor } from '../../apps/repairs/money'
import { REPAIRS_APP_ID } from '../../apps/repairs/model'
import { readApi, useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
import { QuoteSummary } from './quote-summary'
import { manualQuoteSource } from '../../apps/repairs/manual-quote-source'
export function ManualQuotes({id}:{id:string}){
 const review=useResource<QuoteReview>(`/api/v1/repairs/${id}/quotes`,{refreshMs:5000})
 return <section className="cr-section"><h2>Quotes</h2><p>Review only: recording or changing these details does not contact a contractor, approve spending or book a visit.</p><ResourceState resource={review.resource} operation="quote review" retry={review.refresh}>{data=><QuoteReviewContent id={id} data={data} />}</ResourceState></section>
}
export function QuoteReviewContent({id,data}:{id:string;data:QuoteReview}){
 const [attempt,setAttempt]=useState(0),[entryOpen,setEntryOpen]=useState(data.items.length===0)
 return <>{data.items.length>0?<div className="cr-stack">{data.items.map(({quote,issues,approvalRequired})=><div key={quote.id}><QuoteSummary quote={quote} />{issues.length?<ul className="cr-notice">{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:<p className="cr-muted">Current terms and evidence.</p>}{approvalRequired&&<p className="cr-notice">Above A$2,000: a designated manager decision on this exact version is required before any future commitment.</p>}</div>)}</div>:<p>No quotes recorded yet.</p>}<p className="cr-muted">Check the original source for warranty coverage. Select current terms in Repair progress. Approval and booking each recheck authority.</p>{data.canCapture&&data.contractor?<details className="cr-detail" open={entryOpen} onToggle={event=>setEntryOpen(event.currentTarget.open)}><summary>{data.items.length?'Add another quote':'Add a quote'}</summary><QuoteCapture key={attempt} id={id} attempt={attempt} data={data} onActive={()=>setEntryOpen(true)} onNew={()=>{setAttempt(value=>value+1);setEntryOpen(true)}} /></details>:<p className="cr-notice">Capture requires active manual work and a currently eligible selected contractor.</p>}</>
}
function QuoteCapture({id,attempt,data,onNew,onActive}:{id:string;attempt:number;data:QuoteReview;onNew:()=>void;onActive:()=>void}){
 const capture=useCommand<Pick<Source,'id'>>(`quote-source:${id}:${attempt}`),submit=useCommand<Quote>(`quote-record:${id}:${attempt}`)
 const retained=useRef<{input:Omit<RepairActionInput<'repair.record-quote'>,'evidence'>;text:string;context:QuoteReview}|null>(null),busy=useRef(false)
 const [working,setWorking]=useState(false),[error,setError]=useState(''),[lines,setLines]=useState([0]),nextLine=useRef(1)
 useEffect(()=>{if(capture.result.state!=='idle'||submit.result.state!=='idle')onActive()},[capture.result.state,submit.result.state])
 const uncertain=[capture.result.state,submit.result.state].some(state=>['submitting','pending','unknown'].includes(state))
 async function send(form:HTMLFormElement){
  if(busy.current||uncertain)return
  busy.current=true;setWorking(true);setError('')
  try{
   if(!retained.current){const fields=new FormData(form),total={minor:decimalMinor(String(fields.get('total')),2).toString(),currency:'AUD',scale:2},expiresAt=new Date(String(fields.get('expiry'))+'Z').toISOString()
    if(!data.contractor)throw new Error('Review the selected contractor again.')
    const amounts=fields.getAll('lineAmount'),lineItems=fields.getAll('description').map((description,index)=>({description:String(description),total:{minor:decimalMinor(String(amounts[index]),2).toString(),currency:'AUD',scale:2}}))
    if(lineItems.reduce((sum,item)=>sum+BigInt(item.total.minor),0n)!==BigInt(total.minor))throw new Error('The line amounts must exactly equal the quoted total. Review the original quote before capturing evidence.')
    const input={workOrder:data.workOrder,contractor:data.contractor,scopeHash:data.scopeHash,total,taxIncluded:fields.get('tax')==='on',lineItems,exclusions:String(fields.get('exclusions')).split('\n').map(value=>value.trim()).filter(Boolean),expiresAt,offeredSlot:fields.get('slotStart')&&fields.get('slotEnd')?{start:new Date(String(fields.get('slotStart'))+'Z').toISOString(),end:new Date(String(fields.get('slotEnd'))+'Z').toISOString(),expiresAt,state:'offered' as const}:null}
    retained.current={input,context:data,text:manualQuoteSource(String(fields.get('evidence')),input)}
   }
   const original=retained.current
   const captured=capture.result.state==='committed'?capture.result.value:await capture.submit('/api/v1/commands/source.capture',{appId:REPAIRS_APP_ID,kind:'form',fileIds:[],subject:original.context.store,text:original.text},[])
   if(!captured)return
   // Status receipts intentionally retain only the source ID; re-read authorized exact metadata.
   const {data:source}=await readApi<Source>(`/api/v1/sources/${captured.id}?version=1`)
   const expectedHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(original.text))),byte=>byte.toString(16).padStart(2,'0')).join('')
   if(source.sha256!==expectedHash)throw new Error('The recovered evidence belongs to an earlier transcription. Start a new transcription after reviewing that source.')
   await submit.submit('/api/v1/commands/repair.record-quote',{...original.input,evidence:[{sourceId:source.id,sourceVersion:source.version,locator:{kind:'field',path:'manualQuote'},observedAt:source.knownAt}]},[original.input.workOrder,original.input.contractor],original.context.controlEpoch)
  }catch(cause){setError(cause instanceof Error?cause.message:'The quote has not been confirmed.')}finally{busy.current=false;setWorking(false)}
 }
 if(submit.result.state==='committed')return <div className="cr-card" role="status"><p>Quote recorded. Work remains in quote review.</p><button className="cr-button cr-button--quiet" onClick={onNew}>Record another quote</button></div>
 return <form className="cr-card cr-form" onSubmit={event=>{event.preventDefault();void send(event.currentTarget)}}><h3>Record a manual quote</h3><p>{data.contractorName} · current work version {data.workOrder.version}</p><p>Transcribe each quoted line and the original total. Line amounts must add up exactly. Keep excluded work visible.</p><fieldset disabled={working||uncertain||retained.current!==null}>{lines.map((line,index)=><div className="cr-section" key={line}><label className="cr-field">Work item {index+1}<textarea name="description" required maxLength={10000} /></label><label className="cr-field">Line {index+1} amount (AUD)<input name="lineAmount" type="text" inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,2})?" /></label>{lines.length>1&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>setLines(current=>current.filter(id=>id!==line))}>Remove work item {index+1}</button>}</div>)}<button type="button" className="cr-button cr-button--quiet" disabled={lines.length>=100} onClick={()=>{const line=nextLine.current++;setLines(current=>[...current,line])}}>Add quote line</button><label className="cr-field">Total (AUD)<input name="total" type="text" inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,2})?" /></label><label className="cr-choice"><input name="tax" type="checkbox" />Tax is included in this total</label><label className="cr-field">Quote expires (UTC)<input name="expiry" type="datetime-local" required /></label><label className="cr-field">Offered visit start (UTC, optional)<input name="slotStart" type="datetime-local" /></label><label className="cr-field">Offered visit end (UTC, optional)<input name="slotEnd" type="datetime-local" /></label><label className="cr-field">Excluded work (one item per line)<textarea name="exclusions" /></label><label className="cr-field">Original quote evidence<textarea name="evidence" required maxLength={30000} /></label></fieldset>{retained.current&&<p>The captured terms are retained for this original attempt. A retry cannot replace them.</p>}{error&&<p className="cr-notice" role="alert">{error}</p>}<button className="cr-button" disabled={working||uncertain}>{capture.result.state==='committed'&&submit.result.state==='idle'?'Continue with captured evidence':retained.current?'Retry original quote':'Record quote evidence'}</button>{(retained.current||capture.result.state==='committed')&&!working&&!uncertain&&<button type="button" className="cr-button cr-button--quiet" onClick={onNew}>Start a new transcription</button>}{capture.result.state==='committed'&&<p><a className="cr-link" href={`/app/evidence/${capture.result.value.id}?version=1&repairId=${id}`} target="_blank" rel="noopener noreferrer">Review captured quote evidence</a></p>}<CommandFeedback {...capture} /><CommandFeedback {...submit} /></form>
}
