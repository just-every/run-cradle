import type {RequestContext,PolicyPort} from '../../domains/authority/ports';
import type {AdmissionPlan,AdmissionPort,SqlPredicate} from '../../domains/admission/ports';
import type {RecordPort} from '../../domains/records/ports';
import type {EvidencePort} from '../../domains/evidence/ports';
import type {EffectRequest,Attempt,Run} from '../../domains/execution/contracts';
import type {CommandInput,RevisionRef,Json} from '../../contracts/primitives';
import type {RepairCase} from './contracts';
export type RepairEffect={expected:RevisionRef[];authority:{grantId:string;grantVersion:number;purpose:string;fieldIds:string[]};kind:'quote_request'|'booking'|'cancel_booking'|'invoice_handoff';connectionId:string;subject:RevisionRef;input:Json;commandId:string;controlEpoch?:number;cost:EffectRequest['cost']};
/** X bridge must preserve its durable preparation, actual capabilities and explicit contractor-agreement semantics. */
export interface RepairExecutionPort {
 prepare(ctx:RequestContext,request:RepairEffect):Promise<AdmissionPlan<{runId:string;attemptId:string}>>;
 read(ctx:RequestContext,attemptId:string):Promise<{attempt:Attempt;runState?:Run['state'];receiptId:string|null;receiptVersion?:number|null;externalId:string|null;contractorAccepted:boolean;accountingReadback:boolean;guards:SqlPredicate[]}>;
 accountingCapability(ctx:RequestContext):Promise<'ready'|'unconfigured'|'unavailable'>;
}
export interface RepairCasePort {
 prepareOpen(ctx:RequestContext,request:{workOrder:RevisionRef;objective:string;sourceIds?:string[];sourceVersions?:{id:string;version:number}[];mandate?:{id:string;version:number};command:CommandInput<unknown>}):Promise<{case:RepairCase;guards:SqlPredicate[];mutations:AdmissionPlan<unknown>['mutations']}>;
 get(ctx:RequestContext,id:string):Promise<RepairCase>;
 guards(ctx:RequestContext,id:string,expectedEpoch:number|undefined):Promise<SqlPredicate[]>;
}
export type RepairDependencies={intakeClaims(ctx:RequestContext,intakeId:string):Promise<string[]>;providerConfiguration?(ctx:RequestContext,request:EffectRequest):Promise<import('../../domains/execution/repair-bridge.server').RepairProviderConfiguration>;authoritySelection(ctx:RequestContext,request:{action:string;command:CommandInput<unknown>;connectionId?:string}):Promise<{grantId?:string;grantVersion?:number;purpose?:string;fieldIds?:string[]}>;db:D1Database;policy:PolicyPort;admission:AdmissionPort;records:RecordPort;evidence:Pick<EvidencePort,'source'>;execution:RepairExecutionPort;cases:RepairCasePort};
