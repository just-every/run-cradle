import { useState,type FormEvent } from 'react'
import type { EntitySchema } from '../../domains/records/contracts'
import type { RecordAutomationDefinition } from '../../domains/automations/contracts'
import { createUlid } from '../../core/shared/ids'
import { readApi,useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'
import { AutomationActionEditor } from './action-editor'
export type SavedAutomation={id:string;version:number;definitionVersion:number;definition:RecordAutomationDefinition;expiresAt:string|null}
export function AutomationDefinitionEditor({appId,entity,existing,onSaved,onCancel}:{appId:string;entity:EntitySchema;
 existing?:SavedAutomation;onSaved:()=>void;onCancel:()=>void}) {
 const [definition,setDefinition]=useState<RecordAutomationDefinition>(existing?.definition??{
  name:'',appId,entityId:entity.id,event:'created',enabled:true,actions:[{kind:'notify',operatorId:'',title:'A record was created'}]})
 const [days,setDays]=useState(7),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const recipients=useResource<{recipients:{id:string;displayName:string}[]}>(`/api/user-automations/recipients?appId=${encodeURIComponent(appId)}&entityId=${encodeURIComponent(entity.id)}`)
 async function save(event:FormEvent) {
  event.preventDefault();setBusy(true);setError(null)
  try {
   await readApi('/api/user-automations',{method:'POST',body:JSON.stringify({commandId:createUlid(),
    ...(existing?{id:existing.id,version:existing.version}:{}),expiresAt:new Date(Date.now()+days*86400000).toISOString(),definition})})
   onSaved()
  }catch(e){setError(e instanceof Error?e.message:'Could not save the automation.')}finally{setBusy(false)}
 }
 return <form className="cr-card cr-stack" onSubmit={save} aria-label="Automation definition">
  <h3>{existing?'Edit automation':'New automation'} · {entity.label}</h3>
  <label className="cr-field">Automation name<input required maxLength={100} value={definition.name} onChange={event=>setDefinition({...definition,name:event.target.value})}/></label>
  <label className="cr-field">When<select value={definition.event} onChange={event=>setDefinition({...definition,event:event.target.value as 'created'|'updated'})}>
   <option value="created">A record is created</option><option value="updated">A record is updated</option></select></label>
  <ResourceState resource={recipients.resource} operation="automation recipients" retry={recipients.refresh}>{data=><div className="cr-stack">
   {definition.actions.map((action,index)=><fieldset key={index} className="cr-card cr-stack"><legend>Action {index+1}</legend>
    <AutomationActionEditor appId={appId} entity={entity} recipients={data.recipients} action={action} onChange={next=>setDefinition({...definition,actions:definition.actions.map((old,position)=>position===index?next:old)})}/>
    {definition.actions.length>1&&<button className="cr-button cr-button--quiet" type="button" onClick={()=>setDefinition({...definition,actions:definition.actions.filter((_,position)=>position!==index)})}>Remove action {index+1}</button>}
   </fieldset>)}
  </div>}</ResourceState>
  <button className="cr-button cr-button--quiet" type="button" disabled={definition.actions.length>=10} onClick={()=>setDefinition({...definition,actions:[...definition.actions,{kind:'notify',operatorId:'',title:'A record changed'}]})}>Add action</button>
  <label className="cr-field">Approve for<select value={days} onChange={event=>setDays(Number(event.target.value))}>{[7,14,30].map(day=><option key={day} value={day}>{day} days</option>)}</select></label>
  <label><input type="checkbox" checked={definition.enabled} onChange={event=>setDefinition({...definition,enabled:event.target.checked})}/> Enable after saving</label>
  <p className="cr-muted">Runs use your current record policy. After approval expires, save again to renew it. Updates cannot repeat the same automation in a chain.</p>
  {error&&<p className="cr-error" role="alert">{error}</p>}
  <div className="cr-toolbar"><button className="cr-button" disabled={busy||recipients.resource.state!=='ready'}>{busy?'Saving…':'Save automation'}</button><button className="cr-button cr-button--quiet" type="button" onClick={onCancel} disabled={busy}>Cancel</button></div>
 </form>
}
