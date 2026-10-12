import type { Ref, RevisionRef } from '../../contracts/primitives';
import type { RequestContext, PolicyPort } from '../authority/ports';
import type { AdmissionPort, SqlMutation, SqlPredicate, AuditFact } from '../admission/ports';
import type { SourceRef, Source, ContextArtifact, EvidenceLink } from './contracts';
export type EvidenceAccessPort={prepareWrite(ctx:RequestContext,ref:Ref,fieldIds:readonly string[],purpose:'upload'|'capture'):Promise<{revision:RevisionRef;guards:SqlPredicate[]}>;checkReference(ctx:RequestContext,ref:Ref,fieldIds:readonly string[],purpose:'read'|'export'|'provider_context'):Promise<void>;egress(ctx:RequestContext,request:{appId:string;profileId:string;purpose:string;fieldIds:string[]}):Promise<{destination:string;expiresAt:string}>};
export type EvidencePort={source(ctx:RequestContext,id:string):Promise<{source:Source;ref:SourceRef}>;buildContext(ctx:RequestContext,request:{appId:string;purpose:string;refs:SourceRef[];fieldIds:string[];profileId:string;historicalCutoff?:string}):Promise<ContextArtifact>;invalidate(ctx:RequestContext,changed:SourceRef[]):Promise<{proposalIds:string[];caseIds:string[];strategyIds:string[]}>};
export type PreparedChange<T>={guards:SqlPredicate[];mutations:SqlMutation[];audit:AuditFact[];next:T};
export type EvidenceDependencies={db:D1Database;bucket:R2Bucket;policy:PolicyPort;access:EvidenceAccessPort;admission:AdmissionPort};
export type ProposalActionPort={prepare(ctx:RequestContext,action:string,subject:RevisionRef,input:unknown,evidence:EvidenceLink[]):Promise<PreparedChange<unknown>>};
