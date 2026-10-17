import { createGrantCommands } from '../../domains/authority/grant-commands.server'
import { createRepairDecisionAuthority } from '../../domains/decisions/authority.server'
import {erasureAdmissionGuard} from '../../domains/lifecycle/file-writes.server'
import { createNotificationReplay } from '../../domains/channels/replay.server'
import { NOTIFICATION_PRINCIPAL } from '../../domains/channels/mail-authority.server'
import { withAdmissionWake } from './composition/admission-wake.server'
import type { Platform } from '../platform'
import { loadDescriptorRegistry } from '../../domains/records/loader.server'
import { createApplicationEntityRegistry } from './composition/entities.server'
import type { EntityDescriptor } from '../../domains/records/descriptors.server'
import { createPolicyPort, readOnlyContext } from '../../domains/authority/policy.server'
import { createMemberManagementPolicy } from '../../domains/authority/member-management.server'
import { createReplayAccess, createRequestContextFactory } from '../../domains/authority/context.server'
import { createAdmissionService } from '../../domains/admission/service.server'
import type { SqlPredicate } from '../../domains/admission/ports'
import { commandExecutionStatus } from '../../domains/execution/status.server'
import { createCommandRegistry } from '../registry/commands'
import { createCommandHttp } from '../registry/http'
import { createMcpTransport } from '../registry/mcp'
import type { RequestContext } from '../../domains/authority/ports'

/** Domains supply their actual source-owned descriptors and restore fence.
 * Construction of this object is separate from mounting capabilities. */
export async function createServerFoundation(platform: Platform, inputs: {
  descriptors: readonly EntityDescriptor[]
  admissionGuards: () => SqlPredicate[]
}) {
  const descriptors=await loadDescriptorRegistry(platform.bindings.DB, inputs.descriptors)
  const entities=createApplicationEntityRegistry(descriptors)
  const db=platform.bindings.DB
  const policy=createMemberManagementPolicy(db,createPolicyPort(db,entities,createRepairDecisionAuthority(db)))
  const ordinaryReplay=createReplayAccess(db,policy,entities)
  const notificationReplay=createNotificationReplay(db)
  const inertAdmission=createAdmissionService(db,{
    authorizeReplay: (ctx,command) => ctx.principal.id===NOTIFICATION_PRINCIPAL && ctx.principal.kind==='system' ? notificationReplay(ctx,command) : ordinaryReplay.authorizeReplay(ctx,command),
    executionStatus:commandExecutionStatus(db),
    additionalGuards:ctx=>[...inputs.admissionGuards(),erasureAdmissionGuard(ctx.now)],
    captureRecordEvents:true,
  })
  const admission=withAdmissionWake(inertAdmission,db,platform.bindings.WORK_QUEUE)
  const resolve=createRequestContextFactory(db,platform.auth.configuration)
  const authenticate=async(request:Request,ingress:RequestContext['ingress'],requestId:string):Promise<RequestContext>=>{
    const context=await resolve(request,ingress)
    const current={...context,requestId,consistencyToken:request.headers.get('x-cradle-consistency')??undefined}
    return ['GET','HEAD'].includes(request.method)?readOnlyContext(current):current
  }
  const commands=createCommandRegistry(admission)
  for(const command of createGrantCommands(db,policy))commands.register(command as import('../registry/commands').CommandDefinition<unknown,unknown>)
  const transport={commands,admission,authenticate}
  return {descriptors,entities,policy,admission,inertAdmission,commands,authenticate,http:createCommandHttp(transport),mcp:createMcpTransport(transport)}
}
export type ServerFoundation=Awaited<ReturnType<typeof createServerFoundation>>
