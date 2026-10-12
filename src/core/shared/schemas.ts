import { z } from 'zod'

export const versionSchema = z.object({
  version: z.number().int().positive(),
})

export const campaignPatchSchema = versionSchema.extend({
  budgetMinor: z.number().int().nonnegative().optional(),
  health: z.number().int().min(0).max(100).optional(),
  name: z.string().trim().min(1).max(280).optional(),
  ownerId: z.string().min(1).optional(),
  phase: z.enum(['Planning', 'Build', 'Production', 'Review', 'Launch prep']).optional(),
  spendMinor: z.number().int().nonnegative().optional(),
  status: z.enum(['On track', 'Watch', 'At risk', 'Blocked']).optional(),
  statusSummary: z.string().trim().max(280).optional(),
})

export const deliverableToggleSchema = versionSchema

export const riskEscalationSchema = versionSchema.extend({
  reason: z.string().trim().min(1).max(2_000),
})

export const decisionOutcomeSchema = versionSchema.extend({
  outcome: z.enum(['Approved', 'Rejected', 'Cancelled']),
  rationale: z.string().trim().max(2_000).optional(),
})

export const lensConditionSchema = z.object({
  field: z.string().trim().min(1),
  operator: z.enum(['equals', 'not equals', 'one of', 'contains', 'is empty', 'is not empty', 'before', 'after', 'within the next N days']),
  value: z.unknown().optional(),
})

export const lensDefinitionSchema = z.object({
  conditions: z.array(lensConditionSchema).max(20),
  description: z.string().trim().max(500),
  display: z.enum(['Grid', 'Cards', 'Timeline', 'Agenda']),
  fields: z.array(z.string().trim().min(1)).max(30),
  name: z.string().trim().min(1).max(120),
  recordType: z.enum(['Campaign', 'Risk', 'Milestone', 'Decision']),
  sort: z.object({
    direction: z.enum(['asc', 'desc']),
    field: z.string().trim().min(1),
  }),
})

export const lensUpdateSchema = lensDefinitionSchema.extend(versionSchema.shape)

export const settingsPatchSchema = versionSchema.extend({
  aiDailyCeiling: z.number().int().min(1).max(10_000).optional(),
  aiEnabled: z.boolean().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().trim().min(1).optional(),
  workspaceName: z.string().trim().min(1).max(160).optional(),
})
