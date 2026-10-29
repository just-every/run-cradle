import type { RevisionRef } from '../../contracts/primitives';
import type { RequestContext } from '../authority/ports';
import type { SqlPredicate, SqlMutation } from '../admission/ports';
export type RecordMutationEffects = (ctx: RequestContext, change: {
    before: RevisionRef;
    after: RevisionRef | null;
}) => Promise<{
    guards: SqlPredicate[];
    mutations: SqlMutation[];
}>;

/** Notification facts share the record's atomic admission. */
export type RecordNoticeEffects = (ctx: RequestContext, change: {
    before: import('./contracts').RecordRow | null;
    after: import('./contracts').RecordRow | null;
    row: Record<string, import('../admission/ports').SqlScalar>;
}) => Promise<{ guards: SqlPredicate[]; mutations: SqlMutation[] }>;
