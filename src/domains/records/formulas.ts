import { evaluateRollup } from './formula-rollup';
import { arithmetic, truthy } from './formula-values';
import type { Cell, CellValue } from '../../contracts/primitives';
import type { EntitySchema, Expr, Field, Filter, Sort } from './contracts';
import { validateFunction } from './formula-functions';
import { validateCalculationTypes } from './calculation-schema';
import { compare, normalize } from './exact';
const value = (v: CellValue): Cell => ({ state: 'value', value: v });
export const unavailable = (code: Extract<Cell, {
    state: 'unavailable';
}>['code'], fieldIds: string[], message: string): Cell => ({ state: 'unavailable', code, fieldIds, message });
export type FormulaContext = {
    field(id: string): Promise<Cell>;
    rollup(relationFieldId: string, valueFieldId: string, filter?: Filter, countOnly?: boolean, selection?: {sort?: Sort[]; limit?: number}): Promise<Cell[]>;
    relationMany?(relationFieldId: string): boolean;
    sourceOptions?(relationFieldId:string,valueFieldId:string):Field['options'];
    sourceType?(relationFieldId:string,valueFieldId:string): string | undefined;
};
export function validateExpressionGraph(schemas: readonly Pick<EntitySchema,'id'|'fields'>[]): void {
    const fields = new Map(schemas.flatMap(s => s.fields.map(f => [s.id + ':' + f.id, { s, f }] as const)));
    const checkedDepth=new Map<string,number>();
    function visit(key: string, path: Set<string>, depth: number): void {
        if (depth > 64)
            throw new Error('Formula dependency depth exceeds 64');
        if (path.has(key))
            throw new Error('Formula dependency cycle');
        if((checkedDepth.get(key)??0)>=depth)return;
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
            if(expr.aggregate!=='countall')visit(rel.entityId + ':' + expr.valueFieldId, next, depth + 1);
            for(const sort of expr.sort??[])visit(rel.entityId + ':' + sort.fieldId,next,depth+1);
        } if (expr.kind === 'call')
            expr.args.forEach(e => walk(e, expressionDepth + 1)); }
        walk(item.f.expression, depth);
        checkedDepth.set(key,depth);
    }
    for (const key of fields.keys())
        visit(key, new Set(), 1);
    validateCalculationTypes(schemas);
}
export async function evaluateExpression(expr: Expr, ctx: FormulaContext, depth = 1): Promise<Cell> {
    if (depth > 64)
        return unavailable('dependency_limit', [], 'Expression exceeds depth 64');
    try {
        if (expr.kind === 'literal')
            return value(expr.value);
        if (expr.kind === 'field')
            return ctx.field(expr.fieldId);
        if (expr.kind === 'rollup') return await evaluateRollup(expr,ctx);
        validateFunction(expr.fn, expr.args.length);
        if (expr.fn === 'if') {
            if (expr.args.length !== 3)
                throw new Error('if needs three arguments');
            const condition = await evaluateExpression(expr.args[0]!, ctx, depth + 1);
            if (condition.state !== 'value')
                return condition;
            return evaluateExpression(expr.args[truthy(condition.value) ? 1 : 2]!, ctx, depth + 1);
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
            if (args.some(v => v !== null && !['string','boolean'].includes(typeof v)))
                throw new Error('CONCATENATE expects scalar values');
            return value(args.map(v=>v===null?'':typeof v==='boolean'?(v?'1':'0'):v).join(''));
        }
        if (expr.fn === 'coalesce')
            return value(args.find(v => v !== null) ?? null);
        if (expr.fn === 'eq' || expr.fn === 'ne')
            return value((JSON.stringify(args[0]) === JSON.stringify(args[1])) === (expr.fn === 'eq'));
        if (['lt','lte','gt','gte'].includes(expr.fn)) {
            if (typeof args[0] !== 'string' || typeof args[1] !== 'string') throw new Error('Comparison expects scalar strings');
            const decimal = /^-?(0|[1-9]\d*)(\.\d+)?$/;
            const compared = decimal.test(args[0]) && decimal.test(args[1]) ? compare(args[0],args[1]) : args[0] < args[1] ? -1 : args[0] === args[1] ? 0 : 1;
            return value(expr.fn === 'lt' ? compared < 0 : expr.fn === 'lte' ? compared <= 0 : expr.fn === 'gt' ? compared > 0 : compared >= 0);
        }
        if (expr.fn === 'not') return value(!truthy(args[0]!));
        if (expr.fn === 'and' || expr.fn === 'or') return value(expr.fn === 'and' ? args.every(truthy) : args.some(truthy));
        if (['upper','lower','trim','len'].includes(expr.fn)) {
            if (typeof args[0] !== 'string') throw new Error('Text function expects text');
            return value(expr.fn === 'upper' ? args[0].toUpperCase() : expr.fn === 'lower' ? args[0].toLowerCase() : expr.fn === 'trim' ? args[0].trim() : String(args[0].length));
        }
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
