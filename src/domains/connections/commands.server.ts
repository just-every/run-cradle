import type { RequestContext } from '../authority/ports';
import { z } from 'zod';
import type { CommandRegistry } from '../../core/registry/commands';
import type { createConnectionService } from './service.server';
import type { createConnectionJobs } from './jobs.server';
import { connectionConfigureSchema } from './validators';
const id=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),ref=z.object({appId:id,entityId:id,recordId:id}).strict();
const envelope=<T extends z.ZodType>(input:T)=>z.object({commandId:id,expected:z.array(z.object({ref,version:z.number().int().positive()}).strict()),controlEpoch:z.number().int().nonnegative().optional(),input}).strict();
const consent=z.object({connectionId:id,returnTo:z.string().min(1).max(2000)}).strict();
export function registerConnectionCommands(registry:CommandRegistry,service:ReturnType<typeof createConnectionService>|((ctx:RequestContext)=>ReturnType<typeof createConnectionService>),jobs?:ReturnType<typeof createConnectionJobs>){
 const selected=(ctx:RequestContext)=>typeof service==='function'?service(ctx):service;
 registry.register({action:'connection.configure',description:'Configure explicit provider resources and field ownership; creates no business grant.',inputSchema:z.toJSONSchema(connectionConfigureSchema) as never,input:envelope(connectionConfigureSchema),visible:async ctx=>ctx.principal.kind==='human',replayIdentity:(ctx,c)=>selected(ctx).commandIdentity('connection.configure',c.input),prepare:(ctx,c)=>selected(ctx).prepareConfigure(ctx,c.commandId,c.input)});
 registry.register({action:'connection.begin-consent',description:'Begin session-bound OAuth consent for this provider connection.',inputSchema:z.toJSONSchema(consent) as never,input:envelope(consent),visible:async ctx=>ctx.principal.kind==='human',replayIdentity:(ctx,c)=>selected(ctx).commandIdentity('connection.begin-consent',c.input),prepare:(ctx,c)=>selected(ctx).prepareConsent(ctx,c.commandId,c.input.connectionId,c.input.returnTo)});
 for(const action of ['connection.check','connection.sync','connection.revoke'] as const){const input=z.object({connectionId:id}).strict();registry.register({action,description:action==='connection.revoke'?'Immediately revoke local provider access and queue remote revocation.':action==='connection.sync'?'Queue bounded source ingestion from approved provider resources.':'Queue a measured provider capability check.',inputSchema:z.toJSONSchema(input) as never,input:envelope(input),visible:async ctx=>ctx.principal.kind==='human',replayIdentity:(ctx,c)=>selected(ctx).commandIdentity(action,c.input),prepare:async(ctx,c)=>{if(!jobs)throw new Error('Durable connection operation integration is unavailable');return jobs.prepare(ctx,c.commandId,c.input.connectionId,action);}});}

}
