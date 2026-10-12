import { z } from 'zod'
import { idSchema } from '../authority/validators'
import { cellValueSchema } from '../records/validators'

export const recordAutomationAction=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('notify'),operatorId:idSchema,title:z.string().trim().min(1).max(200)}).strict(),
 z.object({kind:z.literal('email'),operatorId:idSchema,subject:z.string().trim().min(1).max(200),text:z.string().trim().min(1).max(4000)}).strict(),
 z.object({kind:z.literal('update'),fieldId:idSchema,value:cellValueSchema}).strict(),
 z.object({kind:z.literal('webhook'),destinationId:idSchema}).strict(),
 z.object({kind:z.literal('slack'),destinationId:idSchema,text:z.string().trim().min(1).max(3000)}).strict(),
])
export const recordAutomationDefinition=z.object({
 name:z.string().trim().min(1).max(100),appId:idSchema,entityId:idSchema,
 event:z.enum(['created','updated']),enabled:z.boolean(),actions:z.array(recordAutomationAction).min(1).max(10),
}).strict()
export type RecordAutomationDefinition=z.infer<typeof recordAutomationDefinition>
export type RecordAutomationAction=z.infer<typeof recordAutomationAction>
