import type { SqlPredicate, SqlScalar, TableHandle, SqlMutation } from './ports';
const tables = new WeakSet<TableHandle>();
const predicates = new WeakSet<SqlPredicate>();
export function identifier(name: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        throw new Error('Invalid registered SQL identifier');
    return `"${name}"`;
}
/** Only server-owned descriptors may register tables. Never pass request/model values here. */
export function registerTable(tableId: string, writableColumnIds: readonly string[]): TableHandle {
    identifier(tableId);
    writableColumnIds.forEach(identifier);
    const table = Object.freeze({ tableId, writableColumnIds: Object.freeze([...writableColumnIds]) });
    tables.add(table);
    return table;
}
export function assertTable(table: TableHandle): void { if (!tables.has(table))
    throw new Error('Unregistered SQL table'); }
export function column(table: TableHandle, name: string): string { assertTable(table); if (!table.writableColumnIds.includes(name))
    throw new Error('Unregistered SQL column'); return identifier(name); }
/** SQL text must be a source literal; interpolation uses only registered identifiers, all data is bound. */
export function trustedPredicate(sql: string, values: readonly SqlScalar[] = []): SqlPredicate {
    if (sql.includes(';') || sql.includes('--') || sql.includes('/*'))
        throw new Error('Predicate must be one expression');
    const p = Object.freeze({ sql, values: Object.freeze([...values]) }) as SqlPredicate;
    predicates.add(p);
    return p;
}
export function assertPredicate(p: SqlPredicate): void { if (!predicates.has(p))
    throw new Error('Untrusted SQL predicate'); }
/** Balance the SQL tree so each additional guard adds logarithmic depth. */
function conjunction(items: readonly SqlPredicate[]): string {
    if (items.length < 2) return items.length ? `(${items[0]!.sql})` : '1';
    const middle = Math.floor(items.length / 2);
    return `(${conjunction(items.slice(0, middle))} AND ${conjunction(items.slice(middle))})`;
}
export function and(...items: readonly SqlPredicate[]): SqlPredicate { items.forEach(assertPredicate); return trustedPredicate(conjunction(items), items.flatMap(p => [...p.values])); }
export function or(...items: readonly SqlPredicate[]): SqlPredicate { items.forEach(assertPredicate); return trustedPredicate(items.length ? items.map(p => `(${p.sql})`).join(' OR ') : '0', items.flatMap(p => [...p.values])); }
export function eq(table: TableHandle, name: string, value: SqlScalar): SqlPredicate { return trustedPredicate(`${column(table, name)} IS ?`, [value]); }
export function exists(table: TableHandle, where: SqlPredicate): SqlPredicate { assertPredicate(where); assertTable(table); return trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(table.tableId)} WHERE ${where.sql})`, where.values); }
export function validateMutation(m: SqlMutation): void { assertTable(m.table); if(m.kind==='replaceText'){column(m.table,m.column);if(!m.needles.length||m.needles.some(v=>!v||m.replacement.includes(v))||!m.replacement)throw new Error('Invalid literal replacement');} if (m.kind === 'insert' && m.check)
    assertPredicate(m.check); if (m.kind !== 'insert') {
    assertPredicate(m.where);
    if (!Number.isSafeInteger(m.expectedRows) || m.expectedRows < 0)
        throw new Error('Invalid expected row count');
} for (const [key, value] of Object.entries(m.kind === 'insert' ? m.row : m.kind === 'update' ? m.set : {})) {
    column(m.table, key);
    if (typeof value === 'number' && !Number.isSafeInteger(value))
        throw new Error('Numeric SQL scalars must be safe integers; encode decimals exactly');
} }

/** Bound literal replacement; JSON strings use their escaped representation. */
export function textReplacement(name:string,needles:readonly string[],replacement:string):SqlPredicate {
 const value=identifier(name),bindings:SqlScalar[]=[];
 const expression=(json:boolean)=>needles.reduce((sql,needle)=>{bindings.push(json?JSON.stringify(needle).slice(1,-1):needle,json?JSON.stringify(replacement).slice(1,-1):replacement);return `replace(${sql},?,?)`},value);
 const json=expression(true),plain=expression(false);
 return trustedPredicate(`CASE WHEN json_valid(${value}) THEN ${json} ELSE ${plain} END`,bindings);
}
