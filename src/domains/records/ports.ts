import type { RequestContext, PolicyScope } from '../authority/ports';
import type { CellValue, Page, Ref } from '../../contracts/primitives';
import type { Query, RecordRow, RecordDetail } from './contracts';
import type { SqlPredicate, SqlMutation, AuditFact } from '../admission/ports';
export type PreparedRecordChange = {
    guards: SqlPredicate[];
    mutations: SqlMutation[];
    next: RecordRow;
    audit: AuditFact[];
};
export type RecordPort = {
    query(ctx: RequestContext, scope: PolicyScope, query: Query): Promise<Page<RecordRow>>;
    get(ctx: RequestContext, scope: PolicyScope, ref: Ref): Promise<RecordDetail>;
    prepareChange(ctx: RequestContext, scope: PolicyScope, request: {
        ref: Ref;
        expectedVersion: number;
        changes: Record<string, CellValue>;
    }): Promise<PreparedRecordChange>;
};
