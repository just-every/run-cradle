import {SlackAppAction} from './slack-app-action'
import { useState } from 'react'
import type { EntitySchema } from '../../domains/records/contracts'
import type { RecordAutomationAction } from '../../domains/automations/contracts'
import { createUlid } from '../../core/shared/ids'
import { readApi } from '../shared/api'
import { FieldInput } from '../records/record-fields'
type Recipient={id:string;displayName:string}
export function AutomationActionEditor({action,onChange,entity,appId,recipients}:{action:RecordAutomationAction;
 onChange:(action:RecordAutomationAction)=>void;entity:EntitySchema;appId:string;recipients:Recipient[]}) {
 const [url,setUrl]=useState(''),[signingKey,setSigningKey]=useState<string|null>(null)
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const writable=entity.fields.filter(field=>!field.readOnly&&field.type!=='computed')
 function select(kind:RecordAutomationAction['kind']) {
  setSigningKey(null);setError(null);setUrl('')
  if(kind==='notify')onChange({kind,operatorId:'',title:'A record changed'})
  else if(kind==='email')onChange({kind,operatorId:'',subject:'A record changed',text:''})
  else if(kind==='sms')onChange({kind,fieldId:'',text:''})
  else if(kind==='update')onChange({kind,fieldId:writable[0]?.id??'',value:null})
  else if(kind==='slack-app')onChange({kind,channelId:'',text:'A record needs approval',fieldId:writable[0]?.id??'',approveValue:null,rejectValue:null})
  else if(kind==='slack')onChange({kind,destinationId:'',text:''})
  else onChange({kind,destinationId:''})
 }
 async function saveDestination() {
  if(action.kind!=='webhook'&&action.kind!=='slack')return
  setBusy(true);setError(null);setSigningKey(null)
  try {
   const answer=await readApi<{id:string;kind:'webhook'|'slack';signingKey?:string}>('/api/user-automations/destinations',
    {method:'POST',body:JSON.stringify({commandId:createUlid(),appId,entityId:entity.id,kind:action.kind,url})})
   onChange({...action,destinationId:answer.data.id});setSigningKey(answer.data.signingKey??null);setUrl('')
  }catch(e){setError(e instanceof Error?e.message:'Could not save the destination.')}finally{setBusy(false)}
 }
 return <div className="cr-stack">
  <label className="cr-field">Action<select value={action.kind} onChange={event=>select(event.target.value as RecordAutomationAction['kind'])}>
   <option value="notify">Notify a member</option><option value="email">Email a member</option><option value="sms">Send SMS</option><option value="update">Update a field</option><option value="webhook">Signed webhook</option><option value="slack">Slack message</option><option value="slack-app">Slack app approval</option></select></label>
  {(action.kind==='notify'||action.kind==='email')&&<label className="cr-field">Recipient<select required value={action.operatorId} onChange={event=>onChange({...action,operatorId:event.target.value})}>
   <option value="">Choose a member</option>{recipients.map(recipient=><option key={recipient.id} value={recipient.id}>{recipient.displayName}</option>)}</select></label>}
  {action.kind==='notify'&&<label className="cr-field">Notification title<input required maxLength={200} value={action.title} onChange={event=>onChange({...action,title:event.target.value})}/></label>}
  {action.kind==='email'&&<><label className="cr-field">Subject<input required maxLength={200} value={action.subject} onChange={event=>onChange({...action,subject:event.target.value})}/></label>
   <label className="cr-field">Message<textarea required maxLength={4000} value={action.text} onChange={event=>onChange({...action,text:event.target.value})}/></label><p className="cr-muted">The recipient must still be able to read the record when the email is sent.</p></>}
  {action.kind==='slack-app'&&<SlackAppAction appId={appId} entity={entity} action={action} onChange={onChange}/>}
  {action.kind==='sms'&&<><label className="cr-field">Phone field<select required value={action.fieldId} onChange={event=>onChange({...action,fieldId:event.target.value})}><option value="">Choose a text field</option>{entity.fields.filter(field=>field.type==='text'||field.type==='computed'&&field.resultElementType==='text').map(field=><option key={field.id} value={field.id}>{field.label}</option>)}</select></label>
   <label className="cr-field">SMS message<textarea required maxLength={1600} value={action.text} onChange={event=>onChange({...action,text:event.target.value})}/></label>
   <label className="cr-field">Insert record value<select value="" onChange={event=>{if(event.target.value)onChange({...action,text:action.text+'{{'+event.target.value+'}}'})}}><option value="">Choose a field to insert</option>{entity.fields.map(field=><option key={field.id} value={field.id}>{field.label}</option>)}</select></label><p>Numbers use E.164 with a US default. STOP suppresses later messages; START restores them.</p></>}
  {action.kind==='update'&&<><label className="cr-field">Field<select required value={action.fieldId} onChange={event=>onChange({...action,fieldId:event.target.value,value:null})}>
   <option value="">Choose a field</option>{writable.map(field=><option key={field.id} value={field.id}>{field.label}</option>)}</select></label>
   {writable.find(field=>field.id===action.fieldId)&&<FieldInput entityId={entity.id} appId={appId} field={writable.find(field=>field.id===action.fieldId)!} value={action.value} onChange={value=>onChange({...action,value})}/>}</>}
  {(action.kind==='webhook'||action.kind==='slack')&&<>
   {action.destinationId?<p>Private destination saved. To rotate it, save a new URL.</p>:null}
   <label className="cr-field">{action.kind==='slack'?'Slack incoming webhook URL':'HTTPS receiver URL'}<input type="url" value={url} onChange={event=>setUrl(event.target.value)} autoComplete="off" spellCheck={false} placeholder="https://"/></label>
   <button className="cr-button cr-button--quiet" type="button" disabled={busy||!url} onClick={()=>void saveDestination()}>{busy?'Saving…':'Save private destination'}</button>
   {signingKey&&<section className="cr-card"><h4>Copy the signing key now</h4><p>Give this key to your receiver to verify webhooks. It is shown once.</p><textarea aria-label="Webhook signing key" readOnly value={signingKey} rows={2} spellCheck={false}/><button className="cr-button cr-button--quiet" type="button" onClick={()=>setSigningKey(null)}>I saved the signing key</button></section>}
   <p className="cr-muted">Outbound actions require the configured trusted egress relay.</p>
  </>}
  {action.kind==='slack'&&<label className="cr-field">Slack message<textarea required maxLength={3000} value={action.text} onChange={event=>onChange({...action,text:event.target.value})}/></label>}
  {error&&<p className="cr-error" role="alert">{error}</p>}
 </div>
}
