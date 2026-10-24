import {z} from 'zod'
const id=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
export const syncDefinition=z.object({appId:id,entityId:id,startFieldId:id,endFieldId:id.optional(),titleFieldId:id,fieldIds:z.array(id).max(20),connectionId:id,calendarId:z.string().min(1).max(512),enabled:z.boolean()}).strict()
export const saveDefinition=z.object({commandId:id,id:id.optional(),version:z.number().int().positive().optional(),definition:syncDefinition,approveCalendar:z.literal(true),expiresAt:z.iso.datetime().optional()}).strict()
export type SyncDefinition=z.infer<typeof syncDefinition>
export type CalendarBinding={definitionId:string;definitionVersion:number;recordId:string;generation:number;operation:'create'|'move'|'cancel';reviewEtag?:string;reviewResolverId?:string}
