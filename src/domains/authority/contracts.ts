import type { AllowedAction, CellValue, Id, Instant, Money, PrincipalRef, Versioned } from '../../contracts/primitives'
export type AuthorityFilter = { kind: 'all' | 'any'; conditions: AuthorityFilter[] } | { kind: 'condition'; fieldId: Id; op: 'eq' | 'ne' | 'in' | 'contains' | 'empty' | 'not_empty' | 'before' | 'after' | 'next_days'; value?: CellValue }
export type Member = Versioned & { name: string; email: string | null; state: 'invited' | 'active' | 'removed' | 'erased'; allowedActions?:AllowedAction[]; scopes: { appId: Id; policyId: Id; legacy: boolean }[] }
export type AuthorityCapabilities = { appId: Id; allowedActions: AllowedAction[] }
export type GrantSpec = { delegate: PrincipalRef; appId: Id; actions: string[]; scope: { entityId: Id; recordIds?: Id[]; filter?: AuthorityFilter }[]; allowedTransitions: string[]; perAction: Money[]; perActionQuantity?: number; period: { startsAt: Instant; endsAt: Instant; ceiling: Money[]; modelCalls: number; wallSeconds: number; quantity?: number }; providerScopes: { connectionId: Id; fields: Id[]; purposes: string[] }[]; startsAt: Instant; expiresAt: Instant; decisionRules: { ruleId: Id; approverIds: Id[]; separateFromRequester: boolean }[] }
export type Grant = Versioned & GrantSpec & { issuer: PrincipalRef; state: 'proposed' | 'active' | 'revoked' | 'expired'; revokedAt: Instant | null; consumed: Money[]; reserved: Money[]; restoreHeld?: boolean; impactHash?:string; allowedActions?:AllowedAction[] }
export type Policy = Versioned & { appId: Id; name: string; rules: { id: Id; principals: PrincipalRef[]; entityId: Id; rows: AuthorityFilter; readableFields: Id[]; writableFields: Id[]; actions: string[]; effect: 'allow' | 'deny'; purposes?: ('read' | 'export' | 'provider_context')[] }[] }

export type PreparedGrant = Grant & { impactHash:string }
export const AUTHORITY_ENTITY_IDS = { member:'00000000000000000000000101', grant:'00000000000000000000000102', policy:'00000000000000000000000103' } as const
export type InvitePolicyChoice = { id:Id; appId:Id; name:string; summary:string; actions:string[] }
