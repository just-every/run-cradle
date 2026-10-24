import {useState} from 'react'
import type {Ref,StoreReference} from '../../contracts/primitives'
import {createUlid} from '../../core/shared/ids'
import {readApi,useResource} from '../shared/api'
/** Copy is an explicit owner request; readers and attachers never copy files just by opening a record. */
export function StoreKeepCopy({reference,record}:{reference:StoreReference;record:Ref&{fieldId:string}}){
 const permission=useResource<{allowed:boolean}>(`/api/v1/records/file-stores/copy-permission?appId=${encodeURIComponent(record.appId)}`),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function copy(){setBusy(true);setError('');try{await readApi('/api/v1/records/file-stores/keep-copy',{method:'POST',body:JSON.stringify({...record,commandId:createUlid(),provider:reference.provider,itemId:reference.itemId})});window.location.reload()}catch(e){setError(e instanceof Error?e.message:'Could not keep a copy.');setBusy(false)}}
 if(permission.resource.state!=='ready'||!permission.resource.data.allowed)return null
 return <span className="cr-stack"><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void copy()}>{busy?'Copying…':'Keep a copy'}</button>{error&&<span role="alert">{error}</span>}</span>
}
