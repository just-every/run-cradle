import type { RequestContext } from '../authority/ports';
import type { SqlPredicate } from '../admission/ports';
import type { Snapshot, Candidate, CurrentVersions, Formulation } from './contracts';
import type { ArtifactReference } from '../construction/runner-client.server';
export interface IntelligenceSourcePort {
 /** Must load policy-filtered authoritative bytes; never accepts model-supplied facts. */
 authorizeProjection(ctx:RequestContext,snapshot:Snapshot,profileId:string,fieldIds:string[]):Promise<void>;
 checkAuthority(ctx:RequestContext,snapshot:Snapshot,selectedIds:string[]):Promise<{issues:import('./contracts').CheckIssue[];guards:SqlPredicate[]}>;
 load(ctx:RequestContext,sourceId:string,version:number):Promise<Snapshot['sources'][number]>;
 current(ctx:RequestContext,snapshot:Snapshot):Promise<CurrentVersions>;
 /** Atomic current-source/resource/grant guards owned by their canonical domains. */
 guards(ctx:RequestContext,snapshot:Snapshot):Promise<SqlPredicate[]>;
}
export interface IntelligenceArtifactPort { put(ctx:RequestContext,bytes:Uint8Array,purpose:string):Promise<ArtifactReference> }
export interface OptimizerPort {run(ctx:RequestContext,input:{jobId:string;formulation:Formulation;snapshot:Snapshot;wallSeconds:number}):Promise<{candidate:Candidate;sourceHash:string;artifactHash:string;jobId:string}>}
export interface StrategyExecutionPort {
 /** Prepares ordinary cases/decisions and exact resource reservations; never creates grants. */
 prepare(ctx:RequestContext,input:{commandId:string;mandateId:string;strategyId:string;snapshot:Snapshot;candidate:Candidate;decisionId:string|null}):Promise<{caseIds:string[];decisionIds:string[];guards:SqlPredicate[];mutations:import('../admission/ports').SqlMutation[];effectPlans?:import('../admission/ports').AdmissionPlan<unknown>[]} >;
}
