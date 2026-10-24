import {recordAutomationTrigger} from './trigger-contracts'
import { z } from 'zod'
import { idSchema } from '../authority/validators'
import {automationControlSteps} from './control-contracts'
import { cellValueSchema,filterSchema } from '../records/validators'

export const recordAutomationAction=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('notify'),operatorId:idSchema,title:z.string().trim().min(1).max(200),when:filterSchema.optional()}).strict(),
 z.object({kind:z.literal('sms'),fieldId:idSchema,text:z.string().trim().min(1).max(4000),when:filterSchema.optional()}).strict(),
 z.object({kind:z.literal('email'),operatorId:idSchema,subject:z.string().trim().min(1).max(200),text:z.string().trim().min(1).max(4000),when:filterSchema.optional()}).strict(),
 z.object({kind:z.literal('update'),fieldId:idSchema,value:cellValueSchema,when:filterSchema.optional()}).strict(),
 z.object({kind:z.literal('webhook'),destinationId:idSchema,when:filterSchema.optional()}).strict(),
 z.object({kind:z.literal('slack-app'),channelId:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),text:z.string().trim().min(1).max(3000),fieldId:idSchema,approveValue:cellValueSchema,rejectValue:cellValueSchema,when:filterSchema.optional()}).strict(),
 z.object({kind:z.literal('slack'),destinationId:idSchema,text:z.string().trim().min(1).max(3000),when:filterSchema.optional()}).strict(),
])
export const recordAutomationDefinition=z.object({
 name:z.string().trim().min(1).max(100),appId:idSchema,entityId:idSchema,
 event:z.enum(['created','updated']),trigger:recordAutomationTrigger.optional(),enabled:z.boolean(),actions:z.array(recordAutomationAction).max(10).default([]),steps:automationControlSteps(recordAutomationAction).optional(),
}).strict().superRefine((definition,ctx)=>{if(Boolean(definition.actions.length)===Boolean(definition.steps?.length))ctx.addIssue({code:'custom',message:'Choose either ordered actions or control steps.'})})
export type RecordAutomationDefinition=z.infer<typeof recordAutomationDefinition>
export type RecordAutomationAction=z.infer<typeof recordAutomationAction>
