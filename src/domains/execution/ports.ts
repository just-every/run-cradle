import type { RequestContext, PolicyPort, AuthorityPermit } from '../authority/ports';
import type { AdmissionPort, SqlMutation, SqlPredicate } from '../admission/ports';
import type { ProviderAdapter, ProviderResult } from '../../adapters/contracts';
import type { EffectRequest, Attempt, Receipt, Run, Budget } from './contracts';
import type { Keyring } from '../connections/crypto.server';
export interface ExecutionPort { dispatch(ctx: RequestContext, outboxId: string): Promise<Attempt>; reconcile(ctx: RequestContext, attemptId: string): Promise<Receipt>; cancel(ctx: RequestContext, runId: string, expectedEpoch: number): Promise<Run> }
export type ExecutionGuardIdentity = {idempotencyKey:string;attemptId?:string};
export type ExecutionDependencies = {
 reconciliationAuthority?(ctx:RequestContext,request:EffectRequest,action:string):Promise<AuthorityPermit>;
 notificationMailAuthority?(ctx:RequestContext,request:EffectRequest,mode:'dispatch'|'reconcile'|'read'|'cancel'):Promise<AuthorityPermit>;
 payloads?: import('./payloads.server').PrivatePayloadStore;
 observations?(ctx:RequestContext,input:{attemptId:string;connectionId:string;kind:'accepted'|'unknown'|'refused';receiptId:string;retryAt:string|null;failureCode:string|null;message:string}):Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}>;
 db: D1Database; admission: AdmissionPort; policy: PolicyPort; workspaceId: string; keyring: Keyring;
 adapters: ReadonlyMap<string, ProviderAdapter> | ((ctx:RequestContext)=>ReadonlyMap<string,ProviderAdapter>);
 // Source/schema/release/control guards are evaluated in R's atomic boundary.
 currentGuards(ctx: RequestContext, request: EffectRequest, mode: 'dispatch' | 'reconcile', identity?:ExecutionGuardIdentity): Promise<SqlPredicate[]>;
 settlement(ctx: RequestContext, request: EffectRequest, reservationIds: string[], result: ProviderResult, binding:{commandId:string;attemptId:string;inputHash:string}): Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}>;
 budget(ctx: RequestContext, request: EffectRequest, reservationIds: string[]): Promise<Budget>;
 backgroundContext(runId: string, ingress: 'queue' | 'schedule'): Promise<RequestContext>;
};
