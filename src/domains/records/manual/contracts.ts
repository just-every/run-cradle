import {recordLimits,capacityMessage} from '../capacity'
import { z } from 'zod'
import { idSchema, fieldSchema, incomingRelationSchema, validationRuleSchema, refineTableRules } from '../validators'
import type { Cell } from '../../../contracts/primitives'
import type { EntitySchema } from '../contracts'
import type {ConversionImpact} from './conversions.server'
export const draftSchema = z.object({ appId: idSchema, name: z.string().trim().min(1).max(120), formulaSources: z.record(idSchema,z.string().max(10000)).optional(), tables: z.array(z.object({ validationRules:z.array(validationRuleSchema).max(50).optional(), incomingRelations: z.array(incomingRelationSchema).max(80).optional(), primaryFieldId: idSchema.optional(), id: idSchema, label: z.string().trim().min(1).max(120), fields: z.array(fieldSchema).min(1).superRefine((fields,ctx)=>{if(fields.length>recordLimits.fieldsPerTable)ctx.addIssue({code:'custom',message:capacityMessage('fieldsPerTable',fields.length)})}) }).strict().superRefine(refineTableRules)).min(1).superRefine((tables,ctx)=>{if(tables.length>recordLimits.tablesPerBase)ctx.addIssue({code:'custom',message:capacityMessage('tablesPerBase',tables.length)})}) }).strict()
export type SchemaDraft = z.infer<typeof draftSchema>
export type RuleViolationImpact = { ruleId:string; ruleName:string; message:string; recordIds:string[]; count:number }
export type SchemaImpact = { entityId: string; label: string; changes: string[]; recordIds: string[]; count: number; removedFields: { id: string; label: string; populated: number }[]; deletedTable?:boolean; conversions?:ConversionImpact[]; dependencies?:{kind:string;id:string;name:string;details:string[]}[]; refusals?:string[]; validationViolations?:RuleViolationImpact[]; violatingRecordIds?:string[]; violatingRecordCount?:number }
export type CalculationChange = { recordId: string; recordLabel: string; before: Cell | null; after: Cell }
export type CalculationPreview = { entityId: string; fieldId: string; label: string; resultType: string; totalRecords: number; samples: CalculationChange[]; changes?: CalculationChange[]; incompleteReason?: string }
export type ManualPreview = { requiresOwnerReview?:boolean; authorId?:string; id: string; appId: string; name: string; schemas: EntitySchema[]; calculations?: CalculationPreview[]; impacts: SchemaImpact[]; expiresAt: string; recovery: string; access: string; kind: 'manual_schema'; parentReleaseId: string | null }
