import { z } from 'zod'
import { validTimezone } from './clock'
export const timezone=z.string().min(1).max(100).refine(validTimezone,'A valid IANA timezone is required')
export const quietTime=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
// Intl rejects invalid currency lengths, but accepts arbitrary three-letter codes; use its supported ISO list.
const currencies=new Set(Intl.supportedValuesOf('currency'))
export const currency=z.string().refine(v=>currencies.has(v),'An ISO 4217 currency is required')
export const workspaceChanges=z.object({workspaceName:z.string().trim().min(1).max(200).optional(),timezone:timezone.optional(),currency:currency.optional(),quietHoursStart:quietTime.optional(),quietHoursEnd:quietTime.optional(),aiEnabled:z.boolean().optional(),aiDailyCeiling:z.number().int().min(1).max(100000).optional()}).strict()
export const preferenceInput=z.object({timezone:timezone.nullable(),mutedKinds:z.array(z.string().min(1).max(80)).max(100).refine(v=>new Set(v).size===v.length,'Duplicate notification kinds'),digestEnabled:z.boolean().nullable(),progressEnabled:z.boolean()}).strict()
