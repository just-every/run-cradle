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
