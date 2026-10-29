import { z } from 'zod'
import { ToolRefusal } from '../../vendor/base/modules/agent-door/index'
import type { ClassAndFacts, ResourceContext, ResourceDefinition, ToolContext, ToolDefinition } from '../../vendor/base/modules/agent-door/types'
import type { Runtime } from '../core/app/composition/runtime.server'
import type { RequestContext } from '../domains/authority/ports'
import { idSchema, refSchema } from '../domains/records/validators'
import { createLaunchReader } from '../apps/launch/reader.server'
import { authorizeLaunchProjection } from '../apps/launch/projection-authority.server'
import { LAUNCH_APP_ID, launchEntities } from '../apps/launch/contracts'
import { OperationsRepository } from '../domains/operations/repository.server'
import { createOperationsProjection } from '../domains/operations/environment.server'
import type { Case, Mandate } from '../domains/operations/contracts'
import { createFileService } from '../domains/evidence/files.server'
import * as schemas from './records-schemas'

type Native = (ctx: ToolContext | ResourceContext) => Promise<RequestContext>
const hidden = (error: unknown) => error instanceof Error && 'code' in error && ['forbidden', 'not_found', 'grant_expired', 'grant_revoked'].includes(String(error.code))
const classify = (count: number): ClassAndFacts[] => [{ class: 'standard', facts: { measure: count } }, { class: 'sensitive', facts: { measure: count, kind: 'private-business-content' } }]
async function available<T>(read: () => Promise<T>): Promise<T> {
  try { return await read() } catch (error) {
    if (hidden(error)) throw new ToolRefusal('resource_unavailable')
    if (error instanceof z.ZodError) throw new ToolRefusal('invalid_arguments')
    if (error instanceof Error && 'code' in error) throw new ToolRefusal(String(error.code), error.message)
    throw error
  }
}
const kind = z.enum(['campaign', 'deliverable', 'milestone', 'risk', 'decision', 'lens'])
const queryInput = z.object({ kind: kind.default('campaign'), limit: z.number().int().min(1).max(200).optional(), cursor: idSchema.optional(), includeArchived: z.boolean().optional(), campaignId: idSchema.optional() }).strict()
const readInput = z.object({ id: idSchema }).strict()
const fileOutput = wireFile()
function wireFile() { return z.object({ id: idSchema, version: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string(), filename: z.string(), mediaType: z.string(), bytes: z.number().int().nonnegative(), sha256: z.string(), state: z.string(), sourceId: idSchema.nullable(), rejection: z.string().nullable() }).strict() }
const activityInput = z.object({ campaignId: idSchema, limit: z.number().int().min(1).max(200).optional() }).strict()
const notificationInput = z.object({ limit: z.number().int().min(1).max(200).optional(), before: z.object({ at: z.number().int(), id: idSchema }).strict().optional() }).strict()
const operationInput = z.object({ baseId: idSchema }).strict()
const wire = z.object({ id: idSchema, version: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() }).passthrough()
const campaignOutput = wire.extend({ name: z.string(), code: z.string(), ownerId: idSchema, phase: z.string(), status: z.string(), deliverableTotal: z.number().int().nonnegative(), deliverableComplete: z.number().int().nonnegative(), riskRating: z.string() }).passthrough()
const decisionOutput = wire.extend({ campaignId: idSchema, title: z.string(), state: z.string(), recommendation: z.string(), impact: z.string() }).passthrough()
const queryOutput = z.object({ kind, records: schemas.pageOutput(wire) }).strict()
const commentsOutput = schemas.pageOutput(z.object({ id: idSchema, version: z.number().int().positive(), subject: refSchema, authorLabel: z.string(), body: z.string().nullable() }).passthrough()).passthrough()
const activityOutput = z.object({ campaign: campaignOutput, history: schemas.historyOutput, comments: commentsOutput }).strict()
const notificationsOutput = schemas.pageOutput(z.object({ id: idSchema, version: z.number().int().positive(), kind: z.string(), title: z.string(), body: z.string(), createdAt: z.string(), updatedAt: z.string(), readAt: z.string().nullable(), subject: z.object({ kind: z.string(), id: z.string().nullable(), label: z.string(), available: z.boolean() }).passthrough() }).passthrough()).extend({ unreadCount: z.number().int().nonnegative() }).strict()
const operationRecord = wire.extend({ appId: idSchema, state: z.string() }).passthrough()
const operationsOutput = z.object({ base: z.object({ id: idSchema, name: z.string(), tableCount: z.number().int().nonnegative(), recordCount: z.number().int().nonnegative() }).passthrough(), cases: z.array(operationRecord), mandates: z.array(operationRecord), attention: z.array(operationRecord) }).strict()

/** Read-only adapters use existing native projections and their current guards. */
export function createCradleLaunchReadTools(runtime: Runtime, native: Native): { tools: ToolDefinition[]; resources: ResourceDefinition[] } {
  const db = runtime.records.deps.db, policy = runtime.foundation.policy, launch = createLaunchReader(db, policy), files = createFileService(runtime.records.deps)
  const operations = new OperationsRepository({ db, policy, environment: { project: createOperationsProjection({ db, policy, descriptors: runtime.foundation.descriptors, evidence: runtime.records.sources }) } })
  // The retained campaign projection joins child totals and therefore keeps the
  // same all-Launch read bar as ordinary native portfolio and campaign screens.
  const projected = async <T>(ctx: RequestContext, read: () => Promise<T>) => {
    const current = await authorizeLaunchProjection(db, policy, ctx), value = await read(); await current(); return value
  }
  const campaign = (ctx: RequestContext, id: string) => projected(ctx, () => launch.get(ctx, 'campaign', id))
  const decision = (ctx: RequestContext, id: string) => projected(ctx, () => launch.get(ctx, 'decision', id))
  const tool = (definition: { name: string; title: string; description: string; clauses: string[]; input: z.ZodType; output: z.ZodType; read(args: Record<string, unknown>, ctx: RequestContext): Promise<{ value: unknown; count: number; resources?: {uri: string; name: string}[] }> }): ToolDefinition => ({
    name: definition.name, title: definition.title, description: definition.description, clauses: definition.clauses,
    scope: 'cradle:read', readOnly: true, untrusted: true, classes: ['standard', 'sensitive'],
    inputSchema: schemas.jsonInput(definition.input), outputSchema: schemas.jsonOutput(definition.output),
    async classify(args, ctx) { return classify((await available(async () => definition.read(args, await native(ctx)))).count) },
    async run(args, ctx) { const result = await available(async () => definition.read(args, await native(ctx))); return { result: result.value, ...(result.resources ? { resources: result.resources } : {}) } },
  })
  const tools = [
    tool({ name: 'cradle.campaigns.query', title: 'Query Launch records', description: 'Read a bounded native Launch collection with current campaign rollups and child projection. Restricted sponsors use the field-masked records tools.', clauses: ['CAMP-001', 'CAMP-004', 'CAMP-005', 'CAMP-006', 'CAMP-007', 'CAMP-012', 'VIEW-001', 'VIEW-002', 'VIEW-003', 'VIEW-004', 'VIEW-005', 'VIEW-007'], input: queryInput, output: queryOutput, async read(args, ctx) {
      const { kind, ...query } = queryInput.parse(args)
      if (query.campaignId && !['deliverable', 'milestone', 'risk', 'decision'].includes(kind)) throw new ToolRefusal('invalid_arguments')
      const records = await projected(ctx, () => launch.list(ctx, kind, query)); return { value: { kind, records }, count: records.items.length }
    } }),
    tool({ name: 'cradle.campaigns.read', title: 'Read a Launch campaign', description: 'Read one native campaign, current tags, custom values and child rollups.', clauses: ['CAMP-001', 'CAMP-004', 'CAMP-005', 'CAMP-006', 'CAMP-007', 'CAMP-012'], input: readInput, output: campaignOutput, async read(args, ctx) { const value = await campaign(ctx, readInput.parse(args).id); return { value, count: 1, resources: [{ uri: `cradle://campaigns/${value.id}`, name: String(value.name) }] } } }),
    tool({ name: 'cradle.decisions.read', title: 'Read a Launch decision', description: 'Read a current native decision outcome and its linked campaign identity without recording a human decision.', clauses: ['DEC-001', 'DEC-004', 'DEC-005', 'DEC-006', 'DEC-007'], input: readInput, output: decisionOutput, async read(args, ctx) { const value = await decision(ctx, readInput.parse(args).id); return { value, count: 1, resources: [{ uri: `cradle://decisions/${value.id}`, name: String(value.title) }] } } }),
    tool({ name: 'cradle.activity.read', title: 'Read campaign activity', description: 'Read native campaign change history and currently authorized comments with named native actors.', clauses: ['ACT-001', 'ACT-003', 'COLLAB-001', 'COLLAB-002'], input: activityInput, output: activityOutput, async read(args, ctx) {
      const { campaignId, limit = 200 } = activityInput.parse(args), ref = { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: campaignId }
      const value = { campaign: await campaign(ctx, campaignId), history: await runtime.records.audit.subject(ctx, ref, limit), comments: await runtime.records.comments(ctx, ref, { limit }) }
      return { value, count: 1 + value.history.items.length + value.comments.items.length }
    } }),
    tool({ name: 'cradle.notifications.read', title: 'Read the native inbox', description: 'Read the sponsor’s current native inbox, neutral unavailable notices and unread count; this sends no message.', clauses: ['NOTIFY-001', 'NOTIFY-003', 'NOTIFY-004', 'NOTIFY-005', 'NOTIFY-006', 'NOTIFY-008', 'NOTIFY-009', 'NOTIFY-010'], input: notificationInput, output: notificationsOutput, async read(args, ctx) {
      const { limit, before } = notificationInput.parse(args), value = await runtime.channels.inbox.list(ctx, limit, before); return { value, count: value.items.length }
    } }),
    tool({ name: 'cradle.operations.observe', title: 'Observe native app operations', description: 'Read a visible native base and its currently authorized retained cases, mandates and attention states. This does not start, resume or schedule work.', clauses: ['FLAGSHIP-002', 'FLAGSHIP-003', 'FLAGSHIP-004', 'FLAGSHIP-005', 'FLAGSHIP-006', 'FLAGSHIP-007', 'FLAGSHIP-008', 'FLAGSHIP-010', 'FLAGSHIP-011', 'FLAGSHIP-019'], input: operationInput, output: operationsOutput, async read(args, ctx) {
      const { baseId } = operationInput.parse(args), base = (await runtime.records.services.metadata.apps(ctx)).find(item => item.id === baseId)
      if (!base) throw new ToolRefusal('resource_unavailable')
      const cases = await operations.all<Case>(ctx, 'cases', baseId), mandates = await operations.all<Mandate>(ctx, 'mandates', baseId)
      return { value: { base, cases, mandates, attention: cases.filter(item => ['blocked', 'needs_decision', 'paused', 'taken_over'].includes(item.state)) }, count: 1 + cases.length + mandates.length }
    } }),
    tool({ name: 'cradle.files.read', title: 'Inspect an attachment', description: 'Read currently authorized native attachment metadata. File bytes remain behind their existing native content door; no provider credential or bearer is returned.', clauses: ['FILE-001', 'FILE-002', 'FILE-006'], input: readInput, output: fileOutput, async read(args, ctx) { return { value: await files.metadata(ctx, readInput.parse(args).id), count: 1 } } }),
    tool({ name: 'cradle.audit.query', title: 'Read a native audit trail', description: 'Read one currently visible record’s native admission trail with current field and source projection.', clauses: ['PERM-008', 'PERM-010', 'PERM-011', 'PERM-012', 'PERM-013', 'ACT-001'], input: schemas.historyInput, output: schemas.historyOutput, async read(args, ctx) {
      const { ref, limit, cursor } = schemas.historyInput.parse(args), value = await runtime.records.audit.subject(ctx, ref, limit, cursor); return { value, count: value.items.length }
    } }),
  ]
  const resource = (uriTemplate: string, name: string, read: (ctx: RequestContext, id: string) => Promise<unknown>, prefix: string): ResourceDefinition => ({
    uriTemplate, name, description: 'Current native Launch record under the ordinary full-projection authority.', mimeType: 'application/json', scope: 'cradle:read', classes: ['standard', 'sensitive'],
    classify(record) {
      const value = record.json
      if (!value || typeof value !== 'object' || Array.isArray(value) || !idSchema.safeParse((value as { id?: unknown }).id).success) throw new ToolRefusal('resource_unavailable')
      return classify(1)
    },
    async read(uri, ctx) {
      const match = uri.match(new RegExp(`^cradle://${prefix}/([0-9A-HJKMNP-TV-Z]{26})$`))
      if (!match) return null
      try { return { json: await read(await native(ctx), match[1]!), untrusted: true } } catch (error) { if (hidden(error) || error instanceof ToolRefusal && error.code === 'resource_unavailable') return null; throw error }
    },
  })
  return { tools, resources: [resource('cradle://campaigns/{campaign}', 'Launch campaign', campaign, 'campaigns'), resource('cradle://decisions/{decision}', 'Launch decision', decision, 'decisions')] }
}
