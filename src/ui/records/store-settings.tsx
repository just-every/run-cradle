import {useEffect,useState} from 'react'
import {readApi,useCommand} from '../shared/api'
import {CommandFeedback} from '../shared/presentation'
import {storeLabels} from './store-reference-view'
type Provider='google-drive'|'onedrive'|'dropbox'|'box'
type Policy={provider:Provider;enabled:number;connectRole:string}
type Connection={id:string;ownerId:string;provider:Provider;name:string;state:string}
type Settings={owner:boolean;policies:Policy[];connections:Connection[]}
function RevokeStore({connection}:{connection:Connection}){
 const command=useCommand(`revoke-store:${connection.id}`)
 return <li>{connection.name} · {connection.state} <button type="button" className="cr-button cr-button--quiet" disabled={connection.state==='revoked'} onClick={()=>void command.submit('/api/v1/commands/connection.revoke',{connectionId:connection.id},[])}>Revoke {connection.name}</button><CommandFeedback {...command}/></li>
}
export function StoreSettings({appId}:{appId:string}){
 const [settings,setSettings]=useState<Settings|null>(null),[error,setError]=useState('')
 useEffect(()=>{let live=true;void readApi<Settings>(`/api/v1/records/file-stores/settings?appId=${appId}`).then(r=>{if(live)setSettings(r.data)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[appId])
 async function save(policy:Policy){
  try{await readApi('/api/v1/records/file-stores/settings',{method:'POST',body:JSON.stringify({kind:'policy',appId,provider:policy.provider,enabled:!!policy.enabled,connectRole:policy.connectRole})});setError('')}
  catch(e){setError(e instanceof Error?e.message:'Could not save store policy.')}
 }
 if(!settings?.owner)return null
 return <details><summary>File store policy</summary><p className="cr-muted">Writer access allows personal stores for attachment writers, and preview-only connections for readers. Narrower policies apply to both.</p>{settings.policies.map(policy=><form key={policy.provider} className="cr-stack" onSubmit={e=>{e.preventDefault();void save(policy)}}><h4>{storeLabels[policy.provider]}</h4><label><input type="checkbox" checked={!!policy.enabled} onChange={e=>setSettings({...settings,policies:settings.policies.map(p=>p.provider===policy.provider?{...p,enabled:e.target.checked?1:0}:p)})}/> Enable {storeLabels[policy.provider]}</label><label className="cr-field">Who may connect {storeLabels[policy.provider]}<select value={policy.connectRole} onChange={e=>setSettings({...settings,policies:settings.policies.map(p=>p.provider===policy.provider?{...p,connectRole:e.target.value}:p)})}><option value="writers">Attachment writers and preview readers</option><option value="base-authors">Base owners and creators</option><option value="installation-owner">Installation owner only</option></select></label><button type="submit" className="cr-button cr-button--quiet">Save {storeLabels[policy.provider]} policy</button></form>)}<ul>{settings.connections.map(connection=><RevokeStore key={connection.id} connection={connection}/>)}</ul>{error&&<p role="alert" className="cr-error">{error}</p>}</details>
}
