import { z } from 'zod'
import { idSchema } from '../validators'
import { draftSchema, type SchemaImpact } from './contracts'
import type { EntitySchema } from '../contracts'

const sort = z.object({ fieldId: idSchema, direction: z.enum(['asc', 'desc']) }).strict()
/** A view the owner gets on adoption: shared with the app, never shipped, unfiltered. */
export const proposedViewSchema = z.object({ entityId: idSchema, name: z.string().trim().min(1).max(200), display: z.enum(['grid', 'cards', 'board', 'calendar']), fields: z.array(idSchema).min(1).max(200), sort: z.array(sort).max(10), groupBy: z.array(idSchema).max(1), layout: z.object({ titleFieldId: idSchema, startFieldId: idSchema.optional(), boardFieldId: idSchema.optional() }).strict() }).strict()
/** A form that creates a record in its table through the ordinary record.create admission. */
export const proposedFormSchema = z.object({ entityId: idSchema, title: z.string().trim().min(1).max(200), fields: z.array(z.object({ fieldId: idSchema, label: z.string().max(200), help: z.string().max(2000), required: z.boolean() }).strict()).min(1).max(200) }).strict()
/** Everything an agent may propose. Names, help and the note are stored and shown as plain text. */
export const proposalSchema = z.object({ schema: draftSchema, views: z.array(proposedViewSchema).max(40).default([]), forms: z.array(proposedFormSchema).max(20).default([]), note: z.string().trim().max(2000).default('') }).strict()
export type ProposalInput = z.infer<typeof proposalSchema>
export type ProposedView = z.infer<typeof proposedViewSchema>
export type ProposedForm = z.infer<typeof proposedFormSchema>
export type ProposalState = 'pending' | 'adopted' | 'declined' | 'stale' | 'withdrawn'
/** The impact an agent receives: counts only, never record identities or values. */
export type AgentImpact = Omit<SchemaImpact, 'recordIds'>
export type ProposalSummary = { id: string; appId: string; baseName: string; keyName: string; createdAt: string; expiresAt: string; summary: string; state: ProposalState; keyCurrent: boolean; note: string; declineNote: string | null; releaseId: string | null }
export type OwnerProposal = ProposalSummary & { previewHash: string; schemas: EntitySchema[]; impacts: SchemaImpact[]; metadata: string[]; views: ProposedView[]; forms: ProposedForm[]; access: string; recovery: string }
export type AgentProposal = ProposalSummary & { previewHash: string; impacts: AgentImpact[]; metadata: string[]; views: ProposedView[]; forms: ProposedForm[]; access: string }
