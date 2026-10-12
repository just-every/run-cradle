import {Hono} from 'hono';
import {z} from 'zod';
import {errorResponse} from '../../core/registry/errors.server';
import {idSchema,commandSchema} from '../../core/registry/validation';
import type {RequestContext} from '../authority/ports';
import type {OperationsService} from './service.server';
import {actionSchemas} from './validators';
import {createScorecardService,cohortInput,observationInput} from '../scorecard/service.server';
import type {PlanRevision,Verification} from './contracts';
import {createOperationConfigurationService,configurationSchema} from './configuration.server';
import {createRuntimeConfigurationAdapters} from './runtime-configuration.server';
import {page} from './pagination.server';
import {createTodayService} from '../today/service.server';
export function createOperationsRoutes(input:{service:OperationsService;authenticate:(request:Request)=>Promise<RequestContext>}){
 const success=(ctx:RequestContext,data:unknown)=>({data,meta:{requestId:ctx.requestId,evaluatedAt:ctx.now,apiVersion:'cradle.api.v1',consistencyToken:ctx.consistencyToken??''}});
 const app=new Hono(),s=input.service,today=createTodayService(s.repo),scorecards=createScorecardService(s.repo),configuration=createOperationConfigurationService(s.repo.d),recovery=createRuntimeConfigurationAdapters(s.repo).recovery;
 const query=z.object({appId:idSchema.optional(),cursor:z.string().optional(),limit:z.coerce.number().int().min(1).max(200).optional()});
 app.get('/today',async c=>{const ctx=await input.authenticate(c.req.raw);try{const q=query.parse(c.req.query());return c.json({data:await today.read(ctx,q.appId),meta:{requestId:ctx.requestId,evaluatedAt:ctx.now,apiVersion:'cradle.api.v1',consistencyToken:ctx.consistencyToken??''}});}catch(e){return errorResponse(e,ctx.requestId,'today.read');}});
 app.get('/today/:bucket',async c=>{const ctx=await input.authenticate(c.req.raw);try{const q=query.parse(c.req.query()),bucket=z.enum(['needs_decision','being_handled','finished']).parse(c.req.param('bucket'));return c.json(success(ctx,await today.bucket(ctx,q.appId,bucket,q)));}catch(e){return errorResponse(e,ctx.requestId,'today.read');}});
 for(const collection of ['cases','mandates'] as const){
 app.get(`/${collection}`,async c=>{const ctx=await input.authenticate(c.req.raw);try{const q=query.parse(c.req.query());return c.json(success(ctx,await page(ctx,await s.repo.all(ctx,collection,q.appId),q,`${collection}:${q.appId}`,s.repo.d.cursorSecret)));}catch(e){return errorResponse(e,ctx.requestId,`${collection}.read`);}});
 app.get(`/${collection}/:id`,async c=>{const ctx=await input.authenticate(c.req.raw);try{const id=idSchema.parse(c.req.param('id'));return c.json(success(ctx,collection==='cases'?await s.repo.getCase(ctx,id):await s.repo.getMandate(ctx,id)));}catch(e){return errorResponse(e,ctx.requestId,`${collection}.read`);}});
 }
 for(const [action,schema]of Object.entries(actionSchemas))app.post(`/commands/${action}`,async c=>{const ctx=await input.authenticate(c.req.raw);try{const command=commandSchema(schema).parse(await c.req.json());const result=action==='mandate.prepare'?await s.prepare(ctx,command):action==='mandate.activate'?await s.activate(ctx,command):action==='mandate.revise'?await s.revise(ctx,command):action==='case.wake'?await s.wake(ctx,command):await s.control(ctx,action as 'case.pause'|'case.takeover'|'case.resume'|'case.cancel'|'case.correct',command);return c.json({data:result.result,meta:{requestId:ctx.requestId,evaluatedAt:ctx.now,apiVersion:'cradle.api.v1',consistencyToken:result.consistencyToken}});}catch(e){return errorResponse(e,ctx.requestId,action);}});

 for(const collection of ['plans','verifications'] as const)app.get(`/${collection}/:id`,async c=>{const ctx=await input.authenticate(c.req.raw);try{const id=idSchema.parse(c.req.param('id'));const value=await s.repo.raw<PlanRevision|Verification>(collection,id);await s.repo.getCase(ctx,value.caseId);return c.json(success(ctx,value));}catch(e){return errorResponse(e,ctx.requestId,`${collection}.read`);}});
 app.get('/scorecards/:id',async c=>{const ctx=await input.authenticate(c.req.raw);try{return c.json(success(ctx,await scorecards.read(ctx,idSchema.parse(c.req.param('id')))));}catch(e){return errorResponse(e,ctx.requestId,'scorecards.read');}});
 for(const action of ['cohort','observe'] as const)app.post(`/commands/scorecard.${action}`,async c=>{const ctx=await input.authenticate(c.req.raw);try{const command=commandSchema(action==='cohort'?cohortInput:observationInput).parse(await c.req.json());return c.json(success(ctx,(await(action==='cohort'?scorecards.create(ctx,command.commandId,command.input):scorecards.observe(ctx,command.commandId,command.input))).result));}catch(e){return errorResponse(e,ctx.requestId,`scorecard.${action}`);}});
 app.post('/commands/operation.configure',async c=>{const ctx=await input.authenticate(c.req.raw);try{const command=commandSchema(z.object({configuration:configurationSchema,expectedVersion:z.number().int().positive().nullable()}).strict()).parse(await c.req.json());const result=await configuration.adopt(ctx,command.commandId,command.input.configuration,command.input.expectedVersion);return c.json(success(ctx,result.result));}catch(e){return errorResponse(e,ctx.requestId,'operation.configure');}});
 app.get('/operations/recovery/:id',async c=>{const ctx=await input.authenticate(c.req.raw);try{return c.json(success(ctx,await recovery.read(ctx,idSchema.parse(c.req.param('id')))));}catch(e){return errorResponse(e,ctx.requestId,'operation.recovery.read');}});
 app.post('/commands/operation.recovery.outcome',async c=>{const ctx=await input.authenticate(c.req.raw);try{const command=commandSchema(z.object({id:idSchema,version:z.number().int().positive(),inputHash:z.string().regex(/^[a-f0-9]{64}$/),outcome:z.enum(['approved','rejected']),reason:z.string().min(1)}).strict()).parse(await c.req.json());return c.json(success(ctx,(await recovery.outcome(ctx,command.commandId,command.input)).result));}catch(e){return errorResponse(e,ctx.requestId,'operation.recovery.outcome');}});
 app.post('/commands/scorecard.collect',async c=>{const ctx=await input.authenticate(c.req.raw);try{const command=commandSchema(z.object({appId:idSchema,mode:z.enum(['live','sandbox','historical','shadow']),window:z.object({start:z.iso.datetime(),end:z.iso.datetime()}).strict(),clockVersion:z.string().min(1),releaseIds:z.array(idSchema)}).strict()).parse(await c.req.json());return c.json(success(ctx,(await scorecards.collect(ctx,command.commandId,command.input)).result));}catch(e){return errorResponse(e,ctx.requestId,'scorecard.collect');}});
 return app;
}
