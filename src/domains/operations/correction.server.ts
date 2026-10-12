import {createClaimService} from '../evidence/claims.server';
import type {EvidenceDependencies} from '../evidence/ports';
import type {OperationsEnvironment} from './ports';
import {ApiError} from '../../core/registry/errors';
import {canonical} from '../../adapters/crypto.server';
export function createCaseCorrectionAdapter(d:EvidenceDependencies):OperationsEnvironment['correct']{const claims=createClaimService(d);return async(ctx,c,input)=>{const row=await d.db.prepare('SELECT subject_json,app_id FROM evidence_claims WHERE id=?').bind(input.claimId).first<{subject_json:string|null;app_id:string}>();if(!row||row.app_id!==c.appId||!row.subject_json||canonical(JSON.parse(row.subject_json))!==canonical(c.subject))throw new ApiError('not_found','The claim is not bound to this case.');return claims.prepareCorrect(ctx,{commandId:input.commandId,claimId:input.claimId,expectedVersion:input.claimVersion,replacement:input.replacement,reason:input.reason,evidence:input.evidence});};}
