import type {ObjectiveVerifier} from './environment.server';
import type {RepairDependencies} from '../../apps/repairs/ports';
import {verifyRepairObjective} from '../../apps/repairs/verification.server';
/** Concrete installed repair witness checker; other apps explicitly register their own objective checker. */
export function repairObjectiveVerifier(dependencies:RepairDependencies):ObjectiveVerifier{return{id:'repair.accepted-and-handed-off',version:1,async check(ctx,c,m){const result=await verifyRepairObjective(dependencies,ctx,c.subject.recordId);return{verification:{verifierId:'repair.accepted-and-handed-off',verifierVersion:1,state:result.state,checks:result.checks,witnesses:result.witnesses},guards:result.guards};}};}
export function createObjectiveVerifierCatalogue(verifiers:readonly ObjectiveVerifier[]){const map=new Map<string,ObjectiveVerifier>();for(const verifier of verifiers){if(map.has(verifier.id))throw new Error('Duplicate objective verifier');map.set(verifier.id,verifier);}return map;}
export function launchObjectiveVerifier(db:D1Database,policy:import('../authority/ports').PolicyPort):ObjectiveVerifier{const checker=createLaunchReadinessVerifier(db,policy);return{id:'launch.readiness',version:1,async check(ctx,c,m){const result=await checker.check(ctx,c.subject.recordId,m.verification.target);return{verification:{verifierId:'launch.readiness',verifierVersion:1,state:result.state,checks:result.checks,witnesses:result.witnesses},guards:result.guards};}};}
import {createLaunchReadinessVerifier} from '../../apps/launch/objective.server';
