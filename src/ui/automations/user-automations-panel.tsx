import '../records/records.css'
import { useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
import { createUlid } from '../../core/shared/ids'
import { readApi,useResource } from '../shared/api'
import { ResourceState,Empty,Timestamp } from '../shared/presentation'
import { AutomationDefinitionEditor,type SavedAutomation } from './definition-editor'
import { AutomationRunHistory } from './run-history'

export function UserAutomationsPanel() {
 const apps=useResource<Page<{id:string;name:string}>>('/api/v1/apps'),[appId,setAppId]=useState('')
 return <section className="cr-page cr-stack" aria-label="Record automations"><header><h1>Record automations</h1><p>Choose a record trigger and the actions it should run. Your saved approval is bounded by your current access and expiry.</p></header>
  <ResourceState resource={apps.resource} operation="applications" retry={apps.refresh}>{page=><>
   <label className="cr-field">Application<select value={appId} onChange={event=>setAppId(event.target.value)}><option value="">Choose an application</option>{page.items.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
   {appId&&<ApplicationAutomations key={appId} appId={appId}/>}</>}</ResourceState>
 </section>
}
function ApplicationAutomations({appId}:{appId:string}) {
 const entities=useResource<Page<EntitySchema>>(`/api/v1/apps/${encodeURIComponent(appId)}/entities`)
 const automations=useResource<{automations:SavedAutomation[]}>(`/api/user-automations?appId=${encodeURIComponent(appId)}`)
 const [entityId,setEntityId]=useState(''),[editing,setEditing]=useState<SavedAutomation|'new'|null>(null)
 const [history,setHistory]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 async function disable(automation:SavedAutomation) {
  setBusy(true);setError(null)
  try{await readApi(`/api/user-automations/${automation.id}/disable`,{method:'POST',body:JSON.stringify({commandId:createUlid(),version:automation.version})});automations.refresh()}
  catch(e){setError(e instanceof Error?e.message:'Could not disable the automation.')}finally{setBusy(false)}
 }
 return <ResourceState resource={automations.resource} operation="record automations" retry={automations.refresh}>{data=><div className="cr-stack">
  <ResourceState resource={entities.resource} operation="record types" retry={entities.refresh}>{page=>{
   const chosen=page.items.find(entity=>entity.id===(editing&&editing!=='new'?editing.definition.entityId:entityId))
   return <><div className="cr-toolbar"><label className="cr-field">Record type<select value={entityId} onChange={event=>{setEntityId(event.target.value);setEditing(null)}}><option value="">Choose a record type</option>{page.items.map(entity=><option key={entity.id} value={entity.id}>{entity.label}</option>)}</select></label>
    <button className="cr-button" disabled={!entityId||busy} onClick={()=>setEditing('new')}>New automation</button></div>
    {editing&&chosen&&<AutomationDefinitionEditor key={editing==='new'?`new:${chosen.id}`:`${editing.id}:${editing.version}`} appId={appId} entity={chosen} existing={editing==='new'?undefined:editing}
     onSaved={()=>{setEditing(null);automations.refresh()}} onCancel={()=>setEditing(null)}/>}</>
  }}</ResourceState>
  {error&&<p className="cr-error" role="alert">{error}</p>}
  {data.automations.length?data.automations.map(automation=><article className="cr-card cr-stack" key={automation.id}><h3>{automation.definition.name}</h3>
   <p>{automation.definition.enabled?'Enabled':'Disabled'} · {automation.definition.event==='created'?'Record created':'Record updated'} · {automation.definition.actions.map(action=>action.kind).join(', ')}</p>
   <p>Approval expires {automation.expiresAt?<Timestamp value={automation.expiresAt}/>:'before imported definitions can run'}</p>
   <div className="cr-toolbar"><button className="cr-button cr-button--quiet" disabled={busy} onClick={()=>setEditing(automation)}>Edit {automation.definition.name}</button>
    {automation.definition.enabled&&<button className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void disable(automation)}>Disable {automation.definition.name}</button>}
    <button className="cr-button cr-button--quiet" onClick={()=>setHistory(history===automation.id?null:automation.id)}>Run history for {automation.definition.name}</button></div>
   {history===automation.id&&<AutomationRunHistory id={automation.id}/>}</article>):<Empty title="No record automations">Create one for new matching record changes.</Empty>}
 </div>}</ResourceState>
}
