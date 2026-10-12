import {campaignErasure} from '../../../domains/lifecycle/campaigns.server'
import {createLifecycleCleanup} from '../../../domains/lifecycle/cleanup.server'
import { stagingDescriptor } from '../../../domains/evidence/staging.server'
import { sourceIntakeDescriptor } from '../../../domains/construction/intake.server'
import { INSTALLATION_AUTHORITY_APP } from '../../../domains/authority/pending-app.server'
import { z } from 'zod'
import { repairDescriptors } from '../../../apps/repairs/descriptors'
import { createChannelsIntegration } from '../../../domains/channels/integration.server'
import type { Platform } from '../../platform'
import { createServerFoundation } from '../foundation.server'
import { launchDescriptors } from '../../../apps/launch/descriptors.server'
import { createLaunchHandlers } from '../../../apps/launch/registry.server'
import { mountLegacyLaunch } from '../../../apps/launch/legacy.server'
import { launchCommandSchema, launchInputs, LAUNCH_APP_ID, type LaunchAction } from '../../../apps/launch/contracts'
import { canonicalHash } from '../../../domains/admission/canonical'
import { trustedPredicate } from '../../../domains/admission/sql.server'
import { ApiError } from '../../registry/errors'
import type { Json, CommandInput } from '../../../contracts/primitives'

/** Mount independently usable launch actions. Required external effects stay unmounted
 * until their real same-admission adapters join this composition. */
export async function createLaunchFoundation(platform: Platform) {
  const storedApps = await platform.bindings.DB.prepare('SELECT DISTINCT app_id FROM record_schemas').all<{app_id:string}>()
  const appIds = new Set([...launchDescriptors,...repairDescriptors].map(d=>d.schema.appId).concat(storedApps.results.map(row=>row.app_id)))
  const foundation=await createServerFoundation(platform,{
    descriptors:[...launchDescriptors,...repairDescriptors,sourceIntakeDescriptor(INSTALLATION_AUTHORITY_APP),...[...appIds].map(stagingDescriptor)],
    admissionGuards:()=>[trustedPredicate("NOT EXISTS(SELECT 1 FROM portability_fences WHERE name IN ('restore','snapshot'))")],
  })
  const channelEffects=createChannelsIntegration(platform.bindings.DB)
  const handlers=createLaunchHandlers({db:platform.bindings.DB,policy:foundation.policy,integration:{...channelEffects,async deleteCampaign(ctx,id){return campaignErasure(platform.bindings.DB,ctx,id)}}})
  const actions = (Object.keys(launchInputs) as LaunchAction[]).filter(action => !['analysis.request','samples.remove'].includes(action))
  for(const action of actions){
    const prepare=handlers[action]
    if(!prepare)throw new Error(`Required launch handler missing: ${action}`)
    const schema=launchCommandSchema(action)
    foundation.commands.register({action:`launch.${action}`,description:`Launch ${action}`,inputSchema:z.toJSONSchema(schema) as Json,input:schema,
      visible:async ctx=>{try{await foundation.policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId:launchDescriptors[0]!.schema.id,purpose:'read'});return true}catch{return false}},
      replayIdentity:async(_ctx,input)=>({appId:LAUNCH_APP_ID,canonicalInputHash:await canonicalHash({input:input.input,expected:input.expected})}),
      prepare:(ctx,input)=>prepare(ctx,input as CommandInput<Record<string,unknown>>),
    })
  }
  mountLegacyLaunch(platform,{async execute(request,action,input){
    const command=foundation.commands.get(`launch.${action}`)
    if(!command)throw new ApiError('unconfigured',`Launch ${action} requires its complete domain effects.`)
    const context=await foundation.authenticate(request,'http',input.commandId)
    const receipt=await command.execute(context,input)
    if(receipt.result.state!=='committed')throw new ApiError('unknown_outcome','The launch command is still in progress.',{commandId:input.commandId,retry:'reconcile'})
    if(action==='campaign.delete'){const cleanup=await createLifecycleCleanup(platform.bindings.DB,platform.bindings.FILES).advance(String((input.input as {id:string}).id));return {...receipt.result.value as object,erasureState:cleanup.state,confirmed:cleanup.state==='complete'} as Json}
    return receipt.result.value as Json
  }})
  return foundation
}
