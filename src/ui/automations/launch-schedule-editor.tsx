import { useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema,RecordRow } from '../../domains/records/contracts'
import { LAUNCH_APP_ID,launchEntities } from '../../apps/launch/contracts'
import { useResource } from '../shared/api'
import { useCommand } from '../shared/command'
import { CommandFeedback,ResourceState } from '../shared/presentation'
import { recordLabel } from '../records/record-label'
import { LaunchOwnerPicker } from '../launch/owner-picker'

/** Uses the installed Launch schedule engine and its normal admitted command. */
export function LaunchScheduleEditor({onSaved}:{onSaved:()=>void}) {
 const [open,setOpen]=useState(false)
 return <section className="cr-card cr-stack" aria-label="Launch scheduled automations"><h2>Launch scheduled automations</h2>
  <p>Run a daily or weekly action for a Launch campaign. Times follow the workspace timezone. For your other bases, use the record triggers above.</p>
  {!open?<button className="cr-button" onClick={()=>setOpen(true)}>New scheduled automation</button>:
   <ScheduleForm onSaved={()=>{setOpen(false);onSaved()}} onCancel={()=>setOpen(false)}/>}
 </section>
}
function ScheduleForm({onSaved,onCancel}:{onSaved:()=>void;onCancel:()=>void}) {
 const settings=useResource<{timezone:string}>('/api/v1/settings')
 const entities=useResource<Page<EntitySchema>>(`/api/v1/apps/${LAUNCH_APP_ID}/entities`)
 const campaigns=useResource<Page<RecordRow>>(`/api/v1/apps/${LAUNCH_APP_ID}/entities/${launchEntities.campaign}/records`)
 const command=useCommand(),[name,setName]=useState(''),[frequency,setFrequency]=useState('daily'),[weekday,setWeekday]=useState('1')
 const [time,setTime]=useState('08:00'),[campaignId,setCampaignId]=useState(''),[kind,setKind]=useState('add-activity')
 const [operatorId,setOperatorId]=useState(''),[title,setTitle]=useState(''),[body,setBody]=useState('')
 const busy=!['idle','failed'].includes(command.result.state)
 return <ResourceState resource={settings.resource} operation="workspace timezone" retry={settings.refresh}>{workspace=>
  <form className="cr-stack" aria-label="Scheduled automation definition" onSubmit={async event=>{
   event.preventDefault()
   const action=kind==='add-activity'?{command:kind,input:{campaignId,message:body}}:
    {command:kind,input:{operatorId,subjectId:campaignId,title,body}}
   const saved=await command.submit('/api/v1/commands/launch.automation.save',{definition:{name,enabled:true,
    trigger:{kind:'schedule',localRule:`${frequency}${frequency==='weekly'?` ${weekday}`:''} ${time}`,timezone:workspace.timezone},actions:[action]}},[])
   if(saved)onSaved()
  }}>
   <fieldset className="cr-stack" disabled={busy}>
    <label className="cr-field">Scheduled automation name<input required maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label>
    <label className="cr-field">Repeat<select value={frequency} onChange={event=>setFrequency(event.target.value)}><option value="daily">Every day</option><option value="weekly">Every week</option></select></label>
    {frequency==='weekly'&&<label className="cr-field">Day<select value={weekday} onChange={event=>setWeekday(event.target.value)}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label>}
    <label className="cr-field">Time · {workspace.timezone}<input required type="time" value={time} onChange={event=>setTime(event.target.value)}/></label>
    <ResourceState resource={entities.resource} operation="Launch schema" retry={entities.refresh}>{schemas=>
     <ResourceState resource={campaigns.resource} operation="Launch campaigns" retry={campaigns.refresh}>{page=>{
      const schema=schemas.items.find(entity=>entity.id===launchEntities.campaign)
      return <label className="cr-field">Launch campaign<select required value={campaignId} onChange={event=>setCampaignId(event.target.value)}><option value="">Choose a campaign</option>{schema&&page.items.filter(record=>record.lifecycle!=='Archived').map(record=><option key={record.id} value={record.id}>{recordLabel(record,schema)}</option>)}</select>{!page.items.length&&<span>Create a Launch campaign in Records first.</span>}</label>
     }}</ResourceState>}</ResourceState>
    <label className="cr-field">Action<select value={kind} onChange={event=>setKind(event.target.value)}><option value="add-activity">Add campaign activity</option><option value="notify-operator">Notify a person</option><option value="send-email">Email a person</option></select></label>
    {kind!=='add-activity'&&<><label className="cr-field" htmlFor="scheduled-recipient">Person<LaunchOwnerPicker id="scheduled-recipient" value={operatorId} onChange={setOperatorId}/></label>
     <label className="cr-field">{kind==='send-email'?'Email subject':'Notification title'}<input required maxLength={200} value={title} onChange={event=>setTitle(event.target.value)}/></label></>}
    <label className="cr-field">Message<textarea required maxLength={1000} value={body} onChange={event=>setBody(event.target.value)}/></label>
    {kind==='send-email'&&<p>Email waits until the workspace quiet hours end.</p>}
   </fieldset>
   <CommandFeedback {...command}/>
   <div className="cr-toolbar"><button className="cr-button" disabled={busy||!campaignId}>{busy?'Saving…':'Save scheduled automation'}</button><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>}</ResourceState>
}
