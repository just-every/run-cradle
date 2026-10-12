import type {RequestContext} from '../authority/ports';
import type {CommandInput,RevisionRef} from '../../contracts/primitives';
import {createUlid} from '../../core/shared/ids';
import {ApiError} from '../../core/registry/errors';
import type {Case,Mandate,GrantSelection} from './contracts';
import {trustedPredicate} from '../admission/sql.server';
import type {EvidencePort} from '../evidence/ports';
import {specification} from './validators';
import {OperationsRepository,type OperationsProjectionDependencies} from './repository.server';
/** Opening requires the exact reviewed active mandate; it never activates authority. */
export function createRepairCaseAdapter(repo:OperationsRepository<OperationsProjectionDependencies>,evidence?:Pick<EvidencePort,'source'>){
 async function mandate(ctx:RequestContext,appId:string,entityId:string,selection:{id:string;version:number}|undefined){
  if(!selection)throw new ApiError('validation','Review and select the exact active mandate version.');
  const m=await repo.getMandate(ctx,selection.id);
  specification.parse(Object.fromEntries(Object.entries(m).filter(([key])=>!['id','version','createdAt','updatedAt','state','review'].includes(key))));
  if(m.version!==selection.version)throw new ApiError('version_conflict','The reviewed mandate changed.');
  if(m.appId!==appId||m.state!=='active'||!m.eligibleEntities.includes(entityId)||m.unanswered.length)throw new ApiError('invalid_transition','The reviewed active mandate does not cover this work order.');
  return m;
 }
 return {
 async prepareOpen(ctx:RequestContext,input:{workOrder:RevisionRef;objective:string;sourceIds?:string[];sourceVersions?:{id:string;version:number}[];mandate?:{id:string;version:number};command:CommandInput<unknown>}){
  const m=await mandate(ctx,input.workOrder.ref.appId,input.workOrder.ref.entityId,input.mandate),c=initialCase(ctx,m,input.workOrder.ref,input.objective);
  const guards=[repo.mandateGuard(m),...((await repo.d.policy.scope(ctx,{appId:m.appId,entityId:input.workOrder.ref.entityId,purpose:'read'})).currentAuthorityGuards)];
  const accountable=await repo.d.db.prepare("SELECT id FROM authority_principals WHERE id=? AND kind='human' AND state='active'").bind(c.accountableId).first();
  if(!accountable)throw new ApiError('invalid_transition','The mandate requires a current accountable human.');
  guards.push(trustedPredicate("EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND kind='human' AND state='active')",[c.accountableId]));
  c.sourceIds=[...new Set([...m.sourceIds,...(input.sourceIds??[])])];
  if(c.sourceIds.length&&!evidence)throw new ApiError('unconfigured','Current case evidence access is required.');
  if(input.sourceVersions && (new Set(input.sourceVersions.map(v=>v.id)).size!==input.sourceVersions.length||input.sourceVersions.some(v=>!c.sourceIds.includes(v.id))))throw new ApiError('validation','Review only the exact case sources.');
  for(const id of c.sourceIds){const {source}=await evidence!.source(ctx,id);if(!input.sourceVersions?.some(v=>v.id===id&&v.version===source.version))throw new ApiError('stale_evidence','The reviewed case evidence changed.');if(source.ownerAppId!==m.appId)throw new ApiError('forbidden','Case evidence belongs to another app.');guards.push(trustedPredicate('EXISTS(SELECT 1 FROM evidence_sources WHERE id=? AND current_version=? AND erased_at IS NULL)',[id,source.version]));}
  // Opening admits a record and accountability; background progression needs a separate explicit wake.
  c.nextWakeAt=null;c.nextStep='Review the repair scope and current evidence before selecting the next action.';
  c.freshness={...c.freshness,sourcesExpected:c.sourceIds.length,unknowns:['Repair scope and outcome have not yet been independently checked.']};
  return{case:{...c},guards,mutations:[repo.mutation('cases',m.appId,c,null)]};
 },
 async get(ctx:RequestContext,id:string){return {...await repo.getCase(ctx,id)};},
 async guards(ctx:RequestContext,id:string,expectedEpoch:number|undefined){const c=await repo.getCase(ctx,id),m=await repo.getMandate(ctx,c.mandateId);if(!['active','waiting','blocked'].includes(c.state)||m.state!=='active')throw new ApiError('invalid_transition','The case and mandate must permit current repair work.');if(expectedEpoch!==c.controlEpoch)throw new ApiError('version_conflict','The current control epoch is required.');if(c.mandateVersion!==m.version)throw new ApiError('version_conflict','The mandate changed. Resume with current limits.');return[repo.caseGuard(c,true),repo.mandateGuard(m)];},
 async authoritySelection(ctx:RequestContext,input:{action:string;command:CommandInput<unknown>;connectionId?:string}):Promise<GrantSelection>{
 const command=input.command;const refs=command.expected;const matches:Case[]=[];for(const ref of refs){const rows=await repo.d.db.prepare('SELECT id FROM operation_cases WHERE app_id=? AND entity_id=? AND subject_id=?').bind(ref.ref.appId,ref.ref.entityId,ref.ref.recordId).all<{id:string}>();for(const row of rows.results){const c=await repo.getCase(ctx,row.id);if(!matches.some(x=>x.id===c.id))matches.push(c);}}
 if(matches.length!==1)throw new ApiError('forbidden','An exact persisted case is required to select action authority.');const c=matches[0]!,m=await repo.getMandate(ctx,c.mandateId);if(m.state!=='active'||m.version!==c.mandateVersion)throw new ApiError('invalid_transition','The current active mandate is required.');const selection=m.grants[input.action];if(!selection||!m.actionIds.includes(input.action))throw new ApiError('forbidden','This mandate has no selected grant for the action.');return selection;
 }
 };
}

export function initialCase(ctx:RequestContext,m:Mandate,subject:import('../../contracts/primitives').Ref,objective:string):Case{const c:Case={id:createUlid(),version:1,createdAt:ctx.now,updatedAt:ctx.now,appId:m.appId,mandateId:m.id,mandateVersion:m.version,objective:objective,subject:subject,state:'active',controlEpoch:0,planRevisionId:null,decisionIds:[],runIds:[],verificationIds:[],nextWakeAt:ctx.now,stopReason:null,accountableId:m.escalateTo[0]!,budget:structuredClone(m.budget),freshness:{asOf:ctx.now,sourcesKnown:0,sourcesExpected:m.sourceIds.length,staleSourceIds:[],unknowns:['Objective has not yet been independently checked.']},allowedActions:[],lastProgressAt:ctx.now,progressFingerprint:null,consecutiveNoProgress:0,impact:m.impact,recommendation:null,nextStep:'Refresh authorized evidence and inspect the objective.',sourceIds:m.sourceIds};return c;}
