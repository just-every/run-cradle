import {useState} from 'react'
import type {Page} from '../../contracts/primitives'
import {createUlid} from '../../core/shared/ids'
import {readApi,useResource} from '../shared/api'
import {Empty,ResourceState,Timestamp} from '../shared/presentation'
type Item={kind:'record';id:string;entityId:string;entityLabel:string;name:string;version:number;deletedAt:string;expiresAt:string;restorable:boolean;purgeState:string}
export function TrashPanel(){
 const apps=useResource<Page<{id:string;name:string}>>('/api/v1/apps'),[appId,setAppId]=useState('')
 return <section className="cr-section" aria-label="Trash"><h2>Trash</h2><p>Deleted records stay in this base’s trash for 30 days. Restore is available only while you still have permission to delete them.</p><ResourceState resource={apps.resource} operation="bases" retry={apps.refresh}>{page=><><label className="cr-field">Trash base<select value={appId} onChange={event=>setAppId(event.target.value)}><option value="">Choose a base</option>{page.items.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label>{appId&&<BaseTrash key={appId} appId={appId}/>}</>}</ResourceState></section>
}
function BaseTrash({appId}:{appId:string}){
 const trash=useResource<{items:Item[]}>(`/api/v1/records/trash?appId=${encodeURIComponent(appId)}`),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[restored,setRestored]=useState<string|null>(null)
 async function restore(item:Item){setError(null);setBusy(true);try{const reply=await readApi<{result:{state:string}}>('/api/v1/records/trash/restore',{method:'POST',body:JSON.stringify({commandId:createUlid(),appId,entityId:item.entityId,recordId:item.id,version:item.version})});if(reply.data.result.state!=='committed')throw new Error('Restoration is not confirmed. Refresh the list before trying again.');setRestored(item.name);trash.refresh()}catch(e){setError(e instanceof Error?e.message:'Could not restore this record.')}finally{setBusy(false)}}
 return <div className="cr-stack">{error&&<p role="alert" className="cr-error">{error}</p>}{restored&&<p role="status">Restored {restored}.</p>}<ResourceState resource={trash.resource} operation="trash" retry={trash.refresh}>{data=>data.items.length?<ul className="launch-settings-list">{data.items.map(item=><li key={item.entityId+':'+item.id} className="launch-settings-item"><div className="launch-settings-summary"><strong>{item.name}</strong><span>{item.entityLabel} · deleted <Timestamp value={item.deletedAt}/> · restore until <Timestamp value={item.expiresAt}/></span>{item.purgeState!=='held'&&<span>Purge needs attention: {item.purgeState.replaceAll('_',' ')}</span>}</div><button type="button" className="cr-button cr-button--quiet" disabled={busy||!item.restorable} onClick={()=>void restore(item)} aria-label={`Restore ${item.name}`}>Restore</button></li>)}</ul>:<Empty title="Trash is empty">Only items you may currently restore appear here.</Empty>}</ResourceState></div>
}
