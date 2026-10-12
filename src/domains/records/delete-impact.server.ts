import type { Ref } from '../../contracts/primitives';
import type { RequestContext, PolicyPort } from '../authority/ports';
import type { DescriptorRegistry } from './descriptors.server';
import type { createRecordReader } from './query.server';
import { identifier, trustedPredicate } from '../admission/sql.server';
import { AdmissionError } from '../admission/errors';
export type DeleteImpact = {
    ref: Ref;
    guards: import('../admission/ports').SqlPredicate[];
    references: {
        ref: Ref;
        version: number;
        fieldId: string;
        effect: 'restrict' | 'unlink' | 'cascade';
    }[];
};
export function createDeleteImpact(db: D1Database, registry: DescriptorRegistry, policy: PolicyPort, reader: ReturnType<typeof createRecordReader>) {
    return async (ctx: RequestContext, ref: Ref): Promise<DeleteImpact> => {
        const own = await policy.scope(ctx, { appId: ref.appId, entityId: ref.entityId, purpose: 'read' });
        await reader.record(ctx, own, ref);
        const references: DeleteImpact['references'] = [], guards: DeleteImpact['guards'] = [];
        for (const d of registry.list())
            for (const [fieldId, s] of d.fields) {
                if (s.field.relation?.ownerAppId !== ref.appId || s.field.relation.entityId !== ref.entityId)
                    continue;
                const ids = s.join ? await db.prepare(`SELECT record_id AS id FROM ${identifier(s.join.table.tableId)} WHERE value=?`).bind(ref.recordId).all<{
                    id: string;
                }>() : await db.prepare(`SELECT ${identifier(d.idColumn)} AS id FROM ${identifier(d.table.tableId)} WHERE ${identifier(s.column)}=?`).bind(ref.recordId).all<{
                    id: string;
                }>();
                guards.push(trustedPredicate(s.join ? `(SELECT COUNT(*) FROM ${identifier(s.join.table.tableId)} WHERE value=?)=?` : `(SELECT COUNT(*) FROM ${identifier(d.table.tableId)} WHERE ${identifier(s.column)}=?)=?`, [ref.recordId, ids.results.length]));
                if (!ids.results.length)
                    continue;
                const scope = await policy.scope(ctx, { appId: d.schema.appId, entityId: d.schema.id, purpose: 'read' });
                if (!scope.readableFieldIds.includes(fieldId))
                    throw new AdmissionError('forbidden', 'Deletion has protected dependencies');
                for (const row of ids.results) {
                    const related = { appId: d.schema.appId, entityId: d.schema.id, recordId: row.id }, raw = await reader.raw(ctx, scope, related);
                    if (!raw)
                        throw new AdmissionError('forbidden', 'Deletion has protected dependencies');
                    references.push({ ref: related, version: Number(raw[d.versionColumn]), fieldId, effect: s.field.relation.onDelete });
                }
            }
        return { ref, references, guards };
    };
}
