import type { CellValue, Money, Ref } from '../../contracts/primitives';
import type { FieldStorage, EntityDescriptor } from './descriptors.server';
import type { SqlScalar } from '../admission/ports';
import { sortKey } from './exact';
import { validateCell } from './validators';
export function encode(storage: FieldStorage, input: unknown): Record<string, SqlScalar> {
    const value = validateCell(storage.field, input);
    if (storage.join)
        throw new Error('Collection uses relational join storage');
    const out: Record<string, SqlScalar> = { [storage.column]: value === null ? null : storage.field.type === 'boolean' ? (value ? 1 : 0) : storage.field.type === 'relation' ? (value as Ref).recordId : storage.field.type === 'money' ? (value as Money).minor : value as string };
    if (storage.sortColumn)
        out[storage.sortColumn] = value === null ? null : sortKey(storage.field.type === 'money' ? (value as Money).minor : value as string);
    if (storage.currencyColumn)
        out[storage.currencyColumn] = value === null ? null : (value as Money).currency;
    if (storage.scaleColumn)
        out[storage.scaleColumn] = value === null ? null : (value as Money).scale;
    return out;
}
export function decode(storage: FieldStorage, row: Record<string, unknown>): CellValue {
    const raw = row[storage.column];
    if (raw === null || raw === undefined)
        return null;
    if (storage.field.type === 'boolean')
        return raw === 1;
    if (storage.field.type === 'money')
        return { minor: String(raw), currency: String(row[storage.currencyColumn!]), scale: Number(row[storage.scaleColumn!]) };
    if (storage.field.type === 'relation')
        return { appId: storage.field.relation!.ownerAppId, entityId: storage.field.relation!.entityId, recordId: String(raw) };
    return String(raw);
}
export function encodeValues(d: EntityDescriptor, values: Record<string, unknown>, creating: boolean): Record<string, SqlScalar> {
    for (const key of Object.keys(values))
        if (!d.fields.has(key))
            throw new Error('Unknown field ID');
    const row: Record<string, SqlScalar> = {};
    for (const [id, s] of d.fields) {
        if (s.field.type === 'computed') {
            if (id in values)
                throw new Error('Computed fields are read-only');
            continue;
        }
        if (creating || id in values) {
            const value = id in values ? values[id] : null;
            if (!s.join)
                Object.assign(row, encode(s, value));
            else
                validateCell(s.field, value);
        }
    }
    return row;
}
