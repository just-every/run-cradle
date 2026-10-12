import type { CellValue, Money } from '../../contracts/primitives';
import type { Filter, RecordRow, Sort } from './contracts';
import { canonical } from '../admission/canonical';
import { compare } from './exact';
const money = (v: CellValue): v is Money => !!v && !Array.isArray(v) && typeof v === 'object' && 'minor' in v;
export function compareValues(a: CellValue, b: CellValue, numeric = false): number { if (a === null)
    return b === null ? 0 : -1; if (b === null)
    return 1; if (money(a) && money(b)) {
    if (a.currency !== b.currency || a.scale !== b.scale)
        throw new Error('Mixed currency comparison');
    return compare(a.minor, b.minor);
} if (typeof a === 'string' && typeof b === 'string') {
    if (numeric)
        return compare(a, b);
    return a < b ? -1 : a > b ? 1 : 0;
} const aa = canonical(a), bb = canonical(b); return aa < bb ? -1 : aa > bb ? 1 : 0; }
export function matchesFilter(row: RecordRow, filter: Filter | undefined, numeric: Set<string>, now: string, depth = 0): boolean {
    if (depth > 64)
        throw new Error('Filter depth exceeds 64');
    if (!filter)
        return true;
    if (filter.kind !== 'condition')
        return filter.kind === 'all' ? filter.conditions.every(f => matchesFilter(row, f, numeric, now, depth + 1)) : filter.conditions.some(f => matchesFilter(row, f, numeric, now, depth + 1));
    const cell = row.fields[filter.fieldId];
    if (!cell || cell.state !== 'value')
        throw new Error('Cannot filter a redacted or unavailable value');
    const a = cell.value, b = filter.value ?? null;
    if (filter.op === 'empty')
        return a === null || Array.isArray(a) && !a.length;
    if (filter.op === 'not_empty')
        return a !== null && (!Array.isArray(a) || a.length > 0);
    if (filter.op === 'in') {
        if (!Array.isArray(b))
            throw new Error('in expects array');
        return b.some(v => compareValues(a, v as CellValue, numeric.has(filter.fieldId)) === 0);
    }
    if (filter.op === 'contains')
        return typeof a === 'string' && typeof b === 'string' ? a.toLowerCase().includes(b.toLowerCase()) : Array.isArray(a) && a.some(v => compareValues(v as CellValue, b) === 0);
    if (filter.op === 'next_days') {
        if (typeof a !== 'string' || typeof b !== 'string' || !/^\d{1,4}$/.test(b))
            throw new Error('next_days requires date and integral days');
        const end = new Date(now);
        end.setUTCDate(end.getUTCDate() + Number(b));
        return a >= now.slice(0, 10) && a <= end.toISOString().slice(0, 10);
    }
    const c = compareValues(a, b, numeric.has(filter.fieldId));
    return filter.op === 'eq' ? c === 0 : filter.op === 'ne' ? c !== 0 : filter.op === 'before' ? c < 0 : c > 0;
}
export function sortRecords(rows: RecordRow[], sort: Sort[], numeric: Set<string>): void { rows.sort((a, b) => { for (const s of sort) {
    const x = a.fields[s.fieldId], y = b.fields[s.fieldId];
    if (x?.state !== 'value' || y?.state !== 'value')
        throw new Error('Cannot sort an unavailable field');
    const c = compareValues(x.value, y.value, numeric.has(s.fieldId));
    if (c)
        return s.direction === 'asc' ? c : -c;
} return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }); }
