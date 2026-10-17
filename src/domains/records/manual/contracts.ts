import { z } from 'zod'
import { idSchema, fieldSchema, incomingRelationSchema } from '../validators'
import type { Cell } from '../../../contracts/primitives'
import type { EntitySchema } from '../contracts'
export const draftSchema = z.object({ appId: idSchema, name: z.string().trim().min(1).max(120), formulaSources: z.record(idSchema,z.string().max(10000)).optional(), tables: z.array(z.object({ incomingRelations: z.array(incomingRelationSchema).max(80).optional(), primaryFieldId: idSchema.optional(), id: idSchema, label: z.string().trim().min(1).max(120), fields: z.array(fieldSchema).min(1).max(80) }).strict()).min(1).max(20) }).strict()
export type SchemaDraft = z.infer<typeof draftSchema>
export type SchemaImpact = { entityId: string; label: string; changes: string[]; recordIds: string[]; count: number; removedFields: { id: string; label: string; populated: number }[] }
export type CalculationPreview = { entityId: string; fieldId: string; label: string; resultType: string; totalRecords: number; samples: { recordId: string; recordLabel: string; before: Cell | null; after: Cell }[] }
export type ManualPreview = { id: string; appId: string; name: string; schemas: EntitySchema[]; calculations?: CalculationPreview[]; impacts: SchemaImpact[]; expiresAt: string; recovery: string; access: string; kind: 'manual_schema'; parentReleaseId: string | null }
