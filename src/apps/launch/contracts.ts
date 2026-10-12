import { z } from 'zod'
import { dateSchema, instantSchema, idSchema, refSchema, cellValueSchema } from '../../domains/records/validators'
import type { CommandInput } from '../../contracts/primitives'

export const LAUNCH_APP_ID = '00000000000000000000000700'
export const launchEntities = { campaign:'00000000000000000000000701',deliverable:'00000000000000000000000702',milestone:'00000000000000000000000703',risk:'00000000000000000000000704',decision:'00000000000000000000000705',lens:'00000000000000000000000706',automation:'00000000000000000000000707',customField:'00000000000000000000000708',readiness:'00000000000000000000000709' } as const
const text=z.string().trim().min(1).max(1000), reason=z.string().trim().min(1).max(10000)
export const campaignFields=z.object({code:text.max(100),name:text,ownerId:idSchema,startDate:dateSchema,launchDate:dateSchema,objective:z.string().max(100000),statusSummary:z.string().max(280),phase:text,status:text,health:z.number().int().min(0).max(100),budgetMinor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),spendMinor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),tags:z.array(text).max(500),customFields:z.record(idSchema,cellValueSchema)}).strict()
export const deliverableFields=z.object({campaignId:idSchema,title:text,ownerId:idSchema,dueDate:dateSchema.nullable()}).strict()
export const milestoneFields=z.object({campaignId:idSchema,title:text,ownerId:idSchema,type:z.enum(['Launch','Review','Approval','Decision','Event','Publish']),status:z.enum(['Not started','On track','Watch','At risk','Blocked','Complete']),startDate:dateSchema,endDate:dateSchema.nullable(),conflictReason:reason.nullable()}).strict()
export const riskFields=z.object({campaignId:idSchema,title:text,ownerId:idSchema,severity:z.enum(['Low','Medium','High','Critical']),dueDate:dateSchema.nullable(),signal:z.string().max(2000),mitigation:z.string().max(2000)}).strict()
export const decisionFields=z.object({campaignId:idSchema,riskId:idSchema.nullable(),supersedesId:idSchema.nullable(),title:text,requesterId:idSchema,assigneeId:idSchema.nullable(),priority:z.enum(['Critical','High','Medium','Low']),dueAt:instantSchema,recommendation:z.string().max(100000),impact:z.string().max(100000)}).strict()
export const lensDefinition=z.object({name:text,description:z.string().max(10000),recordType:z.enum(['Campaign','Risk','Milestone','Decision']),conditions:z.array(z.object({field:text,operator:z.enum(['equals','not equals','one of','contains','is empty','is not empty','before','after','within the next N days']),value:z.union([cellValueSchema,z.number().finite()]).optional()}).strict()).max(20),sort:z.object({field:text,direction:z.enum(['asc','desc'])}).strict(),fields:z.array(text).max(100),display:z.enum(['Grid','Cards','Timeline','Agenda'])}).strict()
const actionInput=z.discriminatedUnion('command',[
 z.object({command:z.literal('escalate-risk'),input:z.object({id:idSchema,reason}).strict()}).strict(),
 z.object({command:z.literal('create-decision'),input:decisionFields}).strict(),
 z.object({command:z.literal('notify-operator'),input:z.object({operatorId:idSchema,subjectId:idSchema,title:text,body:z.string().max(10000)}).strict()}).strict(),
 z.object({command:z.literal('send-email'),input:z.object({operatorId:idSchema,subjectId:idSchema,title:text,body:z.string().max(10000)}).strict()}).strict(),
 z.object({command:z.literal('request-ai-analysis'),input:z.object({campaignId:idSchema}).strict()}).strict(),
 z.object({command:z.literal('add-activity'),input:z.object({campaignId:idSchema,message:text}).strict()}).strict(),
])
export const automationDefinition=z.object({name:text,trigger:z.discriminatedUnion('kind',[z.object({kind:z.literal('event'),event:text}).strict(),z.object({kind:z.literal('schedule'),localRule:text,timezone:text}).strict()]),actions:z.array(actionInput).min(1).max(100),enabled:z.boolean()}).strict()
export const customFieldDefinition=z.object({name:text,type:z.enum(['text','number','date','boolean','select','multi_select','url']),options:z.array(text).max(1000).optional()}).strict()
const id=z.object({id:idSchema}).strict(), empty=z.object({}).strict()
const create=<T extends z.ZodType>(fields:T)=>z.object({fields}).strict()
const patch=<T extends z.ZodRawShape>(fields:z.ZodObject<T>)=>z.object({id:idSchema,changes:fields.partial()}).strict()
export const launchInputs={
 'comment.create':z.object({campaignId:idSchema,body:z.string().trim().min(1).max(10000),mentions:z.array(idSchema).max(100).refine(ids=>new Set(ids).size===ids.length,'Duplicate mention')}).strict(),
 'campaign.create':create(campaignFields),'campaign.patch':patch(campaignFields),'campaign.archive':id,'campaign.restore':id.extend({ownerId:idSchema.optional()}),'campaign.delete':id.extend({confirmationCode:text}),'campaign.duplicate':id.extend({newCode:text,newLaunchDate:dateSchema.optional()}),
 'deliverable.create':create(deliverableFields),'deliverable.patch':patch(deliverableFields),'deliverable.delete':id,'deliverable.complete':id,'deliverable.reopen':id,
 'milestone.create':create(milestoneFields),'milestone.patch':patch(milestoneFields),'milestone.delete':id,'milestone.set-predecessors':id.extend({predecessorIds:z.array(idSchema).max(10000)}),
 'risk.create':create(riskFields),'risk.patch':patch(riskFields),'risk.delete':id,'risk.escalate':id.extend({reason}),'risk.resolve':id.extend({resolutionNote:reason}),'risk.reopen':id,
 'decision.create':create(decisionFields),'decision.patch':patch(decisionFields),'decision.delete':id,'decision.assign':id.extend({assigneeId:idSchema}),'decision.outcome':id.extend({outcome:z.enum(['Approved','Rejected','Cancelled']),rationale:z.string().max(10000)}),'decision.request-change':id.extend({rationale:reason}),'decision.supersede':id.extend({fields:decisionFields}),
 'lens.save':z.object({id:idSchema.optional(),definition:lensDefinition}).strict(),'lens.delete':id,'lens.restore':id,
 'custom-field.save':z.object({id:idSchema.optional(),field:customFieldDefinition}).strict(),'custom-field.delete':id.extend({confirmedAffectedCount:z.number().int().nonnegative()}),
 'readiness.acknowledge':z.object({requestId:idSchema}).strict(),
 'automation.save':z.object({id:idSchema.optional(),definition:automationDefinition}).strict(),'automation.enable':id,'automation.disable':id,'automation.retry':z.object({runId:idSchema}).strict(),
 'analysis.request':z.object({feature:z.enum(['campaign-brief','risk-readout','lens-proposal']),campaignId:idSchema.optional(),lensId:idSchema.optional(),lensDraft:lensDefinition.optional(),prompt:z.string().max(10000).optional()}).strict(),
 'samples.install':empty,'samples.remove':z.object({installationId:idSchema}).strict(),
 'bulk.apply':z.object({recordType:z.enum(['Campaign','Risk','Milestone','Decision']),ids:z.array(idSchema).min(1).max(500),change:z.discriminatedUnion('kind',[z.object({kind:z.literal('field'),field:z.enum(['ownerId','phase','status']),value:text}).strict(),z.object({kind:z.enum(['tag-add','tag-remove']),value:text}).strict(),z.object({kind:z.literal('custom-field'),fieldId:idSchema,value:cellValueSchema}).strict(),z.object({kind:z.enum(['archive','restore'])}).strict()])}).strict(),'bulk.undo':z.object({bulkId:idSchema}).strict(),
} as const
export type LaunchAction=keyof typeof launchInputs
export type LaunchInput<A extends LaunchAction>=z.infer<(typeof launchInputs)[A]>
export type CampaignFields=z.infer<typeof campaignFields>
export type DeliverableFields=z.infer<typeof deliverableFields>
export type MilestoneFields=z.infer<typeof milestoneFields>
export type RiskFields=z.infer<typeof riskFields>
export type LegacyDecisionFields=z.infer<typeof decisionFields>
export type LegacyLens=z.infer<typeof lensDefinition>
export type LegacyAutomation=z.infer<typeof automationDefinition>
export function launchCommandSchema<A extends LaunchAction>(action:A):z.ZodType<CommandInput<LaunchInput<A>>>{return z.object({commandId:idSchema,expected:z.array(z.object({ref:refSchema,version:z.number().int().positive()}).strict()).max(10000),controlEpoch:z.number().int().nonnegative().optional(),input:launchInputs[action]}).strict() as unknown as z.ZodType<CommandInput<LaunchInput<A>>>}

export type LaunchVersioned={id:string;version:number;createdAt:string;updatedAt:string}
export type LaunchCampaign=LaunchVersioned&CampaignFields&{archivedAt:string|null;healthSetById:string|null;healthSetAt:string;healthStale:boolean;deliverableComplete:number;deliverableTotal:number;riskRating:'None'|'Low'|'Medium'|'High'|'Critical'}
export type LaunchDeliverable=LaunchVersioned&DeliverableFields&{state:'Open'|'Complete';completedAt:string|null;completedById:string|null;overdue:boolean}
export type LaunchMilestone=LaunchVersioned&MilestoneFields&{predecessorIds:string[];dependencyConflict:boolean;overdue:boolean}
export type LaunchRisk=LaunchVersioned&RiskFields&{state:'Watching'|'In progress'|'Needs decision'|'Escalated'|'Resolved';resolutionNote:string|null;resolvedAt:string|null;resolvedById:string|null;escalationReason:string|null;escalatedAt:string|null;escalatedById:string|null}
export type LaunchDecision=LaunchVersioned&LegacyDecisionFields&{state:'Awaiting approval'|'In review'|'Approved'|'Rejected'|'Cancelled';outcomeAt:string|null;outcomeById:string|null;rationale:string|null;supersededByIds:string[]}
