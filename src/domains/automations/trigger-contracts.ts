import {z} from 'zod'
import {idSchema,instantSchema} from '../authority/validators'
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const userSchedule=z.discriminatedUnion('unit',[
 z.object({unit:z.literal('minutes'),every:z.number().int().safe().min(15).multipleOf(15)}).strict(),
 z.object({unit:z.literal('hourly'),minute:z.number().int().min(0).max(59).default(0)}).strict(),
 z.object({unit:z.literal('daily'),time}).strict(),
 z.object({unit:z.literal('weekly'),weekday:z.number().int().min(0).max(6),time}).strict(),
 z.object({unit:z.literal('monthly'),day:z.number().int().min(1).max(31),time}).strict(),
])
export const recordAutomationTrigger=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('fields_updated'),fieldIds:z.array(idSchema).min(1).max(1000).refine(ids=>new Set(ids).size===ids.length,'Choose each field once.')}).strict(),
 z.object({kind:z.literal('schedule'),recordId:idSchema,startsAt:instantSchema,schedule:userSchedule}).strict(),
 z.object({kind:z.literal('date_offset'),fieldId:idSchema,offsetDays:z.number().int().safe()}).strict(),
])
export type UserSchedule=z.infer<typeof userSchedule>
