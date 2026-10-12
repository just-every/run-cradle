import type { RequestContext, PolicyPort } from '../authority/ports';
import type { DescriptorRegistry } from './descriptors.server';
import type { createRecordReader } from './query.server';
import type { RecordRow } from './contracts';
import { and, trustedPredicate, identifier } from '../admission/sql.server';
import { AdmissionError } from '../admission/errors';
/** Search considers only cells returned by the current scoped reader, including relation/formula projection. */
export function createRecordSearch(registry: DescriptorRegistry, policy: PolicyPort, reader: ReturnType<typeof createRecordReader>) {
    return async (ctx: RequestContext, appId: string, term: string, includeArchived = false): Promise<{
        entityId: string;
        items: RecordRow[];
    }[]> => {
        const tokens = term.trim().toLocaleLowerCase('en').split(/\s+/);
        if (!term.trim() || term.length > 200 || tokens.length > 10)
            throw new AdmissionError('validation', 'Search requires 1–200 characters and at most 10 tokens');
        const results = [];
        for (const d of registry.list(appId)) {
            let scope;
            try {
                scope = await policy.scope(ctx, { appId, entityId: d.schema.id, purpose: 'read' });
            }
            catch (error) {
                if (error instanceof Error && 'code' in error && ['forbidden', 'not_found'].includes(String(error.code)))
                    continue;
                throw error;
            }
            const fields = d.schema.fields.filter(f => scope.readableFieldIds.includes(f.id) && ['text', 'url', 'select'].includes(f.type)).map(f => f.id), items: RecordRow[] = [];
            if (d.searchTable) {
                const columns = fields.map(id => d.fields.get(id)!).filter(s => ['text', 'url'].includes(s.field.type)).map(s => s.column);
                if (!columns.length) {
                    results.push({ entityId: d.schema.id, items: [] });
                    continue;
                }
                const query = '{' + columns.join(' ') + '}: (' + tokens.map(t => '"' + t.replaceAll('"', '""') + '"*').join(' AND ') + ')';
                const matched = { ...scope, rowPredicate: and(scope.rowPredicate, trustedPredicate(`${identifier(d.idColumn)} IN (SELECT record_id FROM ${identifier(d.searchTable)} WHERE ${identifier(d.searchTable)} MATCH ?)`, [query])) };
                const page = await reader.query(ctx, matched, { fields, includeArchived, limit: 20 });
                results.push({ entityId: d.schema.id, items: page.items });
                continue;
            }
            let cursor: string | undefined;
            do {
                const page = await reader.query(ctx, scope, { fields, includeArchived, limit: 200, cursor });
                for (const row of page.items) {
                    const words = Object.values(row.fields).flatMap(c => c.state === 'value' && typeof c.value === 'string' ? c.value.toLocaleLowerCase('en').split(/[^\p{L}\p{N}]+/u) : []);
                    if (tokens.every(token => words.some(word => word.startsWith(token))))
                        items.push(row);
                    if (items.length === 20)
                        break;
                }
                cursor = items.length === 20 ? undefined : page.nextCursor ?? undefined;
            } while (cursor);
            results.push({ entityId: d.schema.id, items });
        }
        return results;
    };
}
