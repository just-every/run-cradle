import {z} from 'zod'
import {filterSchema} from '../records/validators'
import type {RecordAutomationAction,RecordAutomationDefinition} from './contracts'
export function automationControlSteps(action:z.ZodType<RecordAutomationAction>){
 const actions=z.array(action).min(1).max(10)
 return z.array(z.discriminatedUnion('kind',[
  z.object({kind:z.literal('action'),action}).strict(),
  z.object({kind:z.literal('condition'),when:filterSchema,actions}).strict(),
  z.object({kind:z.literal('branch'),paths:z.array(z.object({when:filterSchema,actions}).strict()).min(1).max(10),otherwise:actions.optional()}).strict(),
  z.object({kind:z.literal('repeat'),find:filterSchema,actions}).strict(),
 ])).min(1).max(10)
}
export function automationDefinitionActions(definition:RecordAutomationDefinition):RecordAutomationAction[]{
 return [...definition.actions,...(definition.steps??[]).flatMap(step=>step.kind==='action'?[step.action]:step.kind==='branch'?[...step.paths.flatMap(path=>path.actions),...(step.otherwise??[])]:step.actions)]
}
