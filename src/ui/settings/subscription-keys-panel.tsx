import {useState} from 'react'
import {createUlid} from '../../core/shared/ids'
import {readApi,useResource} from '../shared/api'
import {ResourceState,Timestamp} from '../shared/presentation'

type Subscription={id:string;entityId:string|null;state:string;expiresAt:string}
/** Signing secrets remain independent of the bearer credential that owns a subscription. */
export function SubscriptionKeys({appId}:{appId:string}){
 const subscriptions=useResource<{subscriptions:Subscription[]}>(`/api/v1/change-subscriptions/owner?appId=${encodeURIComponent(appId)}`)
 const [issued,setIssued]=useState<{id:string;signingKey:string}|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 async function rotate(id:string){
  setBusy(true);setIssued(null);setError(null)
  try{const result=await readApi<{id:string;signingKey:string}>(`/api/v1/change-subscriptions/owner/${id}/rotate`,{method:'POST',body:JSON.stringify({commandId:createUlid(),appId})});setIssued(result.data);subscriptions.refresh()}
  catch(e){setError(e instanceof Error?e.message:'Could not rotate the subscription secret.')}finally{setBusy(false)}
 }
 return <section className="cr-section" aria-label="Change subscription signing keys"><h3>Change subscription signing keys</h3><p>Rotate a receiver’s signing key without changing its subscription or delivery position. A delivery prepared before rotation may finish with the retired key.</p>
  {issued&&<section className="cr-card" aria-label="New subscription signing key"><h4>Copy the signing key now</h4><p>Give this replacement to the receiver. It is shown once.</p><label className="cr-field">Subscription signing key<textarea aria-label="Subscription signing key" readOnly rows={2} value={issued.signingKey} spellCheck={false}/></label><button className="cr-button cr-button--quiet" type="button" onClick={()=>setIssued(null)}>I saved the subscription key</button></section>}
  {error&&<p className="cr-error" role="alert">{error}</p>}
  <ResourceState resource={subscriptions.resource} operation="change subscriptions" retry={subscriptions.refresh}>{data=>data.subscriptions.length?<ul className="launch-settings-list">{data.subscriptions.map(row=><li key={row.id}><div className="launch-settings-summary"><strong>Subscription {row.id}</strong><span>{row.state} · expires <Timestamp value={row.expiresAt}/></span></div>{row.state==='active'&&<button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void rotate(row.id)}>Rotate subscription {row.id}</button>}</li>)}</ul>:<p>No change subscriptions in this application.</p>}</ResourceState>
 </section>
}
