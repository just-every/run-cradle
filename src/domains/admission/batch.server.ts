import type { SqlMutation, SqlScalar } from './ports';
import type { Statement } from './compiler.server';
import { identifier, validateMutation } from './sql.server';
import { canonical } from './canonical';
/** Replace actual placeholders, never question marks inside SQL string/identifier literals. */
export function bindExpression(sql: string, expression: (index: number) => string): string { let index = 0, quote = ''; let out = ''; for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (quote) {
        out += c;
        if (c === quote) {
            if (sql[i + 1] === quote)
                out += sql[++i];
            else
                quote = '';
        }
        continue;
    }
    if (c === "'" || c === '"') {
        quote = c;
        out += c;
    }
    else
        out += c === '?' ? expression(index++) : c;
} return out; }
export function mutationGroupKey(m: SqlMutation): string | null { validateMutation(m); if(m.kind==='replaceText')return null; const values = m.kind === 'insert' ? m.row : m.kind === 'update' ? m.set : {}; if (Object.values(values).some(v => v instanceof Uint8Array))
    return null; if (m.kind !== 'insert') {
    if (!m.table.writableColumnIds.includes('id') || /SELECT|EXISTS|\./i.test(m.where.sql) || m.where.values.some(v => v instanceof Uint8Array))
        return null;
    const names = m.where.sql.replace(/"[^"]+"/g, '').replace(/'[^']*'/g, '').replace(/AND|OR|IS|NOT|NULL|IN|LIKE|ESCAPE/gi, '').replace(/[?()=<>!\s\d.+-]/g, '');
    if (names)
        return null;
} return canonical({ kind: m.kind, table: m.table.tableId, columns: Object.keys(values), where: m.kind === 'insert' ? m.check?.sql ?? null : m.where.sql, check: m.kind === 'insert' ? m.check?.values ?? [] : [] }); }
export function compileMutationGroup(group: SqlMutation[], gate: string, gateValues: SqlScalar[], nonce: string, nextSequence: () => number): Statement[] {
    const first = group[0]!;
    group.forEach(validateMutation);
    const table = identifier(first.table.tableId), rows = group.map(m => m.kind === 'insert' ? m.row : { where: [...m.where.values], expected: m.expectedRows, ...(m.kind === 'update' ? { set: m.set } : {}) });
    const payload = canonical(rows);
    if (new TextEncoder().encode(payload).byteLength > 900000)
        throw new Error('Grouped mutation payload exceeds supported command size');
    const assert = (condition: string, values: SqlScalar[]): Statement => ({ sql: `WITH batch(payload) AS (SELECT ?) INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,?,CASE WHEN ${condition} THEN 1 ELSE 0 END WHERE ${gate}`, values: [payload, nonce, nextSequence(), ...values, ...gateValues] });
    if (first.kind === 'insert') {
        const cols = Object.keys(first.row), projection = cols.map(c => `json_extract(operation.value,'$.${c}') AS ${identifier(c)}`).join(',');
        const check = first.check;
        return [{ sql: `INSERT INTO ${table}(${cols.map(identifier).join(',')}) SELECT ${cols.map(identifier).join(',')} FROM (SELECT ${projection} FROM json_each(?) AS operation) AS ${table} WHERE ${check ? `(${check.sql}) AND ` : ''}${gate}`, values: [payload, ...(check?.values ?? []), ...gateValues] }, assert(`(SELECT COUNT(*) FROM batch,json_each(batch.payload) AS operation WHERE EXISTS(SELECT 1 FROM ${table} WHERE ${cols.map(c => `${table}.${identifier(c)} IS json_extract(operation.value,'$.${c}')`).join(' AND ')}))=?`, [group.length])];
    }
    const qualified = first.where.sql.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, (token, name) => first.table.writableColumnIds.includes(name) ? `${table}.${token}` : token);
    const columns=first.kind==='update'?Object.keys(first.set):[];
    const projection=[...first.where.values.map((_,i)=>`json_extract(value,'$.where[${i}]') AS w${i}`),...columns.map((c,i)=>`json_extract(value,'$.set.${c}') AS s${i}`),"json_extract(value,'$.expected') AS expected"].join(',');
    const prefix=`WITH operations AS MATERIALIZED(SELECT ${projection} FROM json_each(?))`;
    const where=bindExpression(qualified,i=>`operation.w${i}`),expected=group.reduce((n,m)=>n+(m.kind==='insert'?1:m.expectedRows),0);
    // Materialize each operation once and join through the target index. A correlated
    // full-table EXISTS per row made wide bulk updates quadratic in table size.
    // Exact counts plus unique target IDs reject overlap and count cancellation.
    const precondition=`NOT EXISTS(SELECT 1 FROM operations operation WHERE (SELECT COUNT(*) FROM ${table} WHERE ${where})<>operation.expected) AND (SELECT COUNT(DISTINCT ${table}."id") FROM operations operation JOIN ${table} ON ${where})=?`;
    const statements:Statement[]=[{sql:`${prefix} INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,?,CASE WHEN ${precondition} THEN 1 ELSE 0 END WHERE ${gate}`,values:[payload,nonce,nextSequence(),expected,...gateValues]}];
    if(first.kind==='delete')statements.push({sql:`${prefix} DELETE FROM ${table} WHERE "id" IN (SELECT ${table}."id" FROM operations operation JOIN ${table} ON ${where}) AND ${gate}`,values:[payload,...gateValues]});
    else statements.push({sql:`${prefix} UPDATE ${table} SET ${columns.map((c,i)=>`${identifier(c)}=operation.s${i}`).join(',')} FROM operations operation WHERE ${where} AND ${gate}`,values:[payload,...gateValues]});
    return statements;
}
