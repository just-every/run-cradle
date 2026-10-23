import { Hono } from 'hono';
import { z } from 'zod';
import { entitySchema } from '../records/validators';
import { createUlid } from '../../core/shared/ids';
import { errorResponse,ApiError } from '../../core/registry/errors.server';
import type { RequestContext } from '../authority/ports';
import type { ConstructionService } from './service.server';
import type { ConstructionJobs } from './jobs.server';
import type { ConstructionRepository } from './repository.server';
import type { SourceIntake } from './intake.server';
import type { AdmissionPort } from '../admission/ports';
import type { ConstructionReadiness } from './contracts';
import { unreadyMessage } from './readiness.server';
import type { ReleaseReviewPort } from '../releases/ports';
import type { PendingApplications } from './applications.server';
import type { CandidatePreview } from './preview.server';
import type { ApplicationRuntime } from '../releases/runtime.server';
import type { ReleaseService } from '../releases/service.server';
import type { ImprovementService } from '../improvements/service.server';
const id=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const commands={
 'schema.propose':z.object({appId:id,entities:z.array(entitySchema).min(1).max(100),reason:z.string().min(1).max(32000)}).strict(),
 'candidate.prepare':z.object({appId:id.nullable(),brief:z.string().min(1).max(32000),sourceIds:z.array(id).max(100),parentReleaseId:id.nullable()}).strict(),
 'candidate.revise':z.object({candidateId:id,instruction:z.string().min(1).max(32000),sourceSnapshotId:id}).strict(),
 'candidate.build':z.object({candidateId:id}).strict(),
 'candidate.evaluate':z.object({candidateId:id,datasetId:id,mode:z.enum(['historical','held_out','shadow','sandbox'])}).strict(),
 'candidate.reject':z.object({candidateId:id,reason:z.string().min(1).max(4000)}).strict(),
 'release.adopt':z.object({candidateId:id,decisionId:id.nullable(),releaseGrantId:id.nullable(),expectedLiveReleaseId:id.nullable()}).strict(),
 'release.recover':z.object({releaseId:id,recoveryPlanId:id,reason:z.string().min(1),decisionId:id.nullable(),grantId:id.nullable()}).strict(),
 'improvement.investigate':z.object({cohortId:id,question:z.string().min(1)}).strict(),
 'improvement.evaluate':z.object({improvementId:id,candidateId:id,datasets:z.array(z.object({id,mode:z.enum(['historical','held_out','shadow'])})).min(3)}).strict(),
 'improvement.decide':z.object({improvementId:id,outcome:z.enum(['adopt','keep_current','change_rule']),reason:z.string().min(1),decisionId:id.nullable(),releaseGrantId:id.nullable()}).strict(),
};
export function constructionHandlers(service:ConstructionService,releases:ReleaseService,improvements:ImprovementService){
 return new Map<string,(ctx:RequestContext,commandId:string,input:unknown)=>Promise<unknown>>([
 ['schema.propose',async(c,k,v)=>{const x=commands['schema.propose'].parse(v);if(x.entities.some(e=>e.appId!==x.appId))throw new Error('schema_app_scope_mismatch');const live=await service.repository.db.prepare('SELECT release_id FROM live_app_releases WHERE app_id=?').bind(x.appId).first<{release_id:string}>();return service.prepare(c,k,{appId:x.appId,brief:`Apply this owner schema proposal and preserve all existing owner source and recorded business rules. Reason: ${x.reason}\nExact schemas: ${JSON.stringify(x.entities)}`,sourceIds:[],parentReleaseId:live?.release_id??null});}],
 ['candidate.prepare',(c,k,v)=>service.prepare(c,k,commands['candidate.prepare'].parse(v))],['candidate.revise',(c,k,v)=>service.revise(c,k,commands['candidate.revise'].parse(v))],
 ['candidate.build',(c,k,v)=>service.build(c,k,commands['candidate.build'].parse(v).candidateId)],
 ['candidate.evaluate',(c,k,v)=>{const x=commands['candidate.evaluate'].parse(v);return service.evaluate(c,k,x.candidateId,x.datasetId,x.mode);}],
 ['candidate.reject',(c,k,v)=>{const x=commands['candidate.reject'].parse(v);return service.reject(c,k,x.candidateId,x.reason);}],
 ['release.adopt',(c,k,v)=>releases.adopt(c,k,commands['release.adopt'].parse(v))],['release.recover',(c,k,v)=>releases.recover(c,k,commands['release.recover'].parse(v))],
 ['improvement.investigate',(c,k,v)=>improvements.investigate(c,k,commands['improvement.investigate'].parse(v))],['improvement.evaluate',(c,k,v)=>improvements.evaluate(c,k,commands['improvement.evaluate'].parse(v))],['improvement.decide',(c,k,v)=>improvements.decide(c,k,commands['improvement.decide'].parse(v))],
 ]);
}
export function createConstructionRoutes(ports:{authenticate(request:Request,ingress:RequestContext['ingress'],requestId:string):Promise<RequestContext>;readiness(ctx:RequestContext):Promise<ConstructionReadiness>;repository:ConstructionRepository;jobs:ConstructionJobs;intake:SourceIntake;admission:AdmissionPort;releases?:ReleaseService;improvements?:ImprovementService;runtime?:ApplicationRuntime;applications?:PendingApplications;review?:ReleaseReviewPort;preview?:CandidatePreview;scope?(ctx:RequestContext,action:string,input:unknown):Promise<{appId:string;sourceReleaseId:string}>}){
 const app=new Hono();app.all('*',async c=>{const requestId=createUlid(),request=c.req.raw,path=new URL(request.url).pathname;
  try{const ctx=await ports.authenticate(request,'http',requestId);if(request.method==='POST'&&request.headers.has('cookie')&&request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError('forbidden','Same-origin request required');
   const respond=(data:unknown,status:200|202=200)=>c.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},status);
   if(request.method==='GET'&&path.endsWith('/construction/readiness'))return respond(await ports.readiness(ctx));
   const runtimeMatch=path.match(/\/apps\/([^/]+)\/runtime$/);if(request.method==='POST'&&runtimeMatch){if(!ports.runtime)throw new ApiError('unconfigured','The isolated application deployment target is not configured');const input=z.object({expectedReleaseId:id,expectedControlEpoch:z.number().int().positive(),commandId:id,path:z.string().max(2000).startsWith('/'),method:z.enum(['GET','POST','PUT','PATCH','DELETE']),body:z.unknown()}).strict().parse(await request.json());return respond(await ports.runtime.invoke(ctx,{...input,body:input.body,appId:id.parse(runtimeMatch[1])}));}
   const previewMatch=path.match(/\/candidates\/([^/]+)\/preview$/);if(request.method==='GET'&&previewMatch){if(!ports.preview)throw new ApiError('unconfigured','Candidate preview is not configured');return ports.preview.html(ctx,id.parse(previewMatch[1]));}
   const reviewMatch=path.match(/\/candidates\/([^/]+)\/adoption-review$/);if(request.method==='GET'&&reviewMatch){if(!ports.review)throw new ApiError('unconfigured','Human release authority review is not configured');return respond(await ports.review.review(ctx,await ports.repository.get(ctx,id.parse(reviewMatch[1]))));}
   const read=path.match(/\/(candidates|evaluations|releases|improvements|construction-jobs)\/([^/]+)$/);
   if(request.method==='GET'&&read){const key=id.parse(read[2]);if(read[1]==='candidates')return respond(await ports.repository.get(ctx,key));if(read[1]==='evaluations')return respond(await ports.repository.evaluation(ctx,key));if(read[1]==='releases'){if(!ports.releases)throw new ApiError('unconfigured','Application releases are not configured');return respond(await ports.releases.get(ctx,key));}if(read[1]==='improvements'){if(!ports.improvements)throw new ApiError('unconfigured','Application improvements are not configured');return respond(await ports.improvements.get(ctx,key));}return respond(await ports.jobs.status(ctx,key));}
   const match=path.match(/\/commands\/([^/]+)$/);if(request.method!=='POST'||!match||!(match[1] in commands||match[1]==='source.intake.prepare'))throw new ApiError('not_found','Unknown construction route');
   const readiness=await ports.readiness(ctx);if(!readiness.ready)throw new ApiError('unconfigured',unreadyMessage(readiness));
   const text=await request.text();if(text.length>1048576)throw new ApiError('upload_rejected','Request too large');const envelope=z.object({commandId:id,expected:z.array(z.unknown()),input:z.unknown()}).strict().parse(JSON.parse(text));
   if(match[1]==='source.intake.prepare')return respond((await ports.admission.commit(ctx,await ports.intake.prepare(ctx,envelope.commandId))).result);
   const action=match[1] as keyof typeof commands,input=commands[action].parse(envelope.input);
   if(action==='candidate.prepare'&&'appId' in input&&input.appId===null){if(!ports.applications)throw new ApiError('unconfigured','New application construction authority is not configured');const queued=await ports.applications.enqueue(ctx,envelope.commandId,commands['candidate.prepare'].parse(input));return respond({commandId:envelope.commandId,state:'accepted',runId:queued.jobId,statusUrl:`/api/v1/construction-jobs/${queued.jobId}`},202);}
   if(!ports.scope)throw new ApiError('unconfigured','Construction scope is not configured');const scope=await ports.scope(ctx,action,input);
   const result=await ports.jobs.enqueue(ctx,envelope.commandId,scope.appId,action,input,scope.sourceReleaseId);return respond({commandId:envelope.commandId,state:'accepted',runId:result.jobId,statusUrl:`/api/v1/construction-jobs/${result.jobId}`},202);
  }catch(error){return errorResponse(error,requestId,`${request.method} ${path}`);}
 });return app;
}
