import type {RequestContext,PolicyPort} from '../authority/ports';
import type {AdmissionPort,AdmissionPlan,SqlPredicate,SqlMutation} from '../admission/ports';
import type {ModelPort,ModelContextArtifact} from '../execution/model-ports';
import type {CommandInput,RevisionRef,Json,Money} from '../../contracts/primitives';
import type {Case,Mandate,Verification,GrantSelection} from './contracts';
export type Prepared<T>={value:T;guards:SqlPredicate[];mutations:SqlMutation[]};
export type CaseSnapshot={sourceIds:string[];versions:RevisionRef[];guards:SqlPredicate[];fingerprint:string;freshness:Case['freshness'];context:ModelContextArtifact;profileId:string;maximumCost:Money;releaseId:string;actions:{name:string;version:number;description:string;inputSchema:Json}[];intendedActions?:{action:string;inputHash:string;proposalId:string}[];unknownAttempts:string[];unknownEffects?:{id:string;firstPossibleEffectAt:string;deadline:string;ageSeconds:number}[]};
export interface OperationsEnvironment {
 subjectRevision(ctx:RequestContext,value:Case):Promise<RevisionRef>;
 /** Checks canonical subject policy and every copied source before returning anything. */
 project(ctx:RequestContext,value:Case|Mandate):Promise<void>;
 refresh(ctx:RequestContext,value:Case,mandate:Mandate):Promise<CaseSnapshot>;
 verify(ctx:RequestContext,value:Case,mandate:Mandate):Promise<{verification:Omit<Verification,'id'|'version'|'createdAt'|'updatedAt'|'caseId'|'checkedAt'>;guards:SqlPredicate[]}>;
 prepareAction(ctx:RequestContext,action:string,command:CommandInput<Json>,selection:GrantSelection):Promise<AdmissionPlan<unknown>>;
 reconcile(ctx:RequestContext,attemptId:string):Promise<{state:'confirmed'|'refused'|'partial'|'unknown'}>;
 /** Validates saved current action grants, sources, resources, schema and release on resume. */
 revalidate(ctx:RequestContext,value:Case,mandate:Mandate):Promise<SqlPredicate[]>;
 prepareMandate(ctx:RequestContext,input:{appId:string;outcome:string;sourceIds:string[];constraints:string[]}):Promise<Omit<Mandate,'id'|'version'|'createdAt'|'updatedAt'|'state'>>;
 correct(ctx:RequestContext,value:Case,input:{commandId:string;claimId:string;claimVersion:number;replacement:import('../../contracts/primitives').CellValue;reason:string;evidence:import('../evidence/contracts').EvidenceLink[]}):Promise<AdmissionPlan<unknown>>;
}
export type OperationsDependencies={db:D1Database;policy:PolicyPort;admission:AdmissionPort;model:ModelPort|null;environment:OperationsEnvironment;cursorSecret:string;clock?:()=>string};
