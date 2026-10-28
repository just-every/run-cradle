import type { CommandInput, Ref } from '../../contracts/primitives';
import type { RequestContext } from '../authority/ports';
import type { EvidenceDependencies } from './ports';
import type { AdmissionPlan, SqlMutation, SqlPredicate } from '../admission/ports';
import type { DescriptorRegistry } from '../records/descriptors.server';
import { schemaGuard } from '../records/change.server';
import { canonicalHash } from '../admission/canonical';
import { AdmissionError } from '../admission/errors';
import { exists, identifier, trustedPredicate, registerTable } from '../admission/sql.server';
import { commandTable } from '../admission/tables.server';
import { createUlid, insert, comments, eq, and } from './shared.server';

export type CommentText={subject:Ref;body:string;mentions:string[]};
export type CommentTarget={subject:Ref;id:string;version:number};
export type CommentRedaction=CommentTarget&{reason:string};
const redactions=registerTable('evidence_comment_redactions',['id','comment_id','app_id','entity_id','record_id','actor_id','actor_kind','reason','created_at']);
/** Workspace roles supplement, and never replace, the record's action policy. */
export function commentRedactionGuard(ctx:RequestContext){
 return trustedPredicate(`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
  JOIN cradle_base_operators projection ON projection.base_id=o.id
  JOIN authority_principals p ON p.id=projection.principal_id
  WHERE s.id=? AND p.id=? AND p.kind='human' AND p.state='active' AND p.authentication_epoch=?
   AND o.role IN ('owner','admin') AND o.status='active' AND s.operator_version=o.version
   AND s.revoked_at IS NULL AND s.expires_at>unixepoch('subsec')*1000 AND ?=1)`,
 [ctx.principal.baseSessionId??'',ctx.principal.id,ctx.principal.authenticationEpoch,
  ctx.principal.kind==='human'&&!ctx.principal.credentialId&&!ctx.principal.delegationGrant&&!ctx.principal.viaProposer?1:0]);
}
export type MentionPort={prepare(ctx:RequestContext,subject:Ref,commentId:string,memberIds:string[]):Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}>;candidates(ctx:RequestContext,subject:Ref,q?:string):Promise<{items:{id:string;name:string}[];nextCursor:null;total:{kind:'exact';value:number};evaluatedAt:string}>};
export const commentIdentity=(action:string,command:CommandInput<unknown>)=>canonicalHash({action,input:command.input,expected:command.expected});

/** Comments use the record's action and row policy, and never mutate that record. */
export function createCommentService(deps:EvidenceDependencies,mentions:MentionPort,registry:DescriptorRegistry){
 async function redactionAuthority(ctx:RequestContext){
  const role=commentRedactionGuard(ctx);
  if(!await deps.db.prepare(`SELECT 1 WHERE ${role.sql}`).bind(...role.values).first())throw new AdmissionError('forbidden','Only a current workspace owner or admin can redact a comment body.');
  return role;
 }
 async function prepare(ctx:RequestContext,command:CommandInput<CommentText|CommentTarget>,action:string){
  const subject=command.input.subject;
  await deps.access.checkReference(ctx,subject,[],'read');
  const expected=command.expected.find(e=>e.ref.appId===subject.appId&&e.ref.entityId===subject.entityId&&e.ref.recordId===subject.recordId);
  if(!expected||command.expected.length!==1)throw new AdmissionError('validation','The current comment record reference is required.');
  const descriptor=registry.get(subject.appId,subject.entityId),scope=await deps.policy.scope(ctx,{appId:subject.appId,entityId:subject.entityId,purpose:'read'});
  const row=await deps.db.prepare(`SELECT ${identifier(descriptor.versionColumn)} AS version FROM ${identifier(descriptor.table.tableId)} WHERE ${identifier(descriptor.idColumn)}=? AND (${scope.rowPredicate.sql})`).bind(subject.recordId,...scope.rowPredicate.values).first<{version:number}>();
  if(!row)throw new AdmissionError('forbidden','Current record access is required.');
  if(row.version!==expected.version)throw new AdmissionError('version_conflict','The record changed; reload it before commenting.');
  const inputHash=await commentIdentity(action,command),permit=await deps.policy.authorize(ctx,{appId:subject.appId,action,expected:[expected],cost:[],inputHash,commandId:command.commandId});
  const guards=[...scope.currentAuthorityGuards,...(descriptor.legacy?[]:[schemaGuard(descriptor)]),exists(descriptor.table,and(scope.rowPredicate,eq(descriptor.table,descriptor.idColumn,subject.recordId),eq(descriptor.table,descriptor.versionColumn,row.version)))];
  return {subject,inputHash,permit,guards};
 }
 function text(input:CommentText){if(!input.body.trim()||input.body.length>10000||input.mentions.length>100||new Set(input.mentions).size!==input.mentions.length)throw new AdmissionError('validation','A comment needs text and at most 100 distinct mentions.');}
 async function owned(ctx:RequestContext,input:CommentTarget){
  const row=await deps.db.prepare('SELECT author_id,author_kind,body,mentions_json,version,deleted_at FROM evidence_comments WHERE id=? AND app_id=? AND entity_id=? AND record_id=?').bind(input.id,input.subject.appId,input.subject.entityId,input.subject.recordId).first<{author_id:string;author_kind:string;body:string|null;mentions_json:string;version:number;deleted_at:string|null}>();
  if(!row||row.deleted_at)throw new AdmissionError('not_found','Comment not found.');
  if(row.author_id!==ctx.principal.id||row.author_kind!==ctx.principal.kind)throw new AdmissionError('forbidden','Only the comment author can edit or delete it.');
  if(row.body===null)throw new AdmissionError('forbidden','A redacted comment cannot be edited or deleted.');
  if(row.version!==input.version)throw new AdmissionError('version_conflict','The comment changed; reload its latest version.');
  const where=and(eq(comments,'id',input.id),eq(comments,'app_id',input.subject.appId),eq(comments,'entity_id',input.subject.entityId),eq(comments,'record_id',input.subject.recordId),eq(comments,'author_id',ctx.principal.id),eq(comments,'author_kind',ctx.principal.kind),eq(comments,'version',input.version),trustedPredicate('deleted_at IS NULL'));
  return {row,where};
 }
 function plan<T extends {id:string}>(command:CommandInput<CommentText|CommentTarget>,action:string,prepared:Awaited<ReturnType<typeof prepare>>,mutations:SqlMutation[],value:T,effects:{guards:SqlPredicate[];mutations:SqlMutation[]}={guards:[],mutations:[]}):AdmissionPlan<T>{
  return {commandId:command.commandId,action,appId:prepared.subject.appId,canonicalInputHash:prepared.inputHash,permit:prepared.permit,guards:[...prepared.guards,...effects.guards],mutations:[...mutations,...effects.mutations],audit:[{action,subject:prepared.subject,changes:[],sourceIds:[],personalContentRefs:[value.id]}],events:[],outbox:[],committedResult:value};
 }
 return {
  redactionAuthority,
  async prepareAdd(ctx:RequestContext,command:CommandInput<CommentText>){text(command.input);const action='comment.add',prepared=await prepare(ctx,command,action),id=createUlid(),effects=await mentions.prepare(ctx,prepared.subject,id,command.input.mentions);return plan(command,action,prepared,[insert(comments,{id,app_id:prepared.subject.appId,entity_id:prepared.subject.entityId,record_id:prepared.subject.recordId,author_id:ctx.principal.id,author_kind:ctx.principal.kind,author_label:null,body:command.input.body,mentions_json:JSON.stringify(command.input.mentions),version:1,created_at:ctx.now,updated_at:ctx.now,deleted_at:null})],{id,version:1,body:command.input.body,mentions:command.input.mentions,edited:false},effects);},
  async prepareEdit(ctx:RequestContext,command:CommandInput<CommentTarget&CommentText>){text(command.input);const action='comment.edit',prepared=await prepare(ctx,command,action),{row,where}=await owned(ctx,command.input),prior=JSON.parse(row.mentions_json) as string[],effects=await mentions.prepare(ctx,prepared.subject,command.input.id,command.input.mentions.filter(id=>!prior.includes(id)));return plan(command,action,prepared,[{kind:'update',table:comments,set:{body:command.input.body,mentions_json:JSON.stringify(command.input.mentions),updated_at:ctx.now,version:command.input.version+1},where,expectedRows:1}],{id:command.input.id,version:command.input.version+1,body:command.input.body,mentions:command.input.mentions,edited:true},effects);},
  async prepareRemove(ctx:RequestContext,command:CommandInput<CommentTarget>){const action='comment.delete',prepared=await prepare(ctx,command,action),{where}=await owned(ctx,command.input);return plan(command,action,prepared,[{kind:'update',table:comments,set:{body:null,mentions_json:'[]',deleted_at:ctx.now,updated_at:ctx.now,version:command.input.version+1},where,expectedRows:1}],{id:command.input.id,version:command.input.version+1,deleted:true});},
  async prepareRedact(ctx:RequestContext,command:CommandInput<CommentRedaction>){
   const input=command.input,reason=input.reason.trim(),action='comment.redact',prepared=await prepare(ctx,command,action),role=await redactionAuthority(ctx);
   if(!reason||reason.length>280)throw new AdmissionError('validation','A short redaction reason is required.');
   const row=await deps.db.prepare('SELECT version,body,deleted_at FROM evidence_comments WHERE id=? AND app_id=? AND entity_id=? AND record_id=?').bind(input.id,input.subject.appId,input.subject.entityId,input.subject.recordId).first<{version:number;body:string|null;deleted_at:string|null}>();
   if(!row||row.deleted_at)throw new AdmissionError('not_found','Comment not found.');
   if(row.version!==input.version)throw new AdmissionError('version_conflict','The comment changed; reload its latest version.');
   if(row.body===null)throw new AdmissionError('validation','Nothing to change.');
   const where=and(eq(comments,'id',input.id),eq(comments,'app_id',input.subject.appId),eq(comments,'entity_id',input.subject.entityId),eq(comments,'record_id',input.subject.recordId),eq(comments,'version',input.version),trustedPredicate('deleted_at IS NULL AND body IS NOT NULL'));
   const mutations:SqlMutation[]=[{kind:'update',table:comments,set:{body:null,mentions_json:'[]',updated_at:ctx.now,version:input.version+1},where,expectedRows:1}];
   // Older add/edit receipts are readable history too. Remove their body without
   // changing command identity, its result state or the other recorded facts.
   const receipts=(await deps.db.prepare(`SELECT command_id,result_json FROM command_admissions WHERE EXISTS(SELECT 1 FROM json_tree(result_json) WHERE key='id' AND value=?)`).bind(input.id).all<{command_id:string;result_json:string}>()).results;
   const scrub=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(scrub);
    if(!value||typeof value!=='object')return value;
    const item=value as Record<string,unknown>;
    if(item.id===input.id&&'body' in item)return {...item,body:null,mentions:[],redacted:true};
    return Object.fromEntries(Object.entries(item).map(([key,value])=>[key,scrub(value)]));
   };
   for(const receipt of receipts)mutations.push({kind:'update',table:commandTable,set:{result_json:JSON.stringify(scrub(JSON.parse(receipt.result_json)))},where:and(eq(commandTable,'command_id',receipt.command_id),eq(commandTable,'result_json',receipt.result_json)),expectedRows:1});
   mutations.push(insert(redactions,{id:command.commandId,comment_id:input.id,app_id:input.subject.appId,entity_id:input.subject.entityId,record_id:input.subject.recordId,actor_id:ctx.principal.id,actor_kind:ctx.principal.kind,reason,created_at:ctx.now}));
   const result=plan(command,action,prepared,mutations,{id:input.id,version:input.version+1,redacted:true});
   result.guards=[...result.guards,role];return result;
  },
 };
}
