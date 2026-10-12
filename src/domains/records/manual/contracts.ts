import { z } from 'zod'
import { idSchema, fieldSchema, incomingRelationSchema } from '../validators'
import type { EntitySchema } from '../contracts'
export const draftSchema = z.object({ appId: idSchema, name: z.string().trim().min(1).max(120), tables: z.array(z.object({ incomingRelations: z.array(incomingRelationSchema).max(80).optional(), primaryFieldId: idSchema.optional(), id: idSchema, label: z.string().trim().min(1).max(120), fields: z.array(fieldSchema).min(1).max(80) }).strict()).min(1).max(20) }).strict()
export type SchemaDraft = z.infer<typeof draftSchema>
export type SchemaImpact = { entityId: string; label: string; changes: string[]; recordIds: string[]; count: number; removedFields: { id: string; label: string; populated: number }[] }
export type ManualPreview = { id: string; appId: string; name: string; schemas: EntitySchema[]; impacts: SchemaImpact[]; expiresAt: string; recovery: string; access: string; kind: 'manual_schema'; parentReleaseId: string | null }
