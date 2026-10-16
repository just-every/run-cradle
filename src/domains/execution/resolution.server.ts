import { resolutionFile } from './resolution-file.server';
import { createUlid } from '../../core/shared/ids';
import { ApiError } from '../../core/registry/errors';
import { canonical, sha256 } from '../../adapters/crypto.server';
import type { ProviderResult } from '../../adapters/contracts';
import type { RequestContext } from '../authority/ports';
import type { AdmissionPlan } from '../admission/ports';
import { and, eq, trustedPredicate } from '../admission/sql.server';
import type { ExecutionDependencies } from './ports';
import type { AttemptReview, EffectRequest, HumanResolution, Receipt } from './contracts';
import { executionRepository, attemptDTO, receiptDTO, type RunRow, type ReceiptRow } from './repository.server';
import { attemptsTable, receiptsTable, runsTable } from './tables.server';
import { RUN_ENTITY_ID } from './metadata.server';
import { attemptResolveSchema } from './validators';
import type { z } from 'zod';
type Input = z.infer<typeof attemptResolveSchema>;

/** Human evidence resolves the original effect; it never calls a provider. */
export function createHumanResolution(d:ExecutionDependencies) {
 const repo=executionRepository(d.db);
 async function permit(ctx:RequestContext,run:RunRow,hash:string) {
  if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||ctx.principal.credentialId)
   throw new ApiError('forbidden','A current authorized human session is required.');
  return d.policy.authorize({...ctx,now:new Date().toISOString()},{appId:run.app_id,action:'attempt.resolve',
   expected:[{ref:{appId:run.app_id,entityId:RUN_ENTITY_ID,recordId:run.id},version:run.version}],cost:[],inputHash:hash});
 }
 async function selected(id:string) {
  const attempt=await repo.attempt(id),run=attempt?await repo.run(attempt.run_id):null;
  if(!attempt||!run)throw new ApiError('not_found','Attempt not found.');
  return {attempt,run};
 }
 async function identity(ctx:RequestContext,raw:Input) {
  const input=attemptResolveSchema.parse(raw),{run}=await selected(input.attemptId),canonicalInputHash=await sha256(canonical(input));
  await permit(ctx,run,canonicalInputHash);
  await resolutionFile(d.db,d.policy,ctx,run.app_id,input.evidence.fileId);
  return {appId:run.app_id,canonicalInputHash};
 }
 async function review(ctx:RequestContext,id:string):Promise<AttemptReview> {
  const {attempt,run}=await selected(id);
  let canResolve=false;
  if(attempt.state==='unknown')try{await permit(ctx,run,await sha256(id));canResolve=true;}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='forbidden')throw error;}
  const receipt=attempt.receipt_id?await repo.receipt(attempt.receipt_id):null;
  return {appId:run.app_id,attempt:attemptDTO(attempt),receipt:receipt?receiptDTO(receipt):null,canResolve};
 }
 async function prepare(ctx:RequestContext,commandId:string,raw:Input):Promise<AdmissionPlan<Receipt>> {
  const input=attemptResolveSchema.parse(raw),{attempt:a,run}=await selected(input.attemptId);
  const canonicalInputHash=await sha256(canonical(input)),authority=await permit(ctx,run,canonicalInputHash);
  if(a.version!==input.expectedVersion)throw new ApiError('version_conflict','This attempt changed. Refresh before resolving it.');
  if(a.state!=='unknown'||!a.first_possible_effect_at)
   throw new ApiError('invalid_transition','Only an unresolved possible external effect can be resolved. Existing decisions cannot be replaced.');
  const existing=await d.db.prepare("SELECT id FROM execution_receipts WHERE attempt_id=? AND method='human_evidence'").bind(a.id).first();
  if(existing)throw new ApiError('invalid_transition','This effect already has a human resolution.');
  const attachment=await resolutionFile(d.db,d.policy,ctx,run.app_id,input.evidence.fileId);
  const now=new Date().toISOString(),id=createUlid(),request=JSON.parse(run.request_json) as EffectRequest;
  const resolution:HumanResolution={outcome:input.outcome,actorId:ctx.principal.id,resolvedAt:now,evidence:{...input.evidence,...(attachment.sha256?{fileSha256:attachment.sha256}:{})},
   originalEffect:{attemptId:a.id,runId:a.run_id,commandId:a.command_id,connectionId:a.connection_id,provider:a.provider,action:a.action,idempotencyKey:a.idempotency_key,inputHash:a.input_hash,externalId:a.external_id,firstPossibleEffectAt:a.first_possible_effect_at}};
  const result:ProviderResult=input.outcome==='done'?{state:'confirmed',externalId:a.external_id??'',requestId:null,receiptHash:await sha256(canonical(resolution)),value:{humanEvidence:true}}:{state:'refused',code:'human_evidence_not_done',message:'An authorized operator established that the effect did not occur.',retryable:false};
  const row:ReceiptRow={id,attempt_id:a.id,provider:a.provider,external_id:a.external_id,status:result.state,evidence_file_id:input.evidence.fileId??null,observed_at:now,reconciled_at:now,method:'human_evidence',message:input.outcome==='done'?'An authorized operator established that the effect occurred.':result.state==='refused'?result.message:'',result_json:canonical({...result,externalId:a.external_id,humanResolution:resolution}),created_at:now,updated_at:now,version:1};
  const settlement=await d.settlement(ctx,request,JSON.parse(a.reservation_ids_json),result,{commandId:JSON.parse(a.authorization_json??'{}').commandId??run.origin_command_id,attemptId:a.id,inputHash:a.authority_hash??'',humanEvidence:{receiptId:id,previousReceiptId:a.receipt_id}});
  if(settlement.reconciliations?.length)row.result_json=canonical({...JSON.parse(row.result_json),budgetReconciliation:settlement.reconciliations});
  const observed=d.observations?await d.observations(ctx,{attemptId:a.id,connectionId:a.connection_id,kind:input.outcome==='done'?'accepted':'refused',receiptId:id,retryAt:null,failureCode:input.outcome==='not_done'?'human_evidence_not_done':null,message:row.message}):{guards:[],mutations:[]};
  return {commandId,action:'attempt.resolve',appId:run.app_id,canonicalInputHash,permit:authority,
   guards:[trustedPredicate("NOT EXISTS(SELECT 1 FROM execution_receipts WHERE attempt_id=? AND method='human_evidence')",[a.id]),...attachment.guards,...settlement.guards,...observed.guards],
   mutations:[{kind:'insert',table:receiptsTable,row},
    {kind:'update',table:attemptsTable,set:{state:result.state,receipt_id:id,next_check_at:null,finished_at:now,version:a.version+1,updated_at:now},where:and(eq(attemptsTable,'id',a.id),eq(attemptsTable,'version',input.expectedVersion)),expectedRows:1},
    {kind:'update',table:runsTable,set:{state:run.state==='cancelled'?'cancelled':input.outcome==='done'?'completed':'failed',version:run.version+1,lease_epoch:run.lease_epoch+1,lease_owner:null,lease_expires_at:null,next_wake_at:null,updated_at:now,failure_json:input.outcome==='done'?null:canonical({requestId:ctx.requestId,operation:'attempt.resolve',code:'provider_refused',message:row.message,retry:'after_change'})},where:and(eq(runsTable,'id',run.id),eq(runsTable,'version',run.version)),expectedRows:1},...settlement.mutations,...observed.mutations],
   audit:[{action:'attempt.resolve',subject:{appId:run.app_id,entityId:RUN_ENTITY_ID,recordId:run.id},changes:[],sourceIds:[],personalContentRefs:[id,...(input.evidence.fileId?[input.evidence.fileId]:[])]},...(settlement.reconciliations?.length?[{action:'execution.budget-reconciled',subject:null,changes:[],sourceIds:[],personalContentRefs:[id]}]:[])],events:[],outbox:[],committedResult:receiptDTO(row)};
 }
 return {identity,prepare,review};
}
