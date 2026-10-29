import '../records.css'
import {useState} from 'react'
import type {InterfaceDefinition} from '../../../domains/records/interfaces/contracts'
import type {BaseAccess} from '../../../domains/records/manual/base-role'
import {OperatorFeaturePage} from '../../../core/app/screens/operator-feature-page'
import {useResource} from '../../shared/api'
import {Empty,ResourceState} from '../../shared/presentation'
import {InterfaceCanvas} from './canvas'
import {InterfaceEditor} from './editor'
import {InterfaceHistory} from './history'
import {InterfaceDelete,InterfaceTrash} from './trash'
export function InterfaceListPage({appId}:{appId:string}){
 const interfaces=useResource<{items:InterfaceDefinition[]}>(`/api/v1/apps/${appId}/interfaces`),access=useResource<BaseAccess>(`/api/v1/records/bases/${appId}/access`)
 const [creating,setCreating]=useState(false)
 return <OperatorFeaturePage currentPath="/app/records" title=""><div className="cr-page cr-records-page cr-stack"><a className="cr-link" href={`/app/records/${appId}`}>← Back to base</a><h1>Interfaces</h1><p>Focused pages over this base. Your record permissions apply in every component.</p>{access.resource.state==='ready'&&access.resource.data.canAdopt&&<details className="cr-detail"><summary>Settings</summary>{creating?<InterfaceEditor appId={appId} onClose={()=>setCreating(false)} onSaved={value=>{window.location.assign(`/app/interfaces/${value.id}`)}}/>:<button type="button" className="cr-button cr-button--quiet" onClick={()=>setCreating(true)}>Create interface</button>}<InterfaceTrash appId={appId} onRestored={interfaces.refresh}/></details>}<ResourceState resource={interfaces.resource} operation="published interfaces" retry={interfaces.refresh}>{data=>data.items.length?<div className="cr-stack">{data.items.map(value=><article key={value.id} className="cr-card"><h2><a className="cr-link" href={`/app/interfaces/${value.id}`}>{value.name}</a></h2><p>{value.pages.length} pages · Version {value.version}</p></article>)}</div>:<Empty headingLevel={2} title="No published interfaces">A creator or base owner can publish pages from Settings.</Empty>}</ResourceState></div></OperatorFeaturePage>
}
export function InterfacePage({interfaceId}:{interfaceId:string}){
 const current=useResource<InterfaceDefinition>(`/api/v1/interfaces/${interfaceId}`)
 const [editing,setEditing]=useState(false)
 return <OperatorFeaturePage currentPath="/app/records" title=""><div className="cr-page cr-records-page cr-stack"><ResourceState resource={current.resource} operation="interface" retry={current.refresh}>{definition=><><a className="cr-link" href={`/app/records/${definition.appId}/interfaces`}>← Interfaces</a><header><h1>{definition.name}</h1><p>Version {definition.version} · Published {new Date(definition.updatedAt).toLocaleString()}</p></header><InterfaceCanvas key={`${definition.id}:${definition.version}`} definition={definition}/>{definition.canEdit&&<details className="cr-detail"><summary>Settings</summary>{editing?<InterfaceEditor key={definition.version} appId={definition.appId} initial={definition} onSaved={()=>{setEditing(false);current.refresh()}} onClose={()=>setEditing(false)}/>:<button type="button" className="cr-button cr-button--quiet" onClick={()=>setEditing(true)}>Edit interface</button>}<InterfaceHistory definition={definition} onRestored={()=>{setEditing(false);current.refresh()}}/><InterfaceDelete definition={definition}/></details>}</>}</ResourceState></div></OperatorFeaturePage>
}
