import type { Id, Instant, Json, Ref, RevisionRef, Cell, CommandResult, CommandStatus } from '../../contracts/primitives';
import type { RequestContext, AuthorityPermit } from '../authority/ports';
export type SqlScalar = string | number | null | Uint8Array;
declare const trustedSql: unique symbol;
export type SqlPredicate = {
    readonly [trustedSql]: 'predicate';
    readonly sql: string;
    readonly values: readonly SqlScalar[];
};
export type TableHandle = {
    readonly tableId: string;
    readonly writableColumnIds: readonly string[];
};
export type SqlMutation = {
    kind: 'insert';
    table: TableHandle;
    row: Readonly<Record<string, SqlScalar>>;
    check?: SqlPredicate;
} | {
    kind: 'update';
    table: TableHandle;
    set: Readonly<Record<string, SqlScalar>>;
    where: SqlPredicate;
    expectedRows: number;
} | {
    kind: 'replaceText';
    table: TableHandle;
    column: string;
    needles: readonly string[];
    replacement: string;
    where: SqlPredicate;
    expectedRows: number;
} | {
    kind: 'delete';
    table: TableHandle;
    where: SqlPredicate;
    expectedRows: number;
};
export type AuditFact = {
    action: string;
    subject: Ref | null;
    changes: {
        fieldId: Id;
        before: Cell;
        after: Cell;
    }[];
    sourceIds: Id[];
    personalContentRefs: Id[];
};
export type DomainEvent = {
    name: string;
    version: number;
    subject: Ref | null;
    payload: Json;
    causeRunIds: Id[];
};
export type OutboxCommand = {
    action: string;
    version: number;
    input: Json;
    notBefore: Instant;
    grantId: Id | null;
    subject: RevisionRef | null;
    sourceReleaseId: Id;
    causeRunIds: Id[];
};
export type AdmissionPlan<T> = {
    commandId: Id;
    action: string;
    appId: Id;
    canonicalInputHash: string;
    permit: AuthorityPermit;
    guards: readonly SqlPredicate[];
    mutations: readonly SqlMutation[];
    audit: readonly AuditFact[];
    events: readonly DomainEvent[];
    outbox: readonly OutboxCommand[];
    committedResult: T;
    changed?: readonly RevisionRef[];
    /** Explicit read dependencies when projected result values do not carry field IDs. */
    accessSubjects?: readonly {ref:Ref;fieldIds:readonly string[]}[];
};
export type AdmissionReceipt<T> = {
    replay: boolean;
    result: CommandResult<T>;
    consistencyToken: string;
};
export type AdmissionPort = {
    replay<T>(ctx: RequestContext, commandId: Id, action: string, appId: Id, canonicalInputHash: string): Promise<AdmissionReceipt<T> | null>;
    commit<T>(ctx: RequestContext, plan: AdmissionPlan<T>): Promise<AdmissionReceipt<T>>;
    status(ctx: RequestContext, commandId: Id): Promise<CommandStatus>;
};
