import {authorizeCreateAction} from './create-action.server'
import {authorizeTemplateAction,type AutomationTemplates} from './template-action.server'
import type {PolicyPort} from '../authority/ports'
import type {SqlPredicate} from '../admission/ports'
import {smsInput} from '../sms/dispatch.server'
import type {RequestContext,PolicyScope} from '../authority/ports'
import type {RecordRow} from '../records/contracts'
import type {CellValue} from '../../contracts/primitives'
import type {RecordAutomationDefinition} from './contracts'
import type {DescriptorRegistry} from '../records/descriptors.server'
import type {EntityRegistry} from '../authority/scope.server'
import type {createAutomationDestinations} from './destinations.server'
import {automationRecipient} from './recipients.server'
import {validateCell} from '../records/validators'
import {delegationCommandId} from '../authority/user-delegation.server'
export type TestStep={position:number;id:string;kind:string;input:unknown;output:unknown;state:string;errorCode?:string}
export type ConfirmationEffect={position:number;kind:string;destination:string}
export async function automationTestPreview(deps:{templates:AutomationTemplates;policy:PolicyPort;db:D1Database;entities:EntityRegistry;descriptors:DescriptorRegistry;destinations:ReturnType<typeof createAutomationDestinations>},ctx:RequestContext,scope:PolicyScope,id:string,definition:RecordAutomationDefinition,record:RecordRow,event:'created'|'updated'){
 const values:Record<string,CellValue>={};for(const [field,cell]of Object.entries(record.fields))if(cell.state==='value')values[field]=cell.value
 const steps:TestStep[]=[],confirmationEffects:ConfirmationEffect[]=[],guards:SqlPredicate[]=[],matches=event===definition.event
 for(let position=0;position<definition.actions.length;position++){
  const action=definition.actions[position],stepId=await delegationCommandId(id,String(position)),step:TestStep={position,id:stepId,kind:action.kind,input:{action,recordId:record.id,values:structuredClone(values)},output:null,state:matches?'Preview':'Skipped'}
  if(matches)try{
   if(action.kind==='create'){
    const checked=await authorizeCreateAction(deps,ctx,definition.appId,definition.entityId,action)
    guards.push(...checked.guards)
    step.output={appId:definition.appId,entityId:checked.entityId,values:checked.values,created:false,...(checked.entityId!==definition.entityId?{entityLabel:checked.entityLabel,fields:checked.fields}:{})}
    confirmationEffects.push({position,kind:'create',destination:checked.entityId})
   }else if(action.kind==='apply_record_template'){
    const checked=await authorizeTemplateAction(deps,ctx,definition.appId,action)
    guards.push(...checked.guards)
    step.output={templateId:checked.template.id,name:checked.template.name,version:checked.template.version,parentEntityId:action.entityId,childCount:checked.template.children.length,created:false}
    confirmationEffects.push({position,kind:action.kind,destination:`${action.entityId}/${checked.template.id}@${checked.template.version}`})
   }else if(action.kind==='update'){
    const field=deps.descriptors.get(definition.appId,definition.entityId).fields.get(action.fieldId)?.field
    if(!field||field.readOnly||field.type==='computed'||!scope.writableFieldIds.includes(field.id))throw new Error('The selected field is no longer writable.')
    validateCell(field,action.value);step.output={fieldId:field.id,before:values[field.id]??null,after:action.value};values[field.id]=action.value
   }else if(action.kind==='slack-app'){
    const field=deps.descriptors.get(definition.appId,definition.entityId).fields.get(action.fieldId)?.field
    if(!field||field.readOnly||field.type==='computed'||!scope.writableFieldIds.includes(field.id))throw new Error('The Slack decision field is no longer writable.')
    validateCell(field,action.approveValue);validateCell(field,action.rejectValue)
    step.output={channelId:action.channelId,text:action.text,fieldId:action.fieldId,approveValue:action.approveValue,rejectValue:action.rejectValue,sent:false};confirmationEffects.push({position,kind:'slack-app',destination:action.channelId})
   }else if(action.kind==='sms'){
    const sms=smsInput(action,record,scope,deps.descriptors);step.output={to:sms.to,text:sms.body,sent:false};confirmationEffects.push({position,kind:'sms',destination:sms.to})
   }else if(action.kind==='notify'||action.kind==='email'){
    const recipient=await automationRecipient(deps.db,deps.entities,ctx,{...record.ref,operatorId:action.operatorId})
    confirmationEffects.push({position,kind:action.kind,destination:recipient.email})
    step.output=action.kind==='notify'?{wouldNotify:recipient.email,builderOnly:true,sent:false}:{wouldHaveUsed:[recipient.email],subject:action.subject,text:action.text,sent:false}
   }else{
    const wire=await deps.destinations.preview(ctx,definition.appId,action,record.ref,event,record.version,stepId)
    step.output={wire,sent:false};confirmationEffects.push({position,kind:action.kind,destination:wire.url})
   }
  }catch(error){step.state='Failed';step.errorCode=error instanceof Error&&'code'in error?String(error.code):'validation';step.output={error: error instanceof Error?error.message:'The action cannot be tested.'}}
  steps.push(step)
 }
 return {trigger:{event,expectedEvent:definition.event,matches,reason:matches?'The simulated event matches this record trigger.':'The simulated event does not match this record trigger.'},steps,confirmationEffects,guards}
}
