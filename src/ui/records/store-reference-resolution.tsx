import {useState} from 'react'
import type {Ref,StoreReference} from '../../contracts/primitives'
import {readApi} from '../shared/api'
type Outcome={state:string;reason?:string;item?:{name:string;size:number|null;digest:StoreReference['digest']}}
export function StoreReferenceResolution({reference,record}:{reference:StoreReference;record:Ref&{fieldId:string}}){
 const [busy,setBusy]=useState(false),[outcome,setOutcome]=useState<Outcome|null>(null),[error,setError]=useState('')
 async function resolve(confirmChanged=false){setBusy(true);setError('');try{const answer=(await readApi<Outcome>('/api/v1/records/file-stores/resolve',{method:'POST',body:JSON.stringify({...record,provider:reference.provider,itemId:reference.itemId,confirmChanged,...(confirmChanged?{observedDigest:outcome?.item?.digest}: {})})})).data;if(['resolved','unverified'].includes(answer.state))window.location.reload();else setOutcome(answer)}catch(e){setError(e instanceof Error?e.message:'Could not check this reference.')}finally{setBusy(false)}}
 return <span className="cr-stack"><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void resolve()}>Check my store</button>{outcome&&<small>{outcome.reason}</small>}{outcome?.state==='changed'&&<><small>{outcome.item?.name} · {outcome.item?.size??'Unknown'} bytes</small><button type="button" className="cr-button" disabled={busy} onClick={()=>void resolve(true)}>Confirm changed file {reference.name}</button></>}{error&&<small role="alert">{error}</small>}</span>
}
