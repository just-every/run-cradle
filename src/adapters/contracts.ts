import type { Instant, Json } from '../contracts/primitives';
export type ProviderId = 'resend' | 'gmail' | 'google-calendar' | 'outlook' | 'xero' | 'openai';
export type ProviderResult =
  | { state: 'confirmed'; externalId: string; value: Json; receiptHash: string; requestId: string | null }
  | { state: 'refused'; code: string; message: string; retryAfter?: string; retryable?: boolean }
  | { state: 'partial'; externalId: string | null; value: Json; message: string }
  | { state: 'unknown'; message: string; externalId?: string; requestId?: string };
export type EffectInput = { attemptId: string; commandId: string; connectionId: string; idempotencyKey: string; canonicalInputHash: string; input: Json; deadline: Instant; firstPossibleEffectAt: Instant; externalId: string | null };
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly version: string;
  canReplay?(input:EffectInput,now:number):boolean;
  preflight(input: EffectInput): Promise<void>;
  execute(input: EffectInput): Promise<ProviderResult>;
  reconcile(input: EffectInput): Promise<ProviderResult>;
}
export interface CredentialPort {
  resolve(connectionId: string, purpose: 'dispatch' | 'readback',operation?:{attemptId?:string;jobId?:string}): Promise<{ token: string; accountId: string; scopes: readonly string[] }>;
}
