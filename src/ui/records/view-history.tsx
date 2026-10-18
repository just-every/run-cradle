import { useState } from 'react'
import { useResource } from '../shared/api'
import { Timestamp, ResourceState } from '../shared/presentation'
const actions={'view.save':'Saved view','view.delete':'Deleted view','view.restore':'Restored view'}
export function ViewHistory({id}:{id:string}){
 const [open,setOpen]=useState(false),history=useResource<{items:{id:string;action:'view.save'|'view.delete'|'view.restore';actor_name:string;created_at:string}[]}>(open?`/api/v1/views/${id}/history`:null)
 return <div><button className="cr-button cr-button--quiet" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>View history</button>{open&&<ResourceState resource={history.resource} operation="view history" retry={history.refresh}>{data=><section className="cr-records-panel"><h3>Recent view changes</h3>{data.items.length?<ol>{data.items.map(row=><li key={row.id}>{actions[row.action]} · {row.actor_name} · <Timestamp value={row.created_at} /></li>)}</ol>:<p>No recorded changes.</p>}</section>}</ResourceState>}</div>
}
