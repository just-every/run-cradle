import type {RecordAutomationDefinition} from './contracts'
import {automationDefinitionActions} from './control-contracts'
import {canonicalJson} from '../authority/grants.server'

/** Audit committed differences, never caller-provided operation labels or values. */
export function automationConfigurationAudit(prior:{definition:RecordAutomationDefinition;enabled:boolean;expiresAt:number|null}|null,next:RecordAutomationDefinition,expiresAt:string):string[]{
 if(!prior)return ['automation.create']
 const actions:string[]=[]
 if(prior.enabled!==next.enabled)actions.push(next.enabled?'automation.enable':'automation.disable')
 const destinations=(definition:RecordAutomationDefinition)=>automationDefinitionActions(definition).flatMap<{kind:string;destination:string}>(action=>{
  if(action.kind==='webhook'||action.kind==='slack')return [{kind:action.kind,destination:action.destinationId}]
  if(action.kind==='email'||action.kind==='notify')return [{kind:action.kind,destination:action.operatorId}]
  if(action.kind==='sms')return [{kind:action.kind,destination:action.fieldId}]
  if(action.kind==='slack-app')return [{kind:action.kind,destination:action.channelId}]
  return []
 })
 if(canonicalJson(destinations(prior.definition))!==canonicalJson(destinations(next)))actions.push('automation.destination.change')
 const content=(value:unknown):unknown=>Array.isArray(value)?value.map(content):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['enabled','destinationId','operatorId','channelId'].includes(key)).map(([key,item])=>[key,content(item)])):value
 if(canonicalJson(content(prior.definition))!==canonicalJson(content(next)))actions.push('automation.edit')
 if(prior.expiresAt!==Date.parse(expiresAt))actions.push('automation.renew')
 return actions.length?actions:['automation.renew']
}
