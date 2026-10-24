import {useState} from 'react'
import type {EntitySchema} from '../../domains/records/contracts'
import {readApi,useResource} from '../shared/api'
import {ResourceState} from '../shared/presentation'
export function SlackUnfurlFields(){
 const [appId,setAppId]=useState(''),[entityId,setEntityId]=useState(''),[selected,setSelected]=useState<string[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 const apps=useResource<{items:{id:string;name:string}[]}>('/api/v1/apps')
 const entities=useResource<{items:EntitySchema[]}>(appId?`/api/v1/apps/${appId}/entities`:null)
 const safety=useResource<{unfurlSafeFieldIds:string[];canManageUnfurls:boolean}>(appId&&entityId?`/api/user-automations/slack/settings?appId=${appId}&entityId=${entityId}`:null)
 return <section className="cr-stack" aria-label="Chat record-link previews"><h4>Record-link previews</h4><p>Previews include the primary field and the fields a base owner marks here, only when the person posting the link can read them.</p>
  <ResourceState resource={apps.resource} operation="preview bases" retry={apps.refresh}>{data=><label className="cr-field">Preview base<select value={appId} onChange={event=>{setAppId(event.target.value);setEntityId('');setSelected(null);setError(null)}}><option value="">Choose a base</option>{data.items.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label>}</ResourceState>
  {appId&&<ResourceState resource={entities.resource} operation="preview tables" retry={entities.refresh}>{data=><>
   <label className="cr-field">Preview table<select value={entityId} onChange={event=>{setEntityId(event.target.value);setSelected(null);setError(null)}}><option value="">Choose a table</option>{data.items.map(entity=><option key={entity.id} value={entity.id}>{entity.label}</option>)}</select></label>
   {entityId&&<ResourceState resource={safety.resource} operation="Chat preview fields" retry={safety.refresh}>{settings=>{const entity=data.items.find(item=>item.id===entityId),fields=selected??settings.unfurlSafeFieldIds;return <form className="cr-stack" onSubmit={async event=>{event.preventDefault();setBusy(true);setError(null);try{await readApi('/api/user-automations/slack/unfurl-fields',{method:'PUT',body:JSON.stringify({appId,entityId,fieldIds:fields})});setSelected(null);safety.refresh()}catch(e){setError(e instanceof Error?e.message:'Could not save preview fields.')}finally{setBusy(false)}}}>
    {!settings.canManageUnfurls&&<p>Only a base owner can change preview fields.</p>}
    <fieldset className="cr-stack" disabled={busy||!settings.canManageUnfurls}><legend>Fields safe to preview</legend>{entity?.fields.filter(field=>field.id!==entity.primaryFieldId).map(field=><label className="cr-choice" key={field.id}><input type="checkbox" checked={fields.includes(field.id)} onChange={event=>setSelected(event.target.checked?[...fields,field.id]:fields.filter(id=>id!==field.id))}/><span>{field.label}</span></label>)}<button className="cr-button" disabled={busy||!settings.canManageUnfurls}>Save preview fields</button></fieldset>
    {error&&<p className="cr-error" role="alert">{error}</p>}
   </form>}}</ResourceState>}
  </>}</ResourceState>}
 </section>
}
