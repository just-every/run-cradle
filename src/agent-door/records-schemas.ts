import { z } from 'zod'
import { idSchema, refSchema, querySchema, entitySchema } from '../domains/records/validators'
import { viewDefinition } from '../domains/records/metadata.server'
import type { JsonSchema, JsonSchemaObject } from '../../vendor/base/modules/agent-door/types'

/** These schemas reuse the native public-door validators, including recursive filters. */
export const jsonInput = (schema: z.ZodType): JsonSchemaObject => z.toJSONSchema(schema, { io: 'input', reused: 'ref' }) as JsonSchemaObject
export const jsonOutput = (schema: z.ZodType): JsonSchema => z.toJSONSchema(schema, { io: 'output', reused: 'ref' }) as JsonSchema
export const emptyInput = z.object({}).strict()
export const baseInput = z.object({ baseId: idSchema }).strict()
export const idInput = z.object({ id: idSchema }).strict()
export const recordInput = z.object({ ref: refSchema }).strict()
export const queryInput = z.object({ baseId: idSchema, tableId: idSchema, query: querySchema }).strict()
export const historyInput = z.object({ ref: refSchema, limit: z.number().int().min(1).max(200).optional(), cursor: z.string().max(20000).optional() }).strict()
export const privateViewDefinition = viewDefinition.omit({ access: true }).extend({
  visibility: z.literal('private'), shipped: z.literal(false), locked: z.literal(false).optional(),
})
export const saveInput = z.object({ id: idSchema.optional(), version: z.number().int().positive().optional(), view: privateViewDefinition }).strict()
const cell = z.union([
  z.object({ state: z.literal('value'), value: z.unknown() }).strict(),
  z.object({ state: z.literal('redacted'), reason: z.enum(['policy', 'erased']) }).strict(),
  z.object({ state: z.literal('unavailable'), code: z.string(), fieldIds: z.array(idSchema), message: z.string() }).strict(),
])
const versioned = { id: idSchema, version: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() }
export const recordOutput = z.object({ ...versioned, ref: refSchema, schemaVersion: z.number().int().positive(), lifecycle: z.string(), fields: z.object({}).catchall(cell), allowedActions: z.array(z.object({ action: z.string(), enabled: z.boolean(), reason: z.string().nullable(), requiredDecisionId: idSchema.nullable() })) }).strict()
export const viewOutput = viewDefinition.extend(versioned).passthrough()
export const formOutput = z.object({ ...versioned, appId: idSchema, entityId: idSchema, title: z.string(), fields: z.array(z.object({ fieldId: idSchema, label: z.string(), help: z.string(), required: z.boolean() }).passthrough()), submitAction: z.string(), authenticated: z.literal(true), schema: entitySchema }).passthrough()
export const schemaOutput = z.object({ baseId: idSchema, tables: z.array(entitySchema) }).strict()
const base = z.object({ id: idSchema, name: z.string(), entryUrl: z.string(), tableCount: z.number().int().nonnegative(), recordCount: z.number().int().nonnegative(), latestChange: z.object({ id: idSchema, name: z.string(), occurredAt: z.string(), href: z.string() }).nullable() }).strict()
export const listOutput = (item: z.ZodType) => z.object({ items: z.array(item), count: z.number().int().nonnegative() }).strict()
export const basesOutput = listOutput(base)
export const viewsOutput = listOutput(viewOutput)
export const viewRevisionsOutput = z.object({ views: z.array(z.object({ id: idSchema, version: z.number().int().positive() }).strict()), count: z.number().int().nonnegative() }).strict()
export const pageOutput = (item: z.ZodType) => z.object({ items: z.array(item), nextCursor: z.string().nullable(), total: z.object({ kind: z.enum(['exact', 'at_least']), value: z.number().int().nonnegative() }).strict(), evaluatedAt: z.string() }).strict()
export const historyOutput = pageOutput(z.object({ id: idSchema, commandId: idSchema, actor: z.object({ id: idSchema, kind: z.string() }), action: z.string(), subject: refSchema.nullable(), changes: z.array(z.object({ fieldId: idSchema, before: cell, after: cell })), sourceIds: z.array(idSchema), personalContentRefs: z.array(idSchema), createdAt: z.string() }).strict())
export const usageOutput = z.object({ calls: z.array(z.object({ id: z.string(), day: z.string(), feature: z.string(), model: z.string(), state: z.string(), inputTokens: z.number().nullable(), outputTokens: z.number().nullable() }).passthrough()), usage: z.array(z.object({ day: z.string(), purpose: z.string(), requests: z.number().int().nonnegative(), inputTokens: z.number().nullable(), outputTokens: z.number().nullable() }).passthrough()), callsLimit: z.number().int().positive() }).strict()
