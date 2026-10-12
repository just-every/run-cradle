import {ApiError} from '../../core/registry/errors';
import type {CommandResult,Page} from '../../contracts/primitives';
import {hiddenArtifact} from './visibility';
import {boundIdentity,runCommand,resultValue} from './commands.server';
import type {CommandScope} from './commands.server';
import {createUlid} from '../../core/shared/ids';
import type { RequestContext, PolicyPort } from '../authority/ports';
import type { AdmissionPort, AdmissionPlan, SqlMutation, SqlPredicate } from '../admission/ports';
import { registerTable, trustedPredicate } from '../admission/sql.server';
import { canonical, digest } from './exact';
export type Stored={id:string;appId:string;ownerId:string;version:number;state:string;createdAt:string;updatedAt:string};
export const tables={snapshots:registerTable('intelligence_snapshots',['id','app_id','owner_id','version','state','data_json','created_at','updated_at']),problems:registerTable('intelligence_problems',['id','app_id','owner_id','version','state','data_json','created_at','updated_at']),strategies:registerTable('intelligence_strategies',['id','app_id','owner_id','problem_id','version','state','data_json','created_at','updated_at']),investigations:registerTable('intelligence_investigations',['id','app_id','owner_id','version','state','data_json','created_at','updated_at']),explorations:registerTable('intelligence_explorations',['id','app_id','owner_id','version','state','data_json','created_at','updated_at']),procedures:registerTable('knowledge_procedures',['id','app_id','owner_id','version','state','data_json','created_at','updated_at'])};
const dependencyTable=registerTable('knowledge_dependencies',['id','app_id','parent_id','child_id','invalidated_at']);
export type Collection=keyof typeof tables;
export class IntelligenceRepository {
 sourceRead:((ctx:RequestContext,id:string,version:number)=>Promise<unknown>)|null=null;
 async project<T extends Stored>(ctx:RequestContext,value:T):Promise<T>{if(value.state==='erased')throw new ApiError('not_found','not_found: Analytical artifact not found.');const v=value as T&{snapshot?:{sources:{id:string;version:number}[]};sourceVersions?:{id:string;version:number}[];constraints?:{proof:{sourceId:string;version:number}}[]};const refs=[...(v.snapshot?.sources??[]),...(v.sourceVersions??[]),...(v.constraints??[]).map(c=>({id:c.proof.sourceId,version:c.proof.version}))];if(refs.length&&!this.sourceRead)throw new ApiError('unconfigured','Source projection is not configured.');for(const ref of refs)await this.sourceRead!(ctx,ref.id,ref.version);const parent=value as T&{snapshotId?:string;problemId?:string;strategyId?:string};if(parent.snapshotId)await this.read(ctx,'snapshots',parent.snapshotId);if(parent.problemId)await this.read(ctx,'problems',parent.problemId);if(parent.strategyId)await this.read(ctx,'strategies',parent.strategyId);return value;}
 constructor(readonly db:D1Database,readonly policy:PolicyPort,readonly admission:AdmissionPort){}
 async read<T extends Stored>(ctx:RequestContext,collection:Collection,id:string):Promise<T>{
  const table=tables[collection];const row=await this.db.prepare(`SELECT app_id,data_json FROM ${table.tableId} WHERE id=?`).bind(id).first<{app_id:string;data_json:string}>();if(!row)throw new ApiError('not_found','not_found: Analytical artifact not found.');
  await this.policy.authorize(ctx,{appId:row.app_id,action:`${collection}.read`,expected:[],cost:[],inputHash:await digest(id)});return this.project(ctx,JSON.parse(row.data_json));
 }
 async scopeApp(scope:CommandScope):Promise<string>{if('appId' in scope)return scope.appId;const table='factId' in scope?'knowledge_fact_revisions':tables[scope.collection].tableId;const id='factId' in scope?scope.factId:scope.id;const row=await this.db.prepare(`SELECT app_id FROM ${table} WHERE id=? LIMIT 1`).bind(id).first<{app_id:string}>();if(!row)throw new ApiError('not_found','not_found: Analytical artifact not found.');return row.app_id;}
 async visibleRows<T extends Stored>(ctx:RequestContext,collection:Collection,appId:string,problemId?:string):Promise<T[]>{
  await this.policy.authorize(ctx,{appId,action:`${collection}.read`,expected:[],cost:[],inputHash:await digest({appId,problemId:problemId??null})});
  const rows=await this.db.prepare(`SELECT data_json FROM ${tables[collection].tableId} WHERE app_id=?${problemId?' AND problem_id=?':''} ORDER BY id`).bind(...(problemId?[appId,problemId]:[appId])).all<{data_json:string}>();const visible:T[]=[];
  for(const row of rows.results){try{visible.push(await this.project<T>(ctx,JSON.parse(row.data_json)));}catch(error){if(!hiddenArtifact(error))throw error;}}return visible;
 }
 async page<T extends Stored>(ctx:RequestContext,collection:Collection,appId:string,query:{limit?:number;cursor?:string}={},problemId?:string):Promise<Page<T>>{
  const limit=query.limit??100;if(!Number.isInteger(limit)||limit<1||limit>200)throw new ApiError('validation','Page limit must be from 1 through 200.');
  const visible=await this.visibleRows<T>(ctx,collection,appId,problemId);const marker=await digest({principal:ctx.principal.id,collection,appId,problemId:problemId??null,versions:visible.map(x=>[x.id,x.version])});let offset=0;
  if(query.cursor){let cursor:{offset:number;marker:string};try{cursor=JSON.parse(atob(query.cursor));}catch{throw new ApiError('validation','Invalid portfolio cursor.');}if(!Number.isSafeInteger(cursor.offset)||cursor.offset<0||cursor.marker!==marker)throw new ApiError('stale_cursor','Visible portfolio records changed. Refresh the list.');offset=cursor.offset;}
  const items=visible.slice(offset,offset+limit),nextCursor=offset+limit<visible.length?btoa(JSON.stringify({offset:offset+limit,marker})):null;return{items,nextCursor,total:{kind:'exact',value:visible.length},evaluatedAt:ctx.now};
 }
 async list<T extends Stored>(ctx:RequestContext,collection:Collection,appId:string,limit=100):Promise<T[]>{return(await this.page<T>(ctx,collection,appId,{limit})).items;}
 async forProblem<T extends Stored>(ctx:RequestContext,problemId:string):Promise<T[]>{const p=await this.read<Stored>(ctx,'problems',problemId);return this.visibleRows<T>(ctx,'strategies',p.appId,problemId);}
 async readableResult(ctx:RequestContext,action:string,appId:string,result:CommandResult<unknown>):Promise<void>{
  const value=resultValue(result) as Record<string,unknown>|null;if(!value)return;
  const collection:Collection=action==='portfolio.prepare'?(value.snapshot?'snapshots':'problems'):action==='portfolio.recompute'?'problems':action==='strategy.instrument'?'explorations':action.startsWith('strategy.')?'strategies':action.startsWith('investigation.')?'investigations':action.startsWith('procedure.')?(action==='procedure.run'?'explorations':'procedures'):'explorations';
  await this.policy.authorize(ctx,{appId,action:action.startsWith('fact.')||action==='knowledge.invalidate'?'facts.read':`${collection}.read`,expected:[],cost:[],inputHash:await digest({commandReplay:action})});
  const artifact=(value.strategy??value.procedure??value) as Stored;
  if(artifact.id&&!action.startsWith('fact.')&&action!=='knowledge.invalidate'){await this.read(ctx,collection,artifact.id);await this.project(ctx,artifact);}
  if(action.startsWith('fact.')){const refs=(value.sourceVersions??[]) as {id:string;version:number}[];for(const ref of refs){if(!this.sourceRead)throw new ApiError('unconfigured','Source projection is not configured.');await this.sourceRead(ctx,ref.id,ref.version);}}
 }
 command<T>(ctx:RequestContext,commandId:string,action:string,input:unknown,scope:CommandScope,work:(ctx:RequestContext)=>Promise<T>){return runCommand(this,ctx,commandId,action,input,scope,work);}
 async commandResult(ctx:RequestContext,commandId:string):Promise<CommandResult<unknown>>{await this.admission.status(ctx,commandId);const row=await this.db.prepare('SELECT app_id,action,result_json FROM command_admissions WHERE command_id=?').bind(commandId).first<{app_id:string;action:string;result_json:string}>();if(!row)throw new ApiError('not_found','Command not found.');const result=JSON.parse(row.result_json) as CommandResult<unknown>;await this.readableResult(ctx,row.action,row.app_id,result);return result;}
 mutation<T extends Stored>(collection:Collection,value:T,expectedVersion:number|null):SqlMutation {
  const row={id:value.id,app_id:value.appId,owner_id:value.ownerId,version:value.version,state:value.state,data_json:canonical(value),created_at:value.createdAt,updated_at:value.updatedAt,...(collection==='strategies'?{problem_id:(value as T&{problemId:string}).problemId}:{})};
  return expectedVersion===null?{kind:'insert',table:tables[collection],row}:{kind:'update',table:tables[collection],set:row,where:trustedPredicate('id=? AND version=? AND app_id=?',[value.id,expectedVersion,value.appId]),expectedRows:1};
 }
 async plan<T extends Stored>(ctx:RequestContext,commandId:string,action:string,collection:Collection,value:T,expectedVersion:number|null,guards:SqlPredicate[]=[],mutations:SqlMutation[]=[]):Promise<AdmissionPlan<T>>{
  if(collection==='strategies'&&expectedVersion===null){const v=value as T&{sourceVersions:{id:string}[];resourceVersions:{id:string}[];check:{assumptions:string[]}};const parents=[...(v.sourceVersions??[]).map(x=>`source:${x.id}`),...(v.resourceVersions??[]).map(x=>`resource:${x.id}`),...(v.check?.assumptions??[])];mutations=[...mutations,...[...new Set(parents)].map(parent=>({kind:'insert' as const,table:dependencyTable,row:{id:createUlid(),app_id:value.appId,parent_id:parent,child_id:value.id,invalidated_at:null}}))];}
  const identity=boundIdentity(ctx,commandId);if(identity&&identity.appId!==value.appId)throw new ApiError('idempotency_conflict','Command application changed.');action=identity?.action??action;const inputHash=identity?.canonicalInputHash??await digest(value);const permit=await this.policy.authorize(ctx,{appId:value.appId,action,expected:[],cost:[],inputHash,commandId});
  return{commandId,action,appId:value.appId,canonicalInputHash:inputHash,permit,guards,mutations:[this.mutation(collection,value,expectedVersion),...mutations],audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[value.id]}],events:[],outbox:[],committedResult:value};
 }
 async save<T extends Stored>(ctx:RequestContext,commandId:string,action:string,collection:Collection,value:T,expectedVersion:number|null,guards:SqlPredicate[]=[],mutations:SqlMutation[]=[]){return this.admission.commit(ctx,await this.plan(ctx,commandId,action,collection,value,expectedVersion,guards,mutations));}
}
