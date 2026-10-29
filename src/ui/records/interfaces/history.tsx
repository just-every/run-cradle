import {useState} from 'react'
import type {InterfaceDefinition} from '../../../domains/records/interfaces/contracts'
import {createUlid} from '../../../core/shared/ids'
import {readApi,useResource} from '../../shared/api'
import {ResourceState} from '../../shared/presentation'
import {InterfaceCanvas} from './canvas'
export function InterfaceHistory({definition,onRestored}:{definition:InterfaceDefinition;onRestored(value:InterfaceDefinition):void}){
 const versions=useResource<{items:{version:number;authorId:string|null;createdAt:string}[]}>(`/api/v1/interfaces/${definition.id}/versions`)
 const [selected,setSelected]=useState<number|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const snapshot=useResource<InterfaceDefinition>(selected===null?null:`/api/v1/interfaces/${definition.id}/versions/${selected}`)
 async function restore(){setBusy(true);setError('');try{const result=await readApi<InterfaceDefinition>(`/api/v1/interfaces/${definition.id}/restore`,{method:'POST',body:JSON.stringify({commandId:createUlid(),version:definition.version,restoreVersion:selected})});onRestored(result.data)}catch(error){setError((error as Error).message)}finally{setBusy(false)}}
 return <section className="cr-stack"><h2>Published versions</h2><ResourceState resource={versions.resource} operation="interface history" retry={versions.refresh}>{data=><div className="cr-actions">{data.items.map(item=><button className="cr-button cr-button--quiet" type="button" key={item.version} onClick={()=>setSelected(item.version)}>Open version {item.version}</button>)}</div>}</ResourceState>{selected!==null&&<ResourceState resource={snapshot.resource} operation="published version" retry={snapshot.refresh}>{value=><section className="cr-stack"><p>Read-only layout from version {value.version}. Record values use your current permissions and current data.</p><InterfaceCanvas key={`${value.id}:${value.version}`} definition={value} readOnly/>{value.version!==definition.version&&<button type="button" className="cr-button" disabled={busy} onClick={()=>void restore()}>Restore version {value.version}</button>}</section>}</ResourceState>}{error&&<p role="alert" className="cr-error">{error}</p>}</section>
}
