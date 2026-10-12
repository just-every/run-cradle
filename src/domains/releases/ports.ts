import type { RevisionRef } from '../../contracts/primitives';
import type { RequestContext } from '../authority/ports';
import type { SqlMutation, SqlPredicate } from '../admission/ports';
import type { CandidateDetail } from '../construction/contracts';
import type { RecoveryPlan, RuntimeReadback, Release } from './contracts';
export interface SourceDeploymentPort {
 prepare(ctx:RequestContext,candidate:CandidateDetail):Promise<RuntimeReadback>;
 readback(ctx:RequestContext,candidate:CandidateDetail,deploymentId:string):Promise<RuntimeReadback>;
 activate(ctx:RequestContext,readback:RuntimeReadback):Promise<RuntimeReadback>;
 stop(ctx:RequestContext,deploymentId:string):Promise<void>;
 verify(ctx:RequestContext,readback:RuntimeReadback):Promise<void>;
}
export type MigrationPhaseProof={expand:boolean;backfill:boolean;verify:boolean;switch:boolean;contract:'retained_for_recovery'|'performed'};
export interface ReleaseMigrationPort {
 prepare(ctx:RequestContext,candidate:CandidateDetail):Promise<{migrationIds:string[];guards:SqlPredicate[];mutations:SqlMutation[];rehearsalArtifactHash:string;recovery:RecoveryPlan;phaseProof:MigrationPhaseProof;priorDataHash:string;candidateDataHash:string}>;
 recover(ctx:RequestContext,release:Release,plan:RecoveryPlan):Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}>;
}
export interface ReleaseAuthorityPort {
 assert(ctx:RequestContext,input:{subject:RevisionRef;appId:string;candidateId:string;sourceHash:string;parentReleaseId:string|null;decisionId:string|null;grantId:string|null;action:'release.adopt'|'release.recover';recoveryPlanId:string}):Promise<{guards:SqlPredicate[];issuerId:string;issuerKind:'human';allowsAccessChange:boolean;allowsEgressChange:boolean}>;
}

export interface ReleaseReviewPort { review(ctx:RequestContext,candidate:CandidateDetail):Promise<import('../construction/contracts').AdoptionReview>; }
