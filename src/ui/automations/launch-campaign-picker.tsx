import { useEffect,useReducer,useRef,useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema,RecordRow } from '../../domains/records/contracts'
import { LAUNCH_APP_ID,launchEntities } from '../../apps/launch/contracts'
import { readApi,RequestFailure,type Resource } from '../shared/api'
import { ResourceState } from '../shared/presentation'
import { recordLabel } from '../records/record-label'

type Choices={schema:EntitySchema;records:RecordRow[];nextCursor:string|null}
/** Read through the same policy-scoped schema and POST query doors as Records. */
export function LaunchCampaignPicker({value,onChange}:{value:string;onChange:(value:string)=>void}) {
 const [cursor,setCursor]=useState<string>(),[revision,retry]=useReducer(value=>value+1,0)
 const [resource,setResource]=useState<Resource<Choices>>({state:'loading',data:null})
 const loaded=useRef<RecordRow[]>([])
 useEffect(()=>{
  const abort=new AbortController(),base=`/api/v1/apps/${LAUNCH_APP_ID}/entities/${launchEntities.campaign}`
  setResource({state:'loading',data:null})
  void Promise.all([readApi<EntitySchema>(base,undefined,abort.signal),
   readApi<Page<RecordRow>>(`${base}/query`,{method:'POST',body:JSON.stringify({limit:50,...(cursor?{cursor}:{})})},abort.signal)])
   .then(([schema,page])=>{
    if(abort.signal.aborted)return
    loaded.current=cursor?[...loaded.current,...page.data.items]:page.data.items
    setResource({state:'ready',data:{schema:schema.data,records:loaded.current,nextCursor:page.data.nextCursor}})
   },cause=>{
    if(abort.signal.aborted)return
    const error=cause instanceof RequestFailure?cause:new RequestFailure(0,{requestId:'',operation:'Launch campaigns',code:'internal',message:'Could not load Launch campaigns.',retry:'read'})
    setResource({state:error.status===401?'signed_out':error.status===403?'forbidden':error.status===404?'not_found':'failed',data:null,error})
   })
  return ()=>abort.abort()
 },[cursor,revision])
 return <ResourceState resource={resource} operation="Launch campaigns" retry={retry}>{data=><div className="cr-stack">
  <label className="cr-field">Launch campaign<select required value={value} onChange={event=>onChange(event.target.value)}>
   <option value="">Choose a campaign</option>{data.records.filter(record=>record.lifecycle!=='archived').map(record=><option key={record.id} value={record.id}>{recordLabel(record,data.schema)}</option>)}
  </select>{!data.records.length&&<span>Create a Launch campaign in Records first.</span>}</label>
  {data.nextCursor&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>setCursor(data.nextCursor!)}>Load more campaigns</button>}
 </div>}</ResourceState>
}
