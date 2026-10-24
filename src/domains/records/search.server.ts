import type { RequestContext, PolicyPort } from '../authority/ports';
import type { SqlPredicate } from '../admission/ports';
import type { DescriptorRegistry } from './descriptors.server';
import type { createRecordReader } from './query.server';
import type { Field, RecordRow } from './contracts';
import { and, trustedPredicate, identifier } from '../admission/sql.server';
import { AdmissionError } from '../admission/errors';

const words = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu) ?? [];
function searchValues(field: Field, value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(item => searchValues(field, item));
    if (typeof value !== 'string') return [];
    if (['select', 'multi_select'].includes(field.type === 'computed' ? field.resultType ?? '' : field.type)) {
        const option = field.options?.find(option => option.id === value);
        if (!option) throw new AdmissionError('schema_conflict', 'A searchable select value has no current option label');
        return [option.label];
    }
    return [value];
}

/** Only currently readable cells participate. Combined indexes require all their source fields. */
export function createRecordSearch(registry: DescriptorRegistry, policy: PolicyPort, reader: ReturnType<typeof createRecordReader>) {
    return async (ctx: RequestContext, appId: string, term: string, includeArchived = false) => {
        const tokens = words(term);
        if (!term.trim() || term.length > 200 || tokens.length > 10)
            throw new AdmissionError('validation', 'Search requires 1–200 characters and at most 10 tokens');
        const results: { entityId: string; items: RecordRow[] }[] = [], guards: SqlPredicate[] = [];
        if (!tokens.length) return { results, guards };
        for (const d of registry.list(appId)) {
            // Source custody is a private intake capability, not a table in the base browser.
            if (d.schema.label === 'Private source intake') continue;
            let scope;
            try {
                scope = await policy.scope(ctx, { appId, entityId: d.schema.id, purpose: 'read' });
            } catch (error) {
                if (error instanceof Error && 'code' in error && ['forbidden', 'not_found', 'grant_expired', 'grant_revoked'].includes(String(error.code))) continue;
                throw error;
            }
            guards.push(...scope.currentAuthorityGuards);
            if (!includeArchived && d.search?.activeRows) scope = { ...scope, rowPredicate: and(scope.rowPredicate, d.search.activeRows) };
            const searchable = d.schema.fields.filter(field => scope.readableFieldIds.includes(field.id) &&
                (d.search ? d.search.fieldIds.includes(field.id) : ['email','phone', 'text', 'url', 'select', 'multi_select'].includes(field.type === 'computed' ? field.resultType ?? '' : field.type)));
            if (!searchable.length) continue;
            const searchableIds = searchable.map(field => field.id);
            const titleId = d.schema.primaryFieldId ?? [...d.fields.values()].find(storage => ['name', 'title'].includes(storage.column))?.field.id ?? d.schema.fields.find(field => field.type === 'text')?.id;
            const fields = [...new Set([...searchableIds, ...(titleId && scope.readableFieldIds.includes(titleId) ? [titleId] : [])])], items: RecordRow[] = [];
            const sourceIndex = d.search?.index;
            const columns = sourceIndex ? [...sourceIndex.columns] : searchableIds.map(id => d.fields.get(id)!).filter(storage => ['email','phone', 'text', 'url'].includes(storage.field.type) && !storage.join).map(storage => storage.column);
            const indexTable = sourceIndex?.table ?? d.searchTable;
            const indexCoversFields = sourceIndex ? d.search!.fieldIds.every(id => fields.includes(id)) : columns.length === searchableIds.length;
            if (indexTable && indexCoversFields) {
                const match = '{' + columns.map(identifier).join(' ') + '}: (' + tokens.map(token => '"' + token + '"*').join(' AND ') + ')';
                const indexed = and(trustedPredicate(`${identifier(indexTable)} MATCH ?`, [match]), sourceIndex?.where ?? trustedPredicate('1'));
                const matched = { ...scope, rowPredicate: and(scope.rowPredicate, trustedPredicate(`${identifier(d.idColumn)} IN (SELECT record_id FROM ${identifier(indexTable)} WHERE ${indexed.sql})`, indexed.values)) };
                const page = await reader.query(ctx, matched, { fields, includeArchived, limit: 20 });
                results.push({ entityId: d.schema.id, items: page.items });
                continue;
            }
            let cursor: string | undefined;
            do {
                const page = await reader.query(ctx, scope, { fields, includeArchived, limit: 200, cursor });
                for (const row of page.items) {
                    const haystack = searchable.flatMap(field => {
                        const cell = row.fields[field.id];
                        return cell?.state === 'value' ? searchValues(field, cell.value).flatMap(words) : [];
                    });
                    if (tokens.every(token => haystack.some(word => word.startsWith(token)))) items.push(row);
                    if (items.length === 20) break;
                }
                cursor = items.length === 20 ? undefined : page.nextCursor ?? undefined;
            } while (cursor);
            results.push({ entityId: d.schema.id, items });
        }
        // The HTTP composite fences all these scopes together before sending results.
        return { results, guards };
    };
}
