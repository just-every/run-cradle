import {createContext,useContext,useState} from 'react'
import type {ReactNode} from 'react'
import type {Ref,StoreReference} from '../../contracts/primitives'
import {readApi} from '../shared/api'
type Address=Ref&{fieldId:string}
type Outcome={state:string;reason?:string;item?:{name:string;size:number|null;modified:string|null;digest:StoreReference['digest']}}
type Selection={provider:StoreReference['provider'];itemId:string;name:string;observedDigest:StoreReference['digest']}
const key=(reference:{provider:string;itemId:string})=>JSON.stringify([reference.provider,reference.itemId])
const Group=createContext<{busy:boolean;selected:Selection[];select:(item:Selection,checked:boolean)=>void}|null>(null)
/** The existing attachment field shares selections only after each changed file has been reviewed. */
export function StoreResolutionGroup({record,children}:{record?:Address;children:ReactNode}){
 const [selected,setSelected]=useState<Selection[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const select=(item:Selection,checked:boolean)=>setSelected(current=>[...current.filter(value=>key(value)!==key(item)),...(checked?[item]:[])])
 async function confirm(){
  if(!record||!selected.length)return
  setBusy(true);setError('')
  try{await readApi('/api/v1/records/file-stores/resolve-bulk',{method:'POST',body:JSON.stringify({...record,items:selected.map(({provider,itemId,observedDigest})=>({provider,itemId,observedDigest}))})});window.location.reload()}
  catch(e){setError(e instanceof Error?e.message:'Could not confirm these references.');setSelected([])}finally{setBusy(false)}
 }
 return <Group.Provider value={{busy,selected,select}}>{children}{selected.length>0&&<span className="cr-stack" role="group" aria-label="Confirm selected changed files"><strong>Accept current content for {selected.length} selected files</strong><span>{selected.map(item=>item.name).join(', ')}</span><button type="button" className="cr-button" disabled={busy} onClick={()=>void confirm()}>Confirm {selected.length} changed files</button></span>}{error&&<span className="cr-error" role="alert">{error}</span>}</Group.Provider>
}
export function StoreReferenceResolution({reference,record}:{reference:StoreReference;record:Address}){
 const group=useContext(Group),[busy,setBusy]=useState(false),[outcome,setOutcome]=useState<Outcome|null>(null),[error,setError]=useState('')
 const selection={provider:reference.provider,itemId:reference.itemId,name:outcome?.item?.name??reference.name,observedDigest:outcome?.item?.digest},disabled=busy||group?.busy
 async function resolve(confirmChanged=false){
  setBusy(true);setError('');group?.select(selection,false)
  try{const answer=(await readApi<Outcome>('/api/v1/records/file-stores/resolve',{method:'POST',body:JSON.stringify({...record,provider:reference.provider,itemId:reference.itemId,confirmChanged,...(confirmChanged?{observedDigest:outcome?.item?.digest}: {})})})).data;if(['resolved','unverified'].includes(answer.state))window.location.reload();else setOutcome(answer)}catch(e){setOutcome(null);setError(e instanceof Error?e.message:'Could not check this reference.')}finally{setBusy(false)}
 }
 return <span className="cr-stack"><button type="button" className="cr-button cr-button--quiet" disabled={disabled} onClick={()=>void resolve()}>Check my store</button>{outcome&&<span>{outcome.reason}</span>}{outcome?.state==='changed'&&<><span>{outcome.item?.name} · {outcome.item?.size??'Unknown'} bytes{outcome.item?.modified?` · Modified ${outcome.item.modified}`:''}</span>{group&&<label><input type="checkbox" disabled={disabled} checked={group.selected.some(item=>key(item)===key(reference))} onChange={event=>group.select(selection,event.target.checked)}/> Select changed file {reference.name}</label>}<button type="button" className="cr-button" disabled={disabled} onClick={()=>void resolve(true)}>Confirm changed file {reference.name}</button></>}{error&&<span role="alert">{error}</span>}</span>
}
