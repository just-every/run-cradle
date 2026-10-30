import type {RecordAutomationAction} from '../../domains/automations/contracts'
import type {EntitySchema} from '../../domains/records/contracts'
import {useResource} from '../shared/api'
import {ResourceState} from '../shared/presentation'

type Action=Extract<RecordAutomationAction,{kind:'apply_record_template'}>
export function RecordTemplateAction({action,onChange,appId}:{action:Action;onChange:(action:RecordAutomationAction)=>void;appId:string}){
 const tables=useResource<{items:EntitySchema[]}>(`/api/v1/apps/${appId}/entities`)
 return <div className="cr-stack"><ResourceState resource={tables.resource} operation="Template tables" retry={tables.refresh}>{data=><label className="cr-field">Template table<select aria-label="Template table" required value={action.entityId} onChange={event=>onChange({...action,entityId:event.target.value,templateId:''})}><option value="">Choose a table</option>{data.items.map(table=><option key={table.id} value={table.id}>{table.label}</option>)}</select></label>}</ResourceState>
  {action.entityId&&<TemplatePicker appId={appId} action={action} onChange={onChange}/>}
 </div>
}
function TemplatePicker({appId,action,onChange}:{appId:string;action:Action;onChange:(action:RecordAutomationAction)=>void}){
 const templates=useResource<{id:string;name:string;children:unknown[]}[]>(`/api/v1/apps/${appId}/entities/${action.entityId}/templates`)
 return <ResourceState resource={templates.resource} operation="Record templates" retry={templates.refresh}>{data=><><label className="cr-field">Record template<select aria-label="Record template" required value={action.templateId} onChange={event=>onChange({...action,templateId:event.target.value})}><option value="">Choose a template</option>{data.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label>{data.length===0&&<p>Save a record as a template in this table first.</p>}<p>The template creates a new record and its child records together.</p></>}</ResourceState>
}
