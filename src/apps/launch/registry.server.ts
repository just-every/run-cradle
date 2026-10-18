import {prepareComment,prepareCommentDelete} from './comments.server'
import { canonicalHash } from '../../domains/admission/canonical'
import { prepareSupersede } from './supersede.server'
import { prepareAutomation } from './automations.server'
import { prepareAcknowledge } from './readiness.server'
import { prepareSamples } from './samples.server'
import { z } from 'zod'
import type { CommandRegistry } from '../../core/registry/commands'
import type { CommandInput, Json } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import type { AdmissionPlan } from '../../domains/admission/ports'
import { launchInputs, launchCommandSchema, type LaunchAction, LAUNCH_APP_ID, launchEntities } from './contracts'
import { prepareCampaign } from './campaigns.server'
import { prepareRecord } from './records.server'
import { prepareTransition } from './transitions.server'
import { prepareMilestone } from './milestones.server'
import { prepareDuplicate } from './duplicate.server'
import { prepareLens } from './lenses.server'
import { prepareCustomField } from './custom-fields.server'
import { prepareBulk } from './bulk.server'
import type { LaunchContext } from './domain.server'
export type LaunchHandler=(ctx:RequestContext,input:CommandInput<Record<string,unknown>>)=>Promise<AdmissionPlan<Json>>
export function createLaunchHandlers(context:LaunchContext):Partial<Record<LaunchAction,LaunchHandler>>{
 const handlers:Partial<Record<LaunchAction,LaunchHandler>>={}
 for(const action of Object.keys(launchInputs) as LaunchAction[]){const[kind,operation]=action.split('.')
  if(action==='comment.delete')handlers[action]=(ctx,input)=>prepareCommentDelete(context,ctx,input as CommandInput<{id:string;version:number}>)
  if(action==='comment.create')handlers[action]=(ctx,input)=>prepareComment(context,ctx,input as CommandInput<{campaignId:string;body:string;mentions:string[]}>)
  if(kind==='campaign'&&operation!=='duplicate')handlers[action]=(ctx,input)=>prepareCampaign(context,ctx,input,operation!)
  if(kind==='campaign'&&operation==='duplicate')handlers[action]=(ctx,input)=>prepareDuplicate(context,ctx,input as CommandInput<{id:string;newCode:string;newLaunchDate?:string}>)
  if((kind==='deliverable'||kind==='risk'||kind==='decision')&&['create','patch','delete'].includes(operation!))handlers[action]=(ctx,input)=>prepareRecord(context,ctx,input,kind,operation as 'create'|'patch'|'delete')
  if((kind==='deliverable'||kind==='risk'||kind==='decision')&&!['create','patch','delete','supersede'].includes(operation!))handlers[action]=(ctx,input)=>prepareTransition(context,ctx,input,kind,operation!)
  if(action==='decision.supersede')handlers[action]=(ctx,input)=>prepareSupersede(context,ctx,input)
  if(kind==='milestone')handlers[action]=(ctx,input)=>prepareMilestone(context,ctx,input,operation!)
  if(kind==='lens')handlers[action]=(ctx,input)=>prepareLens(context,ctx,input,operation!)
  if(kind==='custom-field')handlers[action]=(ctx,input)=>prepareCustomField(context,ctx,input,operation!)
  if(kind==='automation')handlers[action]=(ctx,input)=>prepareAutomation(context,ctx,input,operation!)
  if(kind==='readiness')handlers[action]=(ctx,input)=>prepareAcknowledge(context,ctx,input)
  if(kind==='samples')handlers[action]=(ctx,input)=>prepareSamples(context,ctx,input,operation!)
  if(kind==='bulk')handlers[action]=(ctx,input)=>prepareBulk(context,ctx,input,operation as 'apply'|'undo')
 }
 return handlers
}
export function registerLaunchCommands(registry:CommandRegistry,context:LaunchContext,extensions:Partial<Record<LaunchAction,LaunchHandler>>){
 const handlers={...createLaunchHandlers(context),...extensions}
 for(const action of Object.keys(launchInputs) as LaunchAction[]){const handler=handlers[action];if(!handler)throw new Error(`Missing launch command handler: ${action}`)}
 for(const action of Object.keys(launchInputs) as LaunchAction[])registry.register({action:'launch.'+action,description:`Launch ${action}`,inputSchema:z.toJSONSchema(launchCommandSchema(action)) as Json,input:launchCommandSchema(action),replayIdentity:async (_ctx,input)=>({appId:LAUNCH_APP_ID,canonicalInputHash:await canonicalHash({input:input.input,expected:input.expected})}),visible:async ctx=>{try{await context.policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,purpose:'read'});return true}catch{return false}},prepare:(ctx,input)=>handlers[action]!(ctx,input as CommandInput<Record<string,unknown>>)})
}
