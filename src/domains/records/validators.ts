import { AdmissionError } from '../admission/errors';
import { z } from 'zod';
import type { CellValue } from '../../contracts/primitives';
import type { EntitySchema, Field, Filter, Expr, Query, RuleCondition, ValidationRule } from './contracts';
import { normalize } from './exact';
import { formulaFunctions, type FormulaFunction } from './formula-functions';
import { attachmentMemberSchema } from './store-references';
import { assertRuleBounds, validateFieldConfiguration, validateTableRules } from './validation-schema';
export const idSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const instantSchema = z.string().refine(v => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v, 'Expected UTC ISO instant');
export const dateSchema = z.string().refine(v => /^\d{4}-\d\d-\d\d$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Expected calendar date');
export const refSchema = z.object({ appId: idSchema, entityId: idSchema, recordId: idSchema }).strict();
const decimalSchema = z.string().transform(v => normalize(v));
export const moneySchema = z.object({ minor: z.string().regex(/^-?(0|[1-9]\d*)$/).max(129), currency: z.string().regex(/^[A-Z]{3}$/), scale: z.number().int().min(0).max(6) }).strict().refine(v => Intl.supportedValuesOf('currency').includes(v.currency), 'Unknown ISO currency');
export const cellValueSchema: z.ZodType<CellValue> = z.union([z.null(), z.string().refine(v => [...v].length <= 100000, 'Cell character limit 100000 exceeded'), z.boolean(), moneySchema, refSchema, z.array(refSchema).max(10000), z.array(z.union([z.null(), z.string().refine(v => [...v].length <= 100000, 'Cell character limit 100000 exceeded'), z.boolean(), moneySchema])).max(10000), z.array(attachmentMemberSchema).max(10000)]);
export const filterSchema: z.ZodType<Filter> = z.lazy(() => z.union([z.object({ kind: z.enum(['all', 'any']), conditions: z.array(filterSchema).max(100) }).strict(), z.object({ kind: z.literal('condition'), fieldId: idSchema, op: z.enum(['eq', 'ne', 'in', 'contains', 'empty', 'not_empty', 'before', 'after', 'next_days']), value: cellValueSchema.optional() }).strict()]));
export const exprSchema: z.ZodType<Expr> = z.lazy(() => z.union([z.object({ kind: z.literal('field'), fieldId: idSchema }).strict(), z.object({ kind: z.literal('literal'), value: cellValueSchema, valueType: z.literal('number').optional() }).strict(), z.object({ kind: z.literal('call'), fn: z.enum(Object.keys(formulaFunctions) as [FormulaFunction, ...FormulaFunction[]]), args: z.array(exprSchema).max(100) }).strict(), z.object({ kind: z.literal('rollup'), relationFieldId: idSchema, valueFieldId: idSchema, aggregate: z.enum(['sum', 'count', 'counta', 'countall', 'min', 'max', 'average', 'lookup', 'arrayjoin', 'arrayunique', 'and', 'or']), filter: filterSchema.optional(), separator: z.string().max(200).optional(), sort: z.array(z.object({fieldId:idSchema,direction:z.enum(['asc','desc'])}).strict()).max(10).optional(), limit:z.number().int().min(1).max(10000).optional() }).strict()]));
const types = ['text', 'number', 'date', 'instant', 'money', 'boolean', 'select', 'multi_select', 'url', 'person', 'relation', 'attachment', 'computed'] as const;
export const fieldSchema: z.ZodType<Field> = z.object({ validation: z.object({ min:z.string().max(200).optional(), max:z.string().max(200).optional(), minLength:z.number().int().min(0).max(100000).optional(), maxLength:z.number().int().min(0).max(100000).optional(), pattern:z.string().max(200).optional() }).strict().optional(), defaultValue:cellValueSchema.optional(), readOnly: z.boolean().optional(), id: idSchema, label: z.string().trim().min(1).max(200), type: z.enum(types), required: z.boolean(), unique: z.boolean(), options: z.array(z.object({ id: idSchema, label: z.string().min(1).max(200) }).strict()).max(10000).optional(), relation: z.object({ ownerAppId: idSchema, entityId: idSchema, cardinality: z.enum(['one', 'many']), onDelete: z.enum(['restrict', 'unlink', 'cascade']) }).strict().optional(), linkPicker:z.object({searchFieldIds:z.array(idSchema).max(80),displayFieldIds:z.array(idSchema).max(80),viewId:idSchema.optional()}).strict().optional(), numberFormat: z.literal('percent').optional(), expression: exprSchema.optional(), resultType: z.enum([...types,'array']).optional(), resultElementType:z.enum(['text','url','number','date','instant','money','boolean','select','person','relation','attachment']).optional() }).strict().superRefine((field,ctx)=>{if(field.numberFormat&&field.type!=='number')ctx.addIssue({code:'custom',message:`${field.label}: a percentage format needs a number field`});try{validateFieldConfiguration(field,validateCell)}catch(error){ctx.addIssue({code:'custom',message:`${field.label}: ${(error as Error).message}`})}});
const conditionBody: z.ZodType<RuleCondition> = z.lazy(()=>z.union([z.object({kind:z.enum(['all','any']),conditions:z.array(conditionBody).min(1).max(20)}).strict(),z.object({kind:z.literal('condition'),fieldId:idSchema,op:z.enum(['eq','ne','gt','gte','lt','lte','empty','not_empty']),value:cellValueSchema.optional()}).strict()]));
export const ruleConditionSchema: z.ZodType<RuleCondition> = z.preprocess((value,ctx)=>{try{assertRuleBounds(value)}catch(error){ctx.addIssue({code:'custom',message:(error as Error).message});return z.NEVER}return value},conditionBody);
export const validationRuleSchema: z.ZodType<ValidationRule> = z.object({id:idSchema,name:z.string().trim().min(1).max(120),message:z.string().trim().min(1).max(1000),when:ruleConditionSchema,require:ruleConditionSchema}).strict();
export function refineTableRules(table:{fields:Field[];validationRules?:ValidationRule[]},ctx:z.RefinementCtx){try{validateTableRules(table,validateCell)}catch(error){ctx.addIssue({code:'custom',message:(error as Error).message})}}
export const incomingRelationSchema = z.object({ id: idSchema, label: z.string().min(1).max(200), sourceEntityId: idSchema, sourceFieldId: idSchema }).strict();
export const entitySchema: z.ZodType<EntitySchema> = z.object({ validationRules:z.array(validationRuleSchema).max(50).optional(), incomingRelations: z.array(incomingRelationSchema).max(80).optional(), primaryFieldId: idSchema.optional(), id: idSchema, version: z.number().int().positive(), createdAt: instantSchema, updatedAt: instantSchema, appId: idSchema, label: z.string().trim().min(1).max(200), fields: z.array(fieldSchema).min(1).max(500), lifecycle: z.object({ states: z.array(z.string().min(1).max(80)).min(1).max(30), initial: z.string(), transitions: z.array(z.object({ action: z.string().min(1).max(100), from: z.array(z.string()), to: z.string() }).strict()).max(100) }).strict(), physicalRevision: z.string().min(1).max(200) }).strict().superRefine(refineTableRules);
export const querySchema: z.ZodType<Query> = z.object({ cursor: z.string().max(20000).optional(), limit: z.number().int().min(1).max(200).optional(), consistencyToken: idSchema.optional(), filter: filterSchema.optional(), sort: z.array(z.object({ fieldId: idSchema, direction: z.enum(['asc', 'desc']) }).strict()).max(10).optional(), groupBy: z.array(idSchema).max(5).optional(), fields: z.array(idSchema).max(500).optional(), includeArchived: z.boolean().optional() }).strict();
function validateCellValue(field: Field, value: unknown): CellValue {
    if (value === null) {
        if (field.required)
            throw new Error(`${field.label} is required`);
        return null;
    }
    switch (field.type) {
        case 'computed': throw new Error('Computed fields cannot be written');
        case 'number': return decimalSchema.parse(value);
        case 'money': return moneySchema.parse(value);
        case 'date': return dateSchema.parse(value);
        case 'instant': return instantSchema.parse(value);
        case 'boolean': return z.boolean().parse(value);
        case 'url': return z.url({ protocol: /^https?$/ }).parse(value);
        case 'person': return idSchema.parse(value);
        case 'relation': {
            const v = (field.relation?.cardinality === 'many' ? z.array(refSchema).min(field.required ? 1 : 0).max(10000) : refSchema).parse(value);
            for (const ref of Array.isArray(v) ? v : [v])
                if (ref.appId !== field.relation?.ownerAppId || ref.entityId !== field.relation.entityId)
                    throw new Error('Relation owner mismatch');
            return v;
        }
        case 'attachment': return z.array(attachmentMemberSchema).min(field.required ? 1 : 0).max(1000).parse(value);
        case 'select': {
            const v = idSchema.parse(value);
            if (!field.options?.some(o => o.id === v))
                throw new Error('Unknown option');
            return v;
        }
        case 'multi_select': {
            const v = z.array(idSchema).min(field.required ? 1 : 0).max(1000).parse(value);
            if (new Set(v).size !== v.length || v.some(id => !field.options?.some(o => o.id === id)))
                throw new Error('Invalid selection');
            return v;
        }
        default: return z.string().refine(v => [...v].length <= 100000, 'Cell character limit 100000 exceeded').refine(v => !field.required || v.trim().length > 0).parse(value);
    }
}
export function validateCell(field: Field, value: unknown): CellValue { try {
    return validateCellValue(field, value);
}
catch (error) {
    throw new AdmissionError('validation', `${field.label}: ${error instanceof Error ? error.message : 'Invalid value'}`);
} }
