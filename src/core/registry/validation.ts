import { z } from 'zod'
import { ApiError } from './errors'

export const idSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Expected a ULID')
export const refSchema = z.object({ appId: idSchema, entityId: idSchema, recordId: idSchema }).strict()
export const revisionSchema = z.object({ ref: refSchema, version: z.number().int().positive() }).strict()
export function commandSchema<T extends z.ZodType>(input: T) {
  return z.object({ commandId: idSchema, expected: z.array(revisionSchema).max(1000), controlEpoch: z.number().int().nonnegative().optional(), input }).strict()
}
export function validate<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new ApiError('validation', 'The request did not match the command schema.', { issues: result.error.issues.map(issue => ({ path: issue.path.map(String).join('.'), message: issue.message })) })
}
