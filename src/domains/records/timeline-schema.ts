import { timelineLimits } from './timeline-limits'
import { z } from 'zod'
import { dateSchema, idSchema, instantSchema } from './validators'

export const timelineZoomSchema = z.enum(['day', 'week', 'month', 'quarter', 'year'])
const date = z.union([dateSchema, instantSchema])
export const timelineBaselineSchema = z.object({
  capturedAt: z.string().datetime(), startFieldId: idSchema, endFieldId: idSchema.optional(),
  records: z.array(z.object({ recordId: idSchema, start: date.nullable(), end: date.nullable().optional() }).strict()).max(timelineLimits.records),
}).strict()
