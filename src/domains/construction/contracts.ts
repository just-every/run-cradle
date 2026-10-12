import type { Versioned, Impact, Failure, Id } from '../../contracts/primitives';
export type SourceFile = { path: string; content: string };
export type SourceSnapshot = { id: Id; appId: Id; sha256: string; files: SourceFile[]; parentId: Id | null; producerId: string; createdAt: string };
export type Candidate = Versioned & { appId: Id | null; brief: string; parentReleaseId: Id | null; sourceSnapshotId: Id; sourceHash: string; state: 'preparing' | 'building' | 'preview_ready' | 'evaluating' | 'ready_for_decision' | 'rejected' | 'failed' | 'adopted'; previewUrl: string | null; diff: { schema: string[]; source: string[]; permissions: string[]; egress: string[]; migrations: string[]; backfill: string[]; inFlight: string[] }; impact: Impact; evaluationIds: Id[]; recoveryPlanId: Id | null; failure: Failure['error'] | null };
export type Evaluation = Versioned & { candidateId: Id; mode: 'historical' | 'held_out' | 'shadow' | 'sandbox'; datasetId: Id; evaluatorId: Id; state: 'queued' | 'running' | 'passed' | 'failed' | 'inconclusive'; eligible: number; evaluated: number; passed: number; skipped: { reason: string; count: number }[]; artifactIds: Id[]; scorecardId: Id; producerCanGrade: false; sourceHash: string; datasetHash: string; checkerHash: string; sealedBeforeGeneration: boolean };
export type AppSource = { files: SourceFile[]; schemaRevision: string; policyVersion: number; actionVersion: number; sourcePolicy: { grantsActive: false; contextExpanded: false }; impact: Impact; diff: Candidate['diff']; migrationPlanId: string; recoveryPlanId: string };
export type CandidatePrepare = { appId: Id | null; brief: string; sourceIds: Id[]; parentReleaseId: Id | null };
export type CandidateRevise = { candidateId: Id; instruction: string; sourceSnapshotId: Id };
export type BuildResult = { jobId: string; sourceHash: string; artifactHash: string; state: 'succeeded' | 'failed'; previewUrl: string | null; signedResult: string };
export type CandidateDetail = { ownerBaselineSnapshotId: Id | null; candidate: Candidate; source: SourceSnapshot; generated: AppSource; build: BuildResult | null };
export const candidateEntityId='00000000000000000000001000';
export const releaseEntityId='00000000000000000000001100';
export const sourceEntityId='00000000000000000000001020';
export const improvementEntityId='00000000000000000000001150';
export type AdoptionReview={candidateId:Id;expected:{ref:{appId:Id;entityId:Id;recordId:Id};version:number};sourceHash:string;parentReleaseId:Id|null;fieldLabels:Record<string,string>;choices:{id:string;label:string;decisionId:Id|null;releaseGrantId:Id|null}[];allowed:boolean;blockers:string[]};

export type SourceIntakeResult={subject:import('../../contracts/primitives').RevisionRef;fieldIds:Id[]};
