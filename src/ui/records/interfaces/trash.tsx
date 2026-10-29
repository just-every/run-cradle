import {useRef,useState} from 'react'
import {useNavigate} from '@tanstack/react-router'
import type {InterfaceDefinition} from '../../../domains/records/interfaces/contracts'
import {createUlid} from '../../../core/shared/ids'
import {readApi,useResource} from '../../shared/api'
import {ResourceState} from '../../shared/presentation'
export function InterfaceDelete({definition}:{definition:InterfaceDefinition}){
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),command=useRef(createUlid()),navigate=useNavigate()
 async function remove(){setBusy(true);setError('');try{await readApi(`/api/v1/interfaces/${definition.id}/delete`,{method:'POST',body:JSON.stringify({commandId:command.current,version:definition.version})});void navigate({to:'/app/records/$appId/interfaces',params:{appId:definition.appId}})}catch(error){setError((error as Error).message)}finally{setBusy(false)}}
 return <section className="cr-stack"><h2>Interface Trash</h2><p>This interface leaves the published list and stays in Trash for 30 days. A current creator or base owner can restore it while its referenced views and forms remain available. Records are unchanged.</p><label className="cr-choice"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I reviewed moving this interface to Trash.</label><button type="button" className="cr-button cr-button--quiet" disabled={!confirmed||busy} onClick={()=>void remove()}>Move interface to Trash</button>{error&&<p role="alert" className="cr-error">{error}</p>}</section>
}
export function InterfaceTrash({appId,onRestored}:{appId:string;onRestored():void}){
 const deleted=useResource<{items:InterfaceDefinition[]}>(`/api/v1/apps/${appId}/interfaces?state=deleted`)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function restore(value:InterfaceDefinition){setBusy(true);setError('');try{await readApi(`/api/v1/interfaces/${value.id}/trash-restore`,{method:'POST',body:JSON.stringify({commandId:createUlid(),version:value.version})});deleted.refresh();onRestored()}catch(error){setError((error as Error).message)}finally{setBusy(false)}}
 return <section className="cr-stack"><h2>Interfaces in Trash</h2><ResourceState resource={deleted.resource} operation="interface Trash" retry={deleted.refresh}>{data=>data.items.length?data.items.map(value=><article className="cr-records-panel" key={value.id}><h3>{value.name}</h3><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void restore(value)}>Restore {value.name}</button></article>):<p>No interfaces in Trash.</p>}</ResourceState>{error&&<p role="alert" className="cr-error">{error}</p>}</section>
}
