import { z } from 'zod';
const id = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/); const instant = z.iso.datetime();
const money = z.object({ minor: z.string().regex(/^(0|[1-9]\d*)$/), currency: z.string().regex(/^[A-Z]{3}$/), scale: z.number().int().min(0).max(6) }).strict();
const ref = z.object({ appId: id, entityId: id, recordId: id }).strict();
export const effectRequestSchema = z.object({ businessBinding:z.object({kind:z.literal('repair'),hash:z.string().regex(/^[a-f0-9]{64}$/),subject:z.object({ref,version:z.number().int().positive()}).strict()}).strict().optional(),purpose:z.string().min(1).max(128).optional(),fieldIds:z.array(id).max(500).optional(),repairBinding:z.object({agreementId:id,agreementVersion:z.number().int().positive(),subject:z.object({ref,version:z.number().int().positive()}).strict()}).strict().optional(),modelBinding:z.object({id,version:z.number().int().positive()}).strict().optional(),context:z.object({id,sha256:z.string().regex(/^[a-f0-9]{64}$/),purpose:z.string().min(1),sourceRefs:z.array(z.object({id,version:z.number().int().positive(),sha256:z.string(),ownerAppId:id,effectiveAt:instant.nullable(),knownAt:instant,sourceReleaseId:id.nullable()}).strict()).max(200),fieldIds:z.array(id),expiresAt:instant,providerDestination:z.literal('https://api.openai.com/v1/responses')}).strict().nullable().optional(), appId: id, action: z.string().regex(/^[a-z][a-z0-9.-]+$/), connectionId: id, connectionVersion: z.number().int().positive(), provider: z.enum(['resend','google-calendar','xero','openai']), input: z.json(), expected: z.array(z.object({ ref, version: z.number().int().positive() }).strict()).max(1000), cost: z.array(money).max(20), grantId: id.nullable(), grantVersion: z.number().int().positive().nullable(), releaseId: id, schemaVersion: z.number().int().positive(), controlEpoch: z.number().int().nonnegative(), caseId: id.nullable(), definitionId: id.nullable(), definitionVersion: z.number().int().positive().nullable(), trigger: z.string().min(1).max(512), causeRunIds: z.array(id).max(10), causeDefinitionIds: z.array(id).max(10), unknownDeadline: instant, custodianId: id, deadline: instant }).strict();
export const runCancelSchema = z.object({ runId: id, reason: z.string().min(1).max(2000), expectedEpoch: z.number().int().nonnegative() }).strict();
export const runRetrySchema = z.object({ runId: id }).strict();
export const attemptReconcileSchema = z.object({ attemptId: id }).strict();

export const attemptResolveSchema = z.object({
 attemptId: id,
 expectedVersion: z.number().int().positive(),
 outcome: z.enum(['done', 'not_done']),
 evidence: z.object({summary:z.string().trim().min(1).max(8000),reference:z.string().trim().min(1).max(2000),fileId:id.optional()}).strict(),
}).strict();
