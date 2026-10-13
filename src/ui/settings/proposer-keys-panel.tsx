import { useState, type FormEvent } from 'react'
import { createUlid } from '../../core/shared/ids'
import { readApi, useResource } from '../shared/api'
import { ResourceState, Empty, Timestamp } from '../shared/presentation'

type Key={id:string;name:string;appId:string;baseName:string|null;createdAt:string;expiresAt:string;revokedAt:string|null}
type Issued={id:string;secret:string;name:string;expiresAt:string;appId:string;endpoint:string;api:string}

/** Keys that let an agent propose a base or schema change for the owner to review. */
export function ProposerKeys() {
 const keys=useResource<{bases:{id:string;name:string}[];keys:Key[]}>('/api/proposer-keys')
 const [name,setName]=useState(''),[appId,setAppId]=useState(''),[days,setDays]=useState(7),[issued,setIssued]=useState<Issued|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 async function issue(event:FormEvent) {
  event.preventDefault();setError(null);setIssued(null);setBusy(true)
  try {const response=await readApi<{key:Issued}>('/api/proposer-keys',{method:'POST',body:JSON.stringify({commandId:createUlid(),name,...(appId?{appId}:{}),expiresAt:new Date(Date.now()+days*86400000).toISOString()})});setIssued(response.data.key);setName('');keys.refresh()}
  catch(e){setError(e instanceof Error?e.message:'Could not issue the key.')}finally{setBusy(false)}
 }
 async function revoke(key:Key) {
  setError(null);setBusy(true)
  try {await readApi(`/api/proposer-keys/${key.id}/revoke`,{method:'POST',body:JSON.stringify({commandId:createUlid()})});if(issued?.id===key.id)setIssued(null);keys.refresh()}
  catch(e){setError(e instanceof Error?e.message:'Could not revoke the key.')}finally{setBusy(false)}
 }
 return <section className="cr-section" aria-labelledby="proposing-keys"><h3 id="proposing-keys">Proposing keys</h3><p>Let an agent such as a Claude or Codex session propose a new base, or changes to one of your bases. It can read that base's schema and propose; it cannot read or change records, adopt anything or manage keys. You review each proposal on the Records page.</p>
  <ResourceState resource={keys.resource} operation="proposing keys" retry={keys.refresh}>{data=><div className="cr-stack">
   {issued&&<section className="cr-card" aria-label="New proposing key"><h4>Copy your key now</h4><p>This is the only time its value is shown. Give it to the agent's private configuration.</p><label className="cr-field">Proposing key<textarea readOnly value={issued.secret} rows={2} spellCheck={false}/></label><p>MCP endpoint: <code>{issued.endpoint}</code> · REST: <code>{issued.api}</code></p><button className="cr-button cr-button--quiet" type="button" onClick={()=>setIssued(null)}>I saved this key</button></section>}
   <form className="cr-stack" onSubmit={issue}>
    <label className="cr-field">Proposing key name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} autoComplete="off"/></label>
    <label className="cr-field">Base to propose for<select value={appId} onChange={e=>setAppId(e.target.value)}><option value="">A new base</option>{data.bases.map(base=><option key={base.id} value={base.id}>{base.name}</option>)}</select></label>
    <label className="cr-field">Proposing key expires in<select value={days} onChange={e=>setDays(Number(e.target.value))}>{[7,14,30].map(day=><option key={day} value={day}>{day} days</option>)}</select></label>
    <button className="cr-button" disabled={busy}>{busy?'Working…':'Issue proposing key'}</button>
   </form>
   {error&&<p className="cr-error" role="alert">{error}</p>}
   {data.keys.length?<div className="cr-stack">{data.keys.map(key=><article className="cr-card" key={key.id}><h4>{key.name}</h4><p>{key.revokedAt?'Revoked':Date.parse(key.expiresAt)<=Date.now()?'Expired':'Active'} · {key.baseName??'New base'} · expires <Timestamp value={key.expiresAt}/></p>{!key.revokedAt&&<button className="cr-button cr-button--quiet" disabled={busy} type="button" onClick={()=>void revoke(key)}>Revoke {key.name}</button>}</article>)}</div>:<Empty headingLevel={4} title="No proposing keys">Only safe key metadata appears after issuance.</Empty>}
  </div>}</ResourceState></section>
}
