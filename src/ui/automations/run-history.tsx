import {useState} from 'react'
import {createUlid} from '../../core/shared/ids'
import { readApi,useResource } from '../shared/api'
import { ResourceState,Empty,Timestamp } from '../shared/presentation'
type Run={items?:{step:number;recordId:string|null;state:string}[];cause?:string|null;href?:string;retryable?:boolean;testMode?:'dry'|'live';id:string;state:string;definitionVersion:number;recordId:string;recordLabel:string;heldUntil:string|null;queuedAt:string;errorCode:string|null;
 actions:{position:number;state:string;error_code:string|null;smsStatus?:string;smsError?:{code:string|number;message:string}}[]}
export function AutomationRunHistory({id}:{id:string}) {
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const runs=useResource<{runs:Run[]}>(`/api/user-automations/${encodeURIComponent(id)}/runs`)
 return <section className="cr-stack"><div className="cr-toolbar"><h3>Run history</h3><button className="cr-button cr-button--quiet" onClick={runs.refresh}>Refresh runs</button></div>
  {error&&<p role="alert" className="cr-error">{error}</p>}
  <ResourceState resource={runs.resource} operation="automation runs" retry={runs.refresh}>{data=>data.runs.length?
   <div className="cr-stack">{data.runs.map(run=><article id={`run-${run.id}`} key={run.id} className="cr-card"><p><strong>{run.testMode?`${run.testMode==='live'?'Live test':'Test'} · `:''}{run.state}</strong> · definition {run.definitionVersion} · <Timestamp value={run.queuedAt}/></p>
    <p className="cr-muted">{run.recordLabel}</p>{run.errorCode&&<p className="cr-error">{run.cause} ({run.errorCode})</p>}
    {run.href&&<a className="cr-link" href={run.href}>Link to this run</a>}
    {run.retryable&&<button className="cr-button" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await readApi(`/api/user-automations/${id}/runs/${run.id}/retry`,{method:'POST',body:JSON.stringify({commandId:createUlid()})});runs.refresh()}catch(error){setError(error instanceof Error?error.message:'Retry could not be scheduled.')}finally{setBusy(false)}}}>Retry safe action</button>}
    {run.state==='Held'&&run.heldUntil&&<p>Email waits for quiet hours to end · <Timestamp value={run.heldUntil}/></p>}
    <ol>{run.actions.map(action=><li key={action.position}>Action {action.position+1}: {action.state}{action.smsStatus&&` · SMS ${action.smsStatus}`}{action.error_code&&` (${action.error_code})`}{action.smsError&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>Twilio {action.smsError.code}: {action.smsError.message}</p>}</li>)}</ol>
    {Boolean(run.items?.length)&&<section className="cr-stack" aria-label="Repeat item results"><h4>Repeat item results</h4><ol>{run.items!.map((item,index)=><li key={index} style={{overflowWrap:'anywhere'}}>{item.recordId??'Unavailable record'}: {item.state}</li>)}</ol></section>}
    {run.state==='Unknown'&&<p>The receiver may have accepted this effect. Check its receipt before taking further action.</p>}
   </article>)}</div>:<Empty title="No runs yet">New matching record changes create runs after the definition is enabled.</Empty>}</ResourceState>
 </section>
}
