import {useId} from 'react'
import type {RecordAutomationAction} from '../../domains/automations/contracts'
import type {EntitySchema} from '../../domains/records/contracts'
import {useResource} from '../shared/api'
import {ResourceState} from '../shared/presentation'
import {FieldInput} from '../records/record-fields'
export function SlackAppAction({action,onChange,entity,appId}:{action:Extract<RecordAutomationAction,{kind:'slack-app'}>;onChange:(action:RecordAutomationAction)=>void;entity:EntitySchema;appId:string}){
 const channels=useResource<{channels:{id:string;name:string}[]}>('/api/user-automations/slack/channels'),inputId=useId(),writable=entity.fields.filter(field=>!field.readOnly&&field.type!=='computed'),field=writable.find(field=>field.id===action.fieldId)
 return <div className="cr-stack"><ResourceState resource={channels.resource} operation="Slack channels" retry={channels.refresh}>{data=><label className="cr-field">Slack channel<select required value={action.channelId} onChange={event=>onChange({...action,channelId:event.target.value})}><option value="">Choose a channel</option>{data.channels.map(channel=><option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>}</ResourceState>
  <label className="cr-field">Slack app message<textarea required maxLength={3000} value={action.text} onChange={event=>onChange({...action,text:event.target.value})}/></label>
  <label className="cr-field">Approval field<select required value={action.fieldId} onChange={event=>onChange({...action,fieldId:event.target.value,approveValue:null,rejectValue:null})}><option value="">Choose a field</option>{writable.map(field=><option key={field.id} value={field.id}>{field.label}</option>)}</select></label>
  {field&&<><fieldset className="cr-stack"><legend>Approve result</legend><FieldInput inputId={inputId+'-approve'} appId={appId} entityId={entity.id} field={field} value={action.approveValue} onChange={approveValue=>onChange({...action,approveValue})}/></fieldset><fieldset className="cr-stack"><legend>Reject result</legend><FieldInput inputId={inputId+'-reject'} appId={appId} entityId={entity.id} field={field} value={action.rejectValue} onChange={rejectValue=>onChange({...action,rejectValue})}/></fieldset></>}
  <p>Button clicks use the linked person’s current write access. Stale records and unauthorized clicks leave the record unchanged.</p>
 </div>
}
