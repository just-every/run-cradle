import {ZodError} from 'zod';
import {createUlid} from '../../core/shared/ids';
import {ApiError} from '../../core/registry/errors';
import {trustedPredicate,registerTable} from '../admission/sql.server';
import type {SqlPredicate,SqlMutation} from '../admission/ports';
import type {RequestContext} from '../authority/ports';
import type {Json} from '../../contracts/primitives';
import type {Case,Wake,Mandate,Verification,PlanRevision} from './contracts';
import {OperationsRepository} from './repository.server';
import {nextActionSchema} from './validators';
const modelUsage=registerTable('operation_model_usage',['id','app_id','case_id','call_json','observed_at']);
export function createOperationWorker(repo:OperationsRepository){
 const d=repo.d,now=()=>d.clock?.()??new Date().toISOString();
 return {async run(ctx:RequestContext,wakeId:string,workerId:string){
 let w=await repo.raw<Wake>('wakes',wakeId),c=await repo.getCase(ctx,w.caseId),m=await repo.getMandate(ctx,c.mandateId);
 if(w.state==='completed')return{case:c,wake:w};
 if(w.epoch!==c.controlEpoch||m.version!==c.mandateVersion||m.state!=='active'||!['active','waiting','blocked'].includes(c.state))throw new ApiError('invalid_transition','The wake is no longer current.');
 const selection=m.grants['case.wake'];if(ctx.principal.kind!=='human'&&!selection)throw new ApiError('forbidden','The mandate has no explicit wake authority.');
 const leaseTime=now();if(w.state==='leased'&&w.leaseUntil!>leaseTime)throw new ApiError('version_conflict','Another worker holds the wake.');
 async function write(nextC:Case,nextW:Wake,extra:SqlMutation[]=[],guards:SqlPredicate[]=[],claim=false){
 const stamp=now();const plan=await repo.plan({...ctx,now:stamp},createUlid(),'case.wake',c.appId,{wakeId,version:w.version,checkpoint:nextW.checkpoint},nextW,[repo.mutation('cases',c.appId,nextC,c.version),repo.mutation('wakes',c.appId,nextW,w.version),...extra],[repo.caseGuard(c,true),repo.mandateGuard(m),...guards,...(claim?[]:[trustedPredicate("EXISTS(SELECT 1 FROM operation_wakes WHERE id=? AND state='leased' AND lease_owner=? AND lease_until>?)",[w.id,workerId,stamp])])],selection,[await d.environment.subjectRevision(ctx,c)]);await d.admission.commit({...ctx,now:stamp},plan);c=nextC;w=nextW;
 }
 const nextC=(changes:Partial<Case>={}):Case=>({...c,...changes,version:c.version+1,updatedAt:now()});
 const nextW=(changes:Partial<Wake>={}):Wake=>({...w,...changes,version:w.version+1,updatedAt:now()});
 await write(nextC(),nextW({state:'leased',leaseOwner:workerId,leaseUntil:new Date(Date.parse(leaseTime)+120000).toISOString()}),[],[trustedPredicate("EXISTS(SELECT 1 FROM operation_wakes WHERE id=? AND (state IN ('queued','blocked') OR (state='leased' AND lease_until<=?)))",[w.id,leaseTime])],true);
 async function finish(state:Case['state'],reason:string|null,nextStep:string,verification?:Verification,guards:SqlPredicate[]=[]){const nextWakeAt=['waiting','active'].includes(state)?new Date(Date.parse(now())+m.reviewCadenceMinutes*60000).toISOString():null;const nc=nextC({state,stopReason:reason,nextStep,nextWakeAt,sourceIds:verification?[...new Set([...c.sourceIds,...verification.witnesses.filter(w=>w.sourceKind!=='execution_receipt'&&w.sourceKind!=='canonical_record').map(w=>w.sourceId)])]:c.sourceIds,verificationIds:verification?[...c.verificationIds,verification.id]:c.verificationIds});const nw=nextW({state:'completed',checkpoint:'done',leaseOwner:null,leaseUntil:null,nextWakeAt,failure:reason});const extras=verification?[repo.mutation('verifications',c.appId,verification,null)]:[];
 const plan=await repo.plan({...ctx,now:now()},createUlid(),'case.wake',c.appId,{wakeId,finish:state,version:w.version},nw,[repo.mutation('cases',c.appId,nc,c.version),repo.mutation('wakes',c.appId,nw,w.version),...extras],[repo.caseGuard(c,true),repo.mandateGuard(m),trustedPredicate("EXISTS(SELECT 1 FROM operation_wakes WHERE id=? AND lease_owner=? AND lease_until>?)",[w.id,workerId,now()]),...guards],selection,[await d.environment.subjectRevision(ctx,c)]);
 if(state==='needs_decision'||state==='blocked')plan.events=[{name:'operation.attention-required',version:1,subject:c.subject,payload:{caseId:c.id,reason:reason??'decision',recommendation:nextStep,impact:c.impact as unknown as Json,recipientIds:m.escalateTo,deadline:m.deadline,nextCheckAt:nextWakeAt},causeRunIds:c.runIds}];
 await d.admission.commit({...ctx,now:now()},plan);c=nc;w=nw;return{case:c,wake:w};}
 try{
 if(m.deadline&&m.deadline<=now())return finish('needs_decision','deadline','Decide whether to extend the deadline or stop; the objective remains unverified.');
 let snapshot=await d.environment.refresh({...ctx,now:now()},c,m);
 if(snapshot.unknownEffects?.some(effect=>effect.deadline<=now()))return finish('needs_decision','unknown_age','The original effect remains unknown past its reconciliation deadline. Decide the next safe investigation; do not resend the commitment.');
 if(snapshot.unknownAttempts.length){for(const id of snapshot.unknownAttempts){const receipt=await d.environment.reconcile({...ctx,now:now()},id);if(receipt.state==='unknown'||receipt.state==='partial')return finish('waiting','unknown_effect','Reconcile the original attempted effect before admitting another commitment.');}snapshot=await d.environment.refresh({...ctx,now:now()},c,m);}
 const verified=await d.environment.verify({...ctx,now:now()},c,m),v:Verification={...verified.verification,id:createUlid(),version:1,createdAt:now(),updatedAt:now(),caseId:c.id,checkedAt:now()};
 const required=m.verification.requiredEvidence;
 const passed=v.state==='passed'&&v.verifierId===m.verification.verifierId&&v.verifierVersion===m.verification.version&&v.checks.length>0&&v.checks.every(check=>check.passed===true)&&required.every(kind=>v.witnesses.some(witness=>witness.kind===kind&&witness.independent&&witness.current))&&v.witnesses.every(witness=>witness.current&&(witness.sourceKind==='execution_receipt'||witness.sourceKind==='canonical_record'||snapshot.sourceIds.includes(witness.sourceId)));
 if(passed)return finish('verified',null,'Objective independently verified.',v,[...snapshot.guards,...verified.guards]);
 if(v.state==='passed')v.state='inconclusive';
 if(w.checkpoint==='admitted'||w.checkpoint==='observing')return finish('waiting',null,'Observe receipts and independently check the outcome at the next wake.',v,[...snapshot.guards,...verified.guards]);
 const progressed=c.progressFingerprint!==snapshot.fingerprint;
 if(!progressed&&Date.parse(now())-Date.parse(c.lastProgressAt)>=m.stallAfterMinutes*60000)return finish('needs_decision','stall','Review the unchanged evidence and choose a revised constraint or further investigation.',v);
 if(w.checkpoint==='refresh'){
 if(c.budget.modelCallsRemaining<=0||c.budget.timeRemainingSeconds<=0)return finish('needs_decision','budget','Authorize a changed budget or take over; no further model action is admitted.',v);
 if(!d.model)return finish('blocked','provider_unavailable','Configure an authorized evaluated model profile; manual work remains available.',v);
 await write(nextC({freshness:snapshot.freshness,sourceIds:snapshot.sourceIds,lastProgressAt:progressed?now():c.lastProgressAt,progressFingerprint:snapshot.fingerprint,consecutiveNoProgress:progressed?0:c.consecutiveNoProgress+1,budget:{...c.budget,modelCallsRemaining:c.budget.modelCallsRemaining-1,timeRemainingSeconds:Math.max(0,c.budget.timeRemainingSeconds-60)}}),nextW({checkpoint:'planning',modelTask:{requestId:w.modelRequestId,purpose:'operation.next-action',profileId:snapshot.profileId,context:snapshot.context,input:{objective:c.objective,constraints:m.constraints,budget:c.budget,catalogue:snapshot.actions.filter(a=>m.actionIds.includes(a.name)),currentVersions:snapshot.versions,intendedActions:snapshot.intendedActions??[],previousPlanId:c.planRevisionId,reason:w.reason,failedVerification:v.checks} as unknown as Json,outputSchemaId:'operation.next-action',outputSchemaVersion:1,maximumCost:snapshot.maximumCost,deadline:new Date(Date.parse(now())+60000).toISOString()}}),[repo.mutation('verifications',c.appId,v,null)],snapshot.guards);
 }
 let plan:PlanRevision;
 if(w.planId){plan=await repo.raw<PlanRevision>('plans',w.planId);}else{
 if(!d.model)return finish('blocked','provider_unavailable','The model gateway is unavailable; manual work remains available.');
 if(!w.modelTask)throw new ApiError('invalid_transition','Durable model input is missing.');
 if(w.modelTask.context.sourceRefs.some(ref=>!snapshot.context.sourceRefs.some(current=>current.id===ref.id&&current.version===ref.version&&current.sha256===ref.sha256)))return finish('blocked','evidence_changed','The evidence changed during inference. Resume from current evidence.');
 const result=await d.model.generate({...ctx,now:now()},w.modelTask,value=>nextActionSchema.parse(value));
 const output=result.value;if(output.sourceIds.some(id=>!snapshot.sourceIds.includes(id)))throw new ApiError('invalid_provider_output','The plan cited a source outside the permitted context.');
 if(output.selected&&(!m.actionIds.includes(output.selected.action)||!snapshot.actions.some(a=>a.name===output.selected!.action)))throw new ApiError('invalid_provider_output','The plan selected an unavailable action.');
 if(output.nextWakeAt&&output.nextWakeAt<=now())throw new ApiError('invalid_provider_output','The plan wake must be in the future.');
 plan={id:createUlid(),version:1,createdAt:now(),updatedAt:now(),caseId:c.id,sourceVersions:snapshot.versions,triggerSourceIds:output.sourceIds,rationaleSummary:output.rationaleSummary,alternatives:output.alternatives,selected:output.selected,modelCallId:result.call.id,nextWakeAt:output.nextWakeAt};
 await write(nextC({planRevisionId:plan.id,recommendation:output.recommendation}),nextW({planId:plan.id}),[repo.mutation('plans',c.appId,plan,null),{kind:'insert',table:modelUsage,row:{id:result.call.id,app_id:c.appId,case_id:c.id,call_json:JSON.stringify(result.call),observed_at:now()}}],snapshot.guards);
 if(output.needsDecision)return finish('needs_decision','business_judgment',output.recommendation);
 }
 if(!plan.selected)return finish('waiting',null,c.recommendation??'Wait for new evidence before choosing another action.');
 const grant=m.grants[plan.selected.action];if(!grant)return finish('needs_decision','no_authority','The proposed action needs a specifically selected current grant.');
 const action=await d.environment.prepareAction({...ctx,now:now()},plan.selected.action,{commandId:w.actionCommandId,expected:plan.selected.expected,controlEpoch:c.controlEpoch,input:plan.selected.input},grant);
 if(action.action!==plan.selected.action||action.appId!==c.appId||action.commandId!==w.actionCommandId)throw new ApiError('invalid_provider_output','Action preparation returned a different commitment.');
 const resultValue=action.committedResult as {runId?:string};const nc=nextC({state:'waiting',nextStep:plan.selected.expectedOutcome,runIds:resultValue?.runId?[...new Set([...c.runIds,resultValue.runId])]:c.runIds}),nw=nextW({checkpoint:'admitted'});
 action.guards=[...action.guards,repo.caseGuard(c,true),repo.mandateGuard(m),...snapshot.guards,trustedPredicate("EXISTS(SELECT 1 FROM operation_wakes WHERE id=? AND lease_owner=? AND lease_until>?)",[w.id,workerId,now()])];action.mutations=[...action.mutations,repo.mutation('cases',c.appId,nc,c.version),repo.mutation('wakes',c.appId,nw,w.version)];await d.admission.commit({...ctx,now:now()},action);c=nc;w=nw;
 return finish('waiting',null,'The admitted action is being handled; independent outcome verification remains required.');
 }catch(error){
 // Never overwrite a newer human control epoch or conceal an effect after uncertain admission.
 const current=await repo.getCase(ctx,c.id);if(current.controlEpoch!==c.controlEpoch||current.version!==c.version)throw error;
 if(error instanceof Error&&/unknown/i.test(error.message)){await write(nextC({state:'waiting',stopReason:'unknown_effect',nextWakeAt:new Date(Date.parse(now())+m.reviewCadenceMinutes*60000).toISOString(),nextStep:'Reconcile the original model request before asking again.'}),nextW({state:'queued',leaseOwner:null,leaseUntil:null,failure:'unknown_effect'}));return{case:c,wake:w};}
 const code=error instanceof ApiError?error.code:error instanceof ZodError?'invalid_provider_output':error instanceof Error&&/refused/i.test(error.message)?'provider_refused':'provider_unavailable';return finish('blocked',code,code==='invalid_provider_output'?'The model response failed validation. Correct its profile or context; manual work is available.':'The operation could not safely continue. Inspect the recorded attempt and current authority before resuming.');
 }
 }};
}
