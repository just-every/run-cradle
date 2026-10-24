import type { Filter } from './contracts';
import type { EntityDescriptor } from './descriptors.server';
import type { PolicyScope } from '../authority/ports';
import type { SqlPredicate, SqlScalar } from '../admission/ports';
import { and, or, trustedPredicate, identifier } from '../admission/sql.server';
import { validateCell } from './validators';
import { sortKey } from './exact';
import type { Money, Ref } from '../../contracts/primitives';
export function filterFields(filter?: Filter, depth = 0): string[] { if (depth > 64)
    throw new Error('Filter depth exceeds 64'); if (!filter)
    return []; return filter.kind === 'condition' ? [filter.fieldId] : filter.conditions.flatMap(f => filterFields(f, depth + 1)); }
export function compileFilter(d: EntityDescriptor, scope: PolicyScope, filter?: Filter, now = new Date().toISOString(), depth = 0): SqlPredicate {
    if (depth > 64)
        throw new Error('Filter depth exceeds 64');
    if (!filter)
        return trustedPredicate('1');
    if (filter.kind !== 'condition')
        return (filter.kind === 'all' ? and : or)(...filter.conditions.map(f => compileFilter(d, scope, f, now, depth + 1)));
    const storage = d.fields.get(filter.fieldId);
    if (!storage || !scope.readableFieldIds.includes(filter.fieldId))
        throw new Error('Filter field is unavailable');
    if (storage.join || storage.field.type === 'computed')
        throw new Error('Collection/computed filter requires evaluated authorized query');
    const col = identifier(storage.sortColumn ?? storage.column);
    if (filter.op === 'empty' || filter.op === 'not_empty')
        return trustedPredicate(`${identifier(storage.column)} IS ${filter.op === 'not_empty' ? 'NOT ' : ''}NULL`);
    function bound(input: unknown): {
        v: SqlScalar;
        guard: SqlPredicate;
    } { const v = validateCell({ ...storage!.field, required: false }, input); const amount = storage!.field.type === 'money' ? (v as Money)?.minor : v; const scalar = storage!.sortColumn && v !== null ? sortKey(String(amount)) : storage!.field.type === 'relation' ? (v as Ref)?.recordId : typeof v === 'boolean' ? (v ? 1 : 0) : v as SqlScalar; const guard = storage!.currencyColumn && v !== null ? and(trustedPredicate(`${identifier(storage!.currencyColumn)}=?`, [(v as Money).currency]), trustedPredicate(`${identifier(storage!.scaleColumn!)}=?`, [(v as Money).scale])) : trustedPredicate('1'); return { v: scalar, guard }; }
    if (filter.op === 'in') {
        if (!Array.isArray(filter.value) || filter.value.length > 200)
            throw new Error('in needs bounded values');
        return or(...filter.value.map(v => { const b = bound(v); return and(b.guard, trustedPredicate(`${col} IS ?`, [b.v])); }));
    }
    if (filter.op === 'contains') {
        if (typeof filter.value !== 'string' || !['email','phone', 'text', 'url'].includes(storage.field.type))
            throw new Error('contains needs text');
        return trustedPredicate(`${col} LIKE ? ESCAPE '\\'`, ['%' + filter.value.replace(/[\\%_]/g, '\\$&') + '%']);
    }
    if (filter.op === 'next_days') {
        if (storage.field.type !== 'date' || typeof filter.value !== 'string' || !/^\d{1,4}$/.test(filter.value))
            throw new Error('next_days requires date and bounded days');
        const start = now.slice(0, 10), end = new Date(start + 'T00:00:00.000Z');
        end.setUTCDate(end.getUTCDate() + Number(filter.value));
        return trustedPredicate(`${col}>=? AND ${col}<=?`, [start, end.toISOString().slice(0, 10)]);
    }
    const b = bound(filter.value);
    return and(b.guard, trustedPredicate(`${col} ${filter.op === 'eq' ? 'IS' : filter.op === 'ne' ? 'IS NOT' : filter.op === 'before' ? '<' : '>'} ?`, [b.v]));
}
