import type { ChannelMailPort } from './delivery.server'
import type { createNotificationMailAuthority } from './mail-authority.server'
import { NOTIFICATION_APP } from './mail-authority.server'
import type { createExecutionService } from '../execution/service.server'
import type { RequestContext } from '../authority/ports'
import type { EffectRequest } from '../execution/contracts'
export function createChannelMailBridge(d:{authority:ReturnType<typeof createNotificationMailAuthority>;execution:ReturnType<typeof createExecutionService>;connection(ctx:RequestContext):Promise<{id:string;version:number;from:string;releaseId:string}>}):ChannelMailPort{return {
 context:d.authority.context,prepareFailure:d.authority.prepareFailure,
 async sender(ctx){return (await d.connection(ctx)).from},
 async prepare(ctx,commandId,input){const c=await d.connection(ctx);if(input.envelope.from!==c.from)throw new Error('Notification sender changed');const now=Date.parse(ctx.now),request:EffectRequest={appId:NOTIFICATION_APP,action:'notification.email.send',connectionId:c.id,connectionVersion:c.version,provider:'resend',input:{...input.envelope},expected:[],cost:[],grantId:null,grantVersion:null,releaseId:c.releaseId,schemaVersion:1,controlEpoch:0,caseId:null,definitionId:null,definitionVersion:null,trigger:`notification:${ctx.principal.credentialId}`,causeRunIds:[],causeDefinitionIds:[],unknownDeadline:new Date(now+86400000).toISOString(),custodianId:input.operatorId,deadline:new Date(now+86400000).toISOString()};const effects=await d.authority.prepareBatch(ctx,request,input.deliveryIds),plan=await d.execution.prepare(ctx,commandId,request);plan.guards=[...plan.guards,...effects.guards];plan.mutations=[...plan.mutations,...effects.mutations];return plan}
}}
