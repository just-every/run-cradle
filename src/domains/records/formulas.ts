import type { Cell, CellValue, Money } from '../../contracts/primitives';
import type { EntitySchema, Expr, Filter } from './contracts';
import { add, compare, divide, multiply, normalize } from './exact';
const value = (v: CellValue): Cell => ({ state: 'value', value: v });
export const unavailable = (code: Extract<Cell, {
    state: 'unavailable';
}>['code'], fieldIds: string[], message: string): Cell => ({ state: 'unavailable', code, fieldIds, message });
export type FormulaContext = {
    field(id: string): Promise<Cell>;
    rollup(relationFieldId: string, valueFieldId: string, filter?: Filter): Promise<Cell[]>;
};
export function validateExpressionGraph(schemas: readonly EntitySchema[]): void {
    const fields = new Map(schemas.flatMap(s => s.fields.map(f => [s.id + ':' + f.id, { s, f }] as const)));
    function visit(key: string, path: Set<string>, depth: number): void {
        if (depth > 64)
            throw new Error('Formula dependency depth exceeds 64');
        if (path.has(key))
            throw new Error('Formula dependency cycle');
        const item = fields.get(key);
        if (!item)
            throw new Error('Unknown formula dependency');
        if (!item.f.expression)
            return;
        const next = new Set(path).add(key);
        function walk(expr: Expr, expressionDepth: number): void { if (expressionDepth > 64)
            throw new Error('Expression depth exceeds 64'); if (expr.kind === 'field')
            visit(item!.s.id + ':' + expr.fieldId, next, depth + 1); if (expr.kind === 'rollup') {
            const rel = item!.s.fields.find(f => f.id === expr.relationFieldId)?.relation;
            if (!rel)
                throw new Error('Rollup needs relation');
            visit(rel.entityId + ':' + expr.valueFieldId, next, depth + 1);
        } if (expr.kind === 'call')
            expr.args.forEach(e => walk(e, expressionDepth + 1)); }
        walk(item.f.expression, depth);
    }
    for (const key of fields.keys())
        visit(key, new Set(), 1);
}
function isMoney(v: CellValue): v is Money { return !!v && !Array.isArray(v) && typeof v === 'object' && 'minor' in v; }
function arithmetic(fn: string, args: CellValue[]): CellValue {
    if (args.length !== 2)
        throw new Error('Arithmetic expects two arguments');
    const [a, b] = args;
    if (isMoney(a) || isMoney(b)) {
        if (!isMoney(a) || !isMoney(b) || a.currency !== b.currency || a.scale !== b.scale)
            throw new Error('mixed_currency');
        if (fn !== 'add' && fn !== 'subtract')
            throw new Error('Money supports same-currency addition and subtraction');
        return { ...a, minor: fn === 'add' ? add(a.minor, b.minor) : add(a.minor, b.minor === '0' ? '0' : b.minor.startsWith('-') ? b.minor.slice(1) : '-' + b.minor) };
    }
    if (typeof a !== 'string' || typeof b !== 'string')
        throw new Error('Numeric arguments must be exact decimal strings');
    if (fn === 'add')
        return add(a, b);
    if (fn === 'subtract')
        return add(a, b === '0' ? '0' : b.startsWith('-') ? b.slice(1) : '-' + b);
    if (fn === 'multiply')
        return multiply(a, b);
    return divide(a, b);
}
export async function evaluateExpression(expr: Expr, ctx: FormulaContext, depth = 1): Promise<Cell> {
    if (depth > 64)
        return unavailable('dependency_limit', [], 'Expression exceeds depth 64');
    try {
        if (expr.kind === 'literal')
            return value(expr.value);
        if (expr.kind === 'field')
            return ctx.field(expr.fieldId);
        if (expr.kind === 'rollup') {
            const cells = await ctx.rollup(expr.relationFieldId, expr.valueFieldId, expr.filter);
            if (cells.length > 10000)
                return unavailable('rollup_limit', [expr.relationFieldId], 'Rollup exceeds 10,000 records');
            const bad = cells.find(c => c.state !== 'value');
            if (bad)
                return bad;
            const values = cells.flatMap(c => c.state === 'value' && c.value !== null ? [c.value] : []);
            if (expr.aggregate === 'lookup') { if (values.length > 1) throw new Error('Lookup requires a single linked record'); return value(values[0] ?? null); }
            if (expr.aggregate === 'count')
                return value(String(cells.length));
            if (!values.length)
                return value(null);
            let result: CellValue = values[0]!;
            for (const v of values.slice(1)) {
                if (expr.aggregate === 'sum' || expr.aggregate === 'average')
                    result = arithmetic('add', [result, v]);
                else {
                    if (isMoney(result) || isMoney(v)) {
                        if (!isMoney(result) || !isMoney(v) || result.currency !== v.currency || result.scale !== v.scale)
                            throw new Error('mixed_currency');
                        if ((compare(result.minor, v.minor) > 0) === (expr.aggregate === 'min'))
                            result = v;
                    }
                    else {
                        if (typeof result !== 'string' || typeof v !== 'string')
                            throw new Error('Invalid rollup values');
                        if ((compare(result, v) > 0) === (expr.aggregate === 'min'))
                            result = v;
                    }
                }
            }
            if (expr.aggregate === 'average') {
                if (isMoney(result)) {
                    const minor = divide(result.minor, String(values.length));
                    if (minor.includes('.'))
                        throw new Error('Money average is not an exact minor unit');
                    result = { ...result, minor };
                }
                else
                    result = divide(String(result), String(values.length));
            }
            return value(result);
        }
        if (expr.fn === 'if') {
            if (expr.args.length !== 3)
                throw new Error('if needs three arguments');
            const condition = await evaluateExpression(expr.args[0]!, ctx, depth + 1);
            if (condition.state !== 'value')
                return condition;
            if (typeof condition.value !== 'boolean')
                throw new Error('if condition must be boolean');
            return evaluateExpression(expr.args[condition.value ? 1 : 2]!, ctx, depth + 1);
        }
        const cells = await Promise.all(expr.args.map(e => evaluateExpression(e, ctx, depth + 1)));
        const bad = cells.find(c => c.state !== 'value');
        if (bad)
            return bad;
        const args = cells.map(c => (c as Extract<Cell, {
            state: 'value';
        }>).value);
        if (['add', 'subtract', 'multiply', 'divide'].includes(expr.fn))
            return value(arithmetic(expr.fn, args));
        if (expr.fn === 'concat') {
            if (args.some(v => typeof v !== 'string'))
                throw new Error('concat expects strings');
            return value(args.join(''));
        }
        if (expr.fn === 'coalesce')
            return value(args.find(v => v !== null) ?? null);
        if (expr.fn === 'eq')
            return value(JSON.stringify(args[0]) === JSON.stringify(args[1]));
        if (expr.fn === 'date_add') {
            if (typeof args[0] !== 'string' || typeof args[1] !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(args[0]) || !/^-?\d{1,6}$/.test(args[1]))
                throw new Error('date_add expects date and integral days');
            const date = new Date(args[0] + 'T00:00:00.000Z');
            date.setUTCDate(date.getUTCDate() + Number(args[1]));
            return value(date.toISOString().slice(0, 10));
        }
        if (expr.fn === 'days_between') {
            if (args.some(v => typeof v !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(v)))
                throw new Error('days_between expects dates');
            return value(normalize(String((Date.parse(String(args[1])) - Date.parse(String(args[0]))) / 86400000)));
        }
        throw new Error('Unknown deterministic function');
    }
    catch (error) {
        return unavailable(String(error).includes('mixed_currency') ? 'mixed_currency' : 'invalid_source', [], error instanceof Error ? error.message : 'Invalid formula source');
    }
}
