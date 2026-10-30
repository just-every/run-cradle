import { useState, type FormEvent } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
import { createUlid } from '../../core/shared/ids'
import { readApi, useResource } from '../shared/api'
import { ResourceState, Empty, Timestamp } from '../shared/presentation'
import {SubscriptionKeys} from './subscription-keys-panel'
import { ProposerKeys } from './proposer-keys-panel'

type Key={id:string;name:string;createdAt:string;expiresAt:string;revokedAt:string|null;entityIds:string[];scopes:{appId:string;actions:string[];purposes:string[]}[]}
type Issued={id:string;secret:string;name:string;expiresAt:string}

function accessLabel(key:Key) {
 const actions=new Set(key.scopes.flatMap(scope=>scope.actions))
 const verbs=[['record.read','read'],['record.create','create'],['record.patch','update'],['record.delete','delete']]
  .filter(([action])=>actions.has(action!)).map(([,verb])=>verb!)
 if(!verbs.length)return 'No record access'
 const label=verbs.length===1?verbs[0]!:verbs.slice(0,-1).join(', ')+' and '+verbs.at(-1)
 return label[0]!.toUpperCase()+label.slice(1)+' records'
}

export function ApiKeysPanel() {
 const apps=useResource<Page<{id:string;name:string}>>('/api/v1/apps')
 const [appId,setAppId]=useState('')
 return <section className="cr-section"><h2>API keys</h2><p>Give a connected service access to one record type. Keys expire and can be revoked. Your current data policy also applies.</p>
  <ResourceState resource={apps.resource} operation="applications" retry={apps.refresh}>{page=><>
   <label className="cr-field">Application<select value={appId} onChange={e=>setAppId(e.target.value)}><option value="">Choose an application</option>{page.items.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
   {appId&&<><AppKeys key={appId} appId={appId}/><SubscriptionKeys key={appId+':subscriptions'} appId={appId}/></>}</>}</ResourceState><ProposerKeys/></section>
}

function AppKeys({appId}:{appId:string}) {
 const keys=useResource<{keys:Key[]}>(`/api/user-keys?appId=${encodeURIComponent(appId)}`)
 const entities=useResource<Page<EntitySchema>>(`/api/v1/apps/${encodeURIComponent(appId)}/entities`)
 const [entityId,setEntityId]=useState(''),[name,setName]=useState(''),[permissions,setPermissions]=useState<'read'|'write'>('read')
 const [allowDelete,setAllowDelete]=useState(false)
 const [days,setDays]=useState(7),[issued,setIssued]=useState<Issued|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 async function issue(event:FormEvent) {
  event.preventDefault();setError(null);setIssued(null);setBusy(true)
  try {
   const response=await readApi<{key:Issued}>('/api/user-keys',{method:'POST',body:JSON.stringify({commandId:createUlid(),appId,entityId,name,permissions,allowDelete:permissions==='write'&&allowDelete,expiresAt:new Date(Date.now()+days*86400000).toISOString()})})
   setIssued(response.data.key);setName('');setAllowDelete(false);keys.refresh()
  }catch(e){setError(e instanceof Error?e.message:'Could not issue the key.')}finally{setBusy(false)}
 }
 async function rotate(key:Key) {
  setError(null);setIssued(null);setBusy(true)
  try {const response=await readApi<{key:Issued}>(`/api/user-keys/${key.id}/rotate`,{method:'POST',body:JSON.stringify({commandId:createUlid(),appId})});setIssued(response.data.key);keys.refresh()}
  catch(e){setError(e instanceof Error?e.message:'Could not rotate the key.')}finally{setBusy(false)}
 }
 async function revoke(key:Key) {
  setError(null);setBusy(true)
  try {await readApi(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:JSON.stringify({commandId:createUlid(),appId})});if(issued?.id===key.id)setIssued(null);keys.refresh()}
  catch(e){setError(e instanceof Error?e.message:'Could not revoke the key.')}finally{setBusy(false)}
 }
 return <ResourceState resource={keys.resource} operation="API keys" retry={keys.refresh}>{data=><div className="cr-stack">
  {issued&&<section className="cr-card" aria-label="New API key"><h3>Copy your key now</h3><p>This is the only time its value is shown. Keep it in your service's private settings.</p><label className="cr-field">API key<textarea aria-label="API key" readOnly value={issued.secret} rows={2} spellCheck={false}/></label><button className="cr-button cr-button--quiet" type="button" onClick={()=>setIssued(null)}>I saved this key</button></section>}
  <ResourceState resource={entities.resource} operation="record types" retry={entities.refresh}>{page=><form className="cr-stack" onSubmit={issue}>
   <label className="cr-field">Key name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} autoComplete="off"/></label>
   <label className="cr-field">Record type<select required value={entityId} onChange={e=>setEntityId(e.target.value)}><option value="">Choose a record type</option>{page.items.map(entity=><option key={entity.id} value={entity.id}>{entity.label}</option>)}</select></label>
   <label className="cr-field">Access<select value={permissions} onChange={e=>{const access=e.target.value as 'read'|'write';setPermissions(access);if(access==='read')setAllowDelete(false)}}><option value="read">Read records</option><option value="write">Read, create and update records</option></select></label>
   <label className="cr-choice"><input type="checkbox" checked={allowDelete} disabled={permissions!=='write'} onChange={e=>setAllowDelete(e.target.checked)}/>Allow record deletion</label>
   <p>Deletion requires write access and a separate confirmation for each record.</p>
   <label className="cr-field">Expires in<select value={days} onChange={e=>setDays(Number(e.target.value))}>{[7,14,30].map(day=><option key={day} value={day}>{day} days</option>)}</select></label>
   <button className="cr-button" disabled={busy||!entityId}>{busy?'Working…':'Issue API key'}</button>
  </form>}</ResourceState>
  {error&&<p className="cr-error" role="alert">{error}</p>}
  {data.keys.length?<div className="cr-stack">{data.keys.map(key=><article className="cr-card" key={key.id}><h3>{key.name}</h3><p>{key.revokedAt?'Revoked':Date.parse(key.expiresAt)<=Date.now()?'Expired':'Active'} · expires <Timestamp value={key.expiresAt}/></p><p>{accessLabel(key)} · {key.entityIds.map(id=>entities.resource.state==='ready'?entities.resource.data.items.find(entity=>entity.id===id)?.label??'Record type unavailable':'Record type').join(', ')}</p>{!key.revokedAt&&Date.parse(key.expiresAt)>Date.now()&&<button className="cr-button cr-button--quiet" disabled={busy} type="button" onClick={()=>void rotate(key)}>Rotate {key.name}</button>}{!key.revokedAt&&<button className="cr-button cr-button--quiet" disabled={busy} type="button" onClick={()=>void revoke(key)}>Revoke {key.name}</button>}</article>)}</div>:<Empty title="No API keys">Only safe key metadata appears after issuance.</Empty>}
 </div>}</ResourceState>
}
