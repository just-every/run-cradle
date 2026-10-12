import {bindCommandEnvelope} from '../intelligence/commands.server';
import {Hono} from 'hono';import {z} from 'zod';
import {errorResponse} from '../../core/registry/errors.server';
import type {RequestContext} from '../authority/ports';
import type {KnowledgeService} from './service.server';
import {temporalFactSchema,correctionSchema} from './validators';
const command=z.object({commandId:z.string().min(1),input:z.unknown(),expected:z.array(z.unknown()).optional(),controlEpoch:z.number().int().optional()}).strict();
export function createKnowledgeRoutes(deps:{service:KnowledgeService;authenticate(request:Request):Promise<RequestContext>}){
 const app=new Hono(),s=deps.service;
 app.onError((error,c)=>errorResponse(error,c.req.header('x-request-id')??crypto.randomUUID(),c.req.path));
 const response=(ctx:RequestContext,data:unknown)=>({data,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}});
 app.get('/facts',async c=>{const ctx=await deps.authenticate(c.req.raw),query=z.object({appId:z.string(),ownerId:z.string(),cutoff:z.string().datetime({offset:true}),effectiveAt:z.string().datetime({offset:true})}).parse(c.req.query());return c.json(response(ctx,await s.facts(ctx,query.appId,query.ownerId,query.cutoff,query.effectiveAt)));});
 app.post('/facts/record',async c=>{const ctx=await deps.authenticate(c.req.raw),v=bindCommandEnvelope(ctx,command.parse(await c.req.json())),fact=temporalFactSchema.parse(v.input);await s.append(ctx,v.commandId,fact,null);return c.json(response({...ctx,consistencyToken:v.commandId},await s.repository.commandResult(ctx,v.commandId)));});
 app.post('/facts/correct',async c=>{const ctx=await deps.authenticate(c.req.raw),v=bindCommandEnvelope(ctx,command.parse(await c.req.json())),input=correctionSchema.parse(v.input);await s.correct(ctx,v.commandId,input.factId,input.expectedVersion,{...input,knownAt:ctx.now,actorKind:ctx.principal.kind});return c.json(response({...ctx,consistencyToken:v.commandId},await s.repository.commandResult(ctx,v.commandId)));});
 app.post('/procedures/retain',async c=>{const ctx=await deps.authenticate(c.req.raw),v=bindCommandEnvelope(ctx,command.parse(await c.req.json())),input=z.object({strategyId:z.string(),title:z.string().min(1),assumptions:z.record(z.string(),z.string())}).strict().parse(v.input);await s.retainProcedure(ctx,v.commandId,input.strategyId,input);return c.json(response({...ctx,consistencyToken:v.commandId},await s.repository.commandResult(ctx,v.commandId)));});
 app.post('/procedures/evaluate',async c=>{const ctx=await deps.authenticate(c.req.raw),v=bindCommandEnvelope(ctx,command.parse(await c.req.json())),input=z.object({procedureId:z.string(),datasetId:z.string()}).strict().parse(v.input);await s.evaluateProcedure(ctx,v.commandId,input.procedureId,input.datasetId);return c.json(response({...ctx,consistencyToken:v.commandId},await s.repository.commandResult(ctx,v.commandId)));});
 app.post('/procedures/run',async c=>{const ctx=await deps.authenticate(c.req.raw),v=bindCommandEnvelope(ctx,command.parse(await c.req.json())),input=z.object({procedureId:z.string(),snapshotId:z.string(),assumptions:z.record(z.string(),z.string())}).strict().parse(v.input);await s.runProcedure(ctx,v.commandId,input.procedureId,input);return c.json(response({...ctx,consistencyToken:v.commandId},await s.repository.commandResult(ctx,v.commandId)));});
 return app;
}
