import type {OperationsRepository} from './repository.server';
import {createOperationConfigurationService,configurationSchema} from './configuration.server';
import {resolveBackgroundContext} from '../authority/background.server';
import {createReleaseAuthority} from '../authority/release.server';
import {candidateEntityId} from '../construction/contracts';
import {createRecoveryReviewService} from './recovery.server';
import {operationModelSchema} from './model.server';
import {createUlid} from '../../core/shared/ids';
import {ApiError} from '../../core/registry/errors';
import type {RequestContext} from '../authority/ports';
import type {ResourceBinding} from './portfolio-state.server';
export function createRuntimeConfigurationAdapters(repo:OperationsRepository){
 const configuration=createOperationConfigurationService(repo.d);
 async function runtime(appId:string){const value=await configuration.raw(appId);if(!value.runtime)throw new ApiError('unconfigured','Adopt explicit background identity, resource mappings, quality floor and recovery recipient.');return{value,runtime:value.runtime};}
 const recovery=createRecoveryReviewService(repo,async(ctx,appId)=>{await configuration.resolve(ctx,appId);return(await runtime(appId)).runtime.recoveryAssigneeId;}),authority=createReleaseAuthority(repo.d.db,repo.d.policy,recovery.decisionPort);
 return{recovery,
 async backgroundContext(caseId:string){const row=await repo.d.db.prepare('SELECT app_id FROM operation_cases WHERE id=?').bind(caseId).first<{app_id:string}>();if(!row)throw new ApiError('not_found','Case not found.');const selected=(await runtime(row.app_id)).runtime.background;return resolveBackgroundContext(repo.d.db,{...selected,requestId:createUlid(),ingress:'schedule'});},
 async improvementConfiguration(ctx:RequestContext,appId:string){const {value,runtime:chosen}=await runtime(appId);await configuration.resolve(ctx,appId);return{profileId:value.profileId,fieldIds:value.fieldIds,maximumCost:value.maximumCost,parentReleaseId:value.releaseId,qualityFloor:chosen.qualityFloor,registeredInstructions:[{schemaId:'operation.next-action',version:1,instructions:operationModelSchema.instructions}]};},
 async resourceBindings(){const rows=await repo.d.db.prepare('SELECT configuration_json FROM operation_configurations').all<{configuration_json:string}>();const map=new Map<string,ResourceBinding>();for(const row of rows.results){const value=configurationSchema.parse(JSON.parse(row.configuration_json));for(const resource of value.runtime?.resources??[]){if(map.has(resource.resourceId))throw new ApiError('validation','Canonical resource identity has conflicting adopted bindings.');map.set(resource.resourceId,{ref:resource.ref,capacityFieldId:resource.capacityFieldId});}}return map;},
 async recoveryAuthorization(ctx:RequestContext,releaseId:string,_reasons:string[]){const row=await repo.d.db.prepare('SELECT detail_json FROM app_releases WHERE id=?').bind(releaseId).first<{detail_json:string}>();if(!row)throw new ApiError('not_found','Release not found.');const release=JSON.parse(row.detail_json) as {appId:string;candidateId:string;sourceHash:string;recoveryPlanId:string};const selected=await runtime(release.appId);const candidate=await repo.d.db.prepare('SELECT version FROM construction_candidates WHERE id=? AND app_id=?').bind(release.candidateId,release.appId).first<{version:number}>();if(!candidate)throw new ApiError('not_found','Recovery candidate not found.');const decision=await repo.d.db.prepare("SELECT id FROM operation_recovery_reviews WHERE release_id=? AND state='approved'").bind(releaseId).first<{id:string}>();const selection={grantId:selected.runtime.recoveryGrantId,decisionId:decision?.id??null};if(!selection.grantId&&!selection.decisionId)return null;try{await authority.assert(ctx,{subject:{ref:{appId:release.appId,entityId:candidateEntityId,recordId:release.candidateId},version:candidate.version},appId:release.appId,candidateId:release.candidateId,sourceHash:release.sourceHash,parentReleaseId:releaseId,recoveryPlanId:release.recoveryPlanId,action:'release.recover',...selection});return selection;}catch(error){if(error instanceof Error&&'code'in error&&['forbidden','grant_revoked','grant_expired','separation_of_duties'].includes(String(error.code)))return null;throw error;}},
 prepareRecoveryDecision:recovery.prepare
 };
}
