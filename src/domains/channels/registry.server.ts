import {createDeliveryRetry} from './retry.server'
import {CHANNEL_ENTITIES} from './setup.server'
import {createDigestSettings,digestInput} from './digest-settings.server'
import { z } from 'zod'
import type { Json } from '../../contracts/primitives'
import type { CommandRegistry } from '../../core/registry/commands'
import type { SettingsDependencies } from './settings.server'
import { createChannelSettings,CHANNEL_APP } from './settings.server'
import { createChannelInbox } from './inbox.server'
import { workspaceChanges,preferenceInput } from './validators'
import { canonicalHash } from '../admission/canonical'
const expected=z.array(z.object({ref:z.object({appId:z.string(),entityId:z.string(),recordId:z.string()}).strict(),version:z.number().int().nonnegative()}).strict())
const envelope=<T extends z.ZodType>(input:T)=>z.object({commandId:z.string().min(1),expected,input}).strict()
export function registerChannelCommands(registry:CommandRegistry,deps:SettingsDependencies,access?:Parameters<typeof createChannelInbox>[2]){const settings=createChannelSettings(deps),inbox=createChannelInbox(deps.db,deps.policy,access,deps.entities)
 const visible=(action:string)=>async(ctx:Parameters<typeof deps.policy.authorize>[0])=>{try{if(action.startsWith('notification.')||action==='preferences.update'||action==='delivery.retry'){await deps.policy.scope(ctx,{appId:CHANNEL_APP,entityId:action==='notification.read'?CHANNEL_ENTITIES.notification:CHANNEL_ENTITIES.personal,purpose:'read'})}else await deps.policy.authorize(ctx,{appId:CHANNEL_APP,action,expected:[],cost:[],inputHash:''});return true}catch{return false}}
 const one=envelope(z.object({notificationId:z.string().min(1)}).strict()),all=envelope(z.object({through:z.iso.datetime()}).strict()),prefs=envelope(z.object({version:z.number().int().nonnegative(),preferences:preferenceInput}).strict()),workspace=envelope(z.object({version:z.number().int().positive(),changes:workspaceChanges}).strict())
 registry.register({action:'notification.read',description:'Mark your notification read',input:one,inputSchema:z.toJSONSchema(one) as Json,visible:visible('notification.read'),replayIdentity:async(_ctx,i)=>({appId:CHANNEL_APP,canonicalInputHash:await canonicalHash(i.input)}),prepare:(ctx,i)=>inbox.prepareRead(ctx,i.commandId,i.input)})
 registry.register({action:'notification.read-all',description:'Mark your notifications through a cutoff read',input:all,inputSchema:z.toJSONSchema(all) as Json,visible:visible('notification.read-all'),replayIdentity:async(_ctx,i)=>({appId:CHANNEL_APP,canonicalInputHash:await canonicalHash(i.input)}),prepare:(ctx,i)=>inbox.prepareRead(ctx,i.commandId,i.input)})
 registry.register({action:'preferences.update',description:'Change your versioned channel preferences',input:prefs,inputSchema:z.toJSONSchema(prefs) as Json,visible:visible('preferences.update'),replayIdentity:async(_ctx,i)=>({appId:CHANNEL_APP,canonicalInputHash:await canonicalHash(i.input)}),prepare:(ctx,i)=>settings.updatePreferences(ctx,i.commandId,i.input.version,i.input.preferences)})
 registry.register({action:'settings.update',description:'Change workspace settings; currency relabels existing amounts',input:workspace,inputSchema:z.toJSONSchema(workspace) as Json,visible:visible('settings.update'),replayIdentity:async(_ctx,i)=>({appId:CHANNEL_APP,canonicalInputHash:await canonicalHash(i.input)}),prepare:(ctx,i)=>settings.update(ctx,i.commandId,i.input.version,i.input.changes)})
 const digest=envelope(digestInput);registry.register({action:'digest.update',description:'Choose current digest recipients; enable through the weekly automation',input:digest,inputSchema:z.toJSONSchema(digest) as Json,visible:visible('digest.update'),replayIdentity:async(_ctx,i)=>({appId:CHANNEL_APP,canonicalInputHash:await canonicalHash(i.input)}),prepare:(ctx,i)=>createDigestSettings(deps.db,deps.policy)(ctx,i.commandId,i.input)})
 const retry=envelope(z.object({deliveryId:z.string().min(1),version:z.number().int().positive()}).strict());registry.register({action:'delivery.retry',description:'Retry your email that failed before any provider dispatch',input:retry,inputSchema:z.toJSONSchema(retry) as Json,visible:visible('delivery.retry'),replayIdentity:async(_ctx,i)=>({appId:CHANNEL_APP,canonicalInputHash:await canonicalHash(i.input)}),prepare:(ctx,i)=>createDeliveryRetry(deps.db,deps.policy)(ctx,i.commandId,i.input)})
 return {settings,inbox}
}
