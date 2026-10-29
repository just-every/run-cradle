import { ToolRefusal } from '../../vendor/base/modules/agent-door/index'
import type { ClassAndFacts, ResourceContext, ResourceDefinition, ToolContext, ToolDefinition } from '../../vendor/base/modules/agent-door/types'
import type { Runtime } from '../core/app/composition/runtime.server'
import type { RequestContext } from '../domains/authority/ports'
import { RECORD_VIEW_ENTITY_ID } from '../domains/records/contracts'
import { canonicalHash } from '../domains/admission/canonical'
import * as schemas from './records-schemas'

type Native = (ctx: ToolContext | ResourceContext) => Promise<RequestContext>
type ReadResult = { value: unknown; count: number }
const inaccessible = (error: unknown) => error instanceof Error && 'code' in error && ['forbidden', 'not_found', 'grant_expired', 'grant_revoked'].includes(String(error.code))
async function available<T>(read: () => Promise<T>): Promise<T> {
  try { return await read() } catch (error) {
    if (inaccessible(error)) throw new ToolRefusal('resource_unavailable')
    if (error instanceof Error && 'code' in error) throw new ToolRefusal(String(error.code), error.message)
    throw error
  }
}
const facts = (count: number, sensitive = true): ClassAndFacts[] => [
  { class: 'standard', facts: { measure: count } },
  ...(sensitive ? [{ class: 'sensitive' as const, facts: { measure: count, kind: 'private-business-content' } }] : []),
]

/** Native public services remain the authorization and persistence boundary. */
export function createCradleRecordTools(runtime: Runtime, native: Native): { tools: ToolDefinition[]; resources: ResourceDefinition[] } {
  const { services, audit } = runtime.records
  const { metadata, reader, policy } = services
  const scopedRecord = async (ctx: RequestContext, ref: { appId: string; entityId: string; recordId: string }) => reader.record(ctx, await policy.scope(ctx, { appId: ref.appId, entityId: ref.entityId, purpose: 'read' }), ref)
  const baseSchema = async (ctx: RequestContext, baseId: string) => {
    const tables = await metadata.entities(ctx, baseId)
    if (!tables.length) throw new ToolRefusal('resource_unavailable')
    return { baseId, tables }
  }
  const readTool = (definition: {
    name: string; title: string; description: string; clauses: string[]
    input: Parameters<typeof schemas.jsonInput>[0]; output: Parameters<typeof schemas.jsonOutput>[0]
    read(args: Record<string, unknown>, ctx: RequestContext): Promise<ReadResult>; sensitive?: boolean
  }): ToolDefinition => ({
    name: definition.name, title: definition.title, description: definition.description,
    scope: 'cradle:read', readOnly: true, untrusted: true,
    inputSchema: schemas.jsonInput(definition.input), outputSchema: schemas.jsonOutput(definition.output),
    classes: definition.sensitive === false ? ['standard'] : ['standard', 'sensitive'], clauses: definition.clauses,
    async classify(args, ctx) { const result = await available(async () => definition.read(args, await native(ctx))); return facts(result.count, definition.sensitive !== false) },
    async run(args, ctx) { return { result: (await available(async () => definition.read(args, await native(ctx)))).value } },
  })
  const tools: ToolDefinition[] = [
    readTool({ name: 'cradle.views.revisions', title: 'Read view revisions', description: 'Read only currently visible view identifiers and revisions, without titles, filters or record content.', clauses: ['RECORDS-003'], input: schemas.baseInput, output: schemas.viewRevisionsOutput, sensitive: false, async read(args, ctx) {
      const { baseId } = schemas.baseInput.parse(args); await baseSchema(ctx, baseId)
      const views = (await metadata.views(ctx, baseId)).map(({ id, version }) => ({ id, version })).sort((a,b)=>a.id.localeCompare(b.id))
      return { value: { views, count: views.length }, count: views.length }
    } }),
    readTool({ name: 'cradle.records.query', title: 'Query records', description: 'Query currently readable native rows and projected fields with bounded pagination.', clauses: ['RECORDS-001', 'FIELD-005', 'CALC-002', 'VIEW-003', 'VIEW-005', 'VIEW-007', 'VIEW-016', 'VIEW-017'], input: schemas.queryInput, output: schemas.pageOutput(schemas.recordOutput), async read(args, ctx) {
      const { baseId, tableId, query } = schemas.queryInput.parse(args), scope = await policy.scope(ctx, { appId: baseId, entityId: tableId, purpose: 'read' }), value = await reader.query(ctx, scope, query)
      return { value, count: value.items.length }
    } }),
    readTool({ name: 'cradle.records.read', title: 'Read a record', description: 'Read one record through its current row and field authority; unavailable records are indistinguishable.', clauses: ['RECORDS-001', 'PERM-002', 'PERM-003'], input: schemas.recordInput, output: schemas.recordOutput, async read(args, ctx) {
      const value = await scopedRecord(ctx, schemas.recordInput.parse(args).ref); return { value, count: 1 }
    } }),
    readTool({ name: 'cradle.records.history', title: 'Read record history', description: 'Read the native history with current field projection and source visibility.', clauses: ['COLLAB-002'], input: schemas.historyInput, output: schemas.historyOutput, async read(args, ctx) {
      const { ref, limit, cursor } = schemas.historyInput.parse(args), value = await audit.subject(ctx, ref, limit, cursor); return { value, count: value.items.length }
    } }),
    readTool({ name: 'cradle.bases.list', title: 'List readable bases', description: 'List current bases with native readable record counts and table summaries.', clauses: ['RECORDS-001'], input: schemas.emptyInput, output: schemas.basesOutput, async read(args, ctx) {
      schemas.emptyInput.parse(args); const items = await metadata.apps(ctx); return { value: { items, count: items.length }, count: items.length }
    } }),
    readTool({ name: 'cradle.schema.inspect', title: 'Inspect readable schema', description: 'Inspect current table schemas after native row, field and calculation visibility checks.', clauses: ['RECORDS-002', 'FIELD-003', 'PERM-003'], input: schemas.baseInput, output: schemas.schemaOutput, async read(args, ctx) {
      const value = await baseSchema(ctx, schemas.baseInput.parse(args).baseId); return { value, count: value.tables.length }
    } }),
    readTool({ name: 'cradle.views.read', title: 'Read a saved view', description: 'Read the current visible saved view without subscribing to or refreshing it.', clauses: ['RECORDS-003'], input: schemas.idInput, output: schemas.viewOutput, async read(args, ctx) {
      const value = await metadata.readView(ctx, schemas.idInput.parse(args).id); return { value, count: 1 }
    } }),
    readTool({ name: 'cradle.views.list', title: 'List readable views', description: 'List visible app views and the sponsor’s private views; count reflects current native visibility.', clauses: ['RECORDS-003'], input: schemas.baseInput, output: schemas.viewsOutput, async read(args, ctx) {
      const { baseId } = schemas.baseInput.parse(args); await baseSchema(ctx, baseId); const items = await metadata.views(ctx, baseId); return { value: { items, count: items.length }, count: items.length }
    } }),
    readTool({ name: 'cradle.forms.read', title: 'Read an intake form', description: 'Read a current native form and only its authorized fields and action.', clauses: ['FORM-001', 'FORM-002'], input: schemas.idInput, output: schemas.formOutput, async read(args, ctx) {
      const value = await metadata.readForm(ctx, schemas.idInput.parse(args).id); return { value, count: 1 }
    } }),
    readTool({ name: 'cradle.usage.read', title: 'Read AI usage', description: 'Read measured native AI calls and usage for sources the sponsor can currently inspect.', clauses: ['AI-004', 'AI-005', 'AI-006'], input: schemas.emptyInput, output: schemas.usageOutput, sensitive: false, async read(args, ctx) {
      schemas.emptyInput.parse(args); const value = await runtime.launch.usage(ctx); return { value, count: value.calls.length }
    } }),
  ]
  const checkedSave = async (args: Record<string, unknown>, ctx: RequestContext) => {
    const input = schemas.saveInput.parse(args)
    if (Boolean(input.id) !== (input.version !== undefined)) throw new ToolRefusal('invalid_arguments', 'An existing view requires both id and current version.')
    const definition = await metadata.checkedView(ctx, input.view)
    const old = input.id ? await metadata.readView(ctx, input.id) : null
    if (old && (old.visibility !== 'private' || old.locked || old.shipped || old.appId !== definition.appId || old.entityId !== definition.entityId)) throw new ToolRefusal('resource_unavailable')
    return { input, definition, old }
  }
  tools.push({
    name: 'cradle.views.save', title: 'Save a personal view', description: 'Create or update an unshared, unlocked personal view. Does not change records, grants, public visibility, automations or delivery.',
    scope: 'cradle:write', readOnly: false, untrusted: true, inputSchema: schemas.jsonInput(schemas.saveInput), outputSchema: schemas.jsonOutput(schemas.viewOutput),
    classes: ['standard', 'sensitive'], clauses: ['RECORDS-003', 'VIEW-008', 'VIEW-009', 'VIEW-010', 'VIEW-011', 'VIEW-012', 'VIEW-013', 'VIEW-017'],
    revisionType: 'integer',
    async revision(args, ctx) { return available(async () => (await checkedSave(args, await native(ctx))).old?.version ?? 0) },
    async classify(args, ctx) { await available(async () => checkedSave(args, await native(ctx))); return facts(1) },
    async target(args, ctx) { const { old } = await available(async () => checkedSave(args, await native(ctx))); return old ? { kind: 'view', id: old.id } : null },
    async summary(args, ctx) { const { definition, old } = await available(async () => checkedSave(args, await native(ctx))); return { target: { ...(old ? { id: old.id } : {}), name: definition.name }, items: [`Personal view in base ${definition.appId}`, `${definition.fields.length} displayed fields`] } },
    async run(args, ctx) {
      return available(async () => {
        const context = await native(ctx), { input, definition, old } = await checkedSave(args, context)
        if (old && old.version !== input.version) throw new ToolRefusal('revision_conflict', 'The view changed.', { current_revision: old.version })
        const commandId = '01' + (await canonicalHash({ operation: ctx.operationId, agent: ctx.agent.id, tool: 'cradle.views.save' })).slice(0, 24).toUpperCase()
        const command = runtime.foundation.commands.get('view.save')
        if (!command) throw new Error('Native view.save command is unavailable')
        const receipt = await command.execute(context, { commandId, expected: old ? [{ ref: { appId: old.appId, entityId: RECORD_VIEW_ENTITY_ID, recordId: old.id }, version: input.version }] : [], input: { view: definition, ...(input.id ? { id: input.id } : {}) } })
        if (receipt.result.state !== 'committed') throw new Error('Personal view metadata must complete synchronously')
        const value = receipt.result.value as { id: string }
        return { result: receipt.result.value, resources: [{ uri: `cradle://views/${value.id}`, name: definition.name }] }
      })
    },
  })
  const resource = (template: string, name: string, read: (uri: string, ctx: RequestContext) => Promise<unknown | null>, count: (value: unknown) => number = () => 1): ResourceDefinition => ({
    uriTemplate: template, name, description: 'Current native data projected by the sponsor’s existing authority; returned text is untrusted.', mimeType: 'application/json', scope: 'cradle:read', classes: ['standard', 'sensitive'],
    async classify(record) { return facts(count(record.json)) },
    async read(uri, ctx) {
      try { const json = await read(uri, await native(ctx)); return json === null ? null : { json, untrusted: true } }
      catch (error) { if (inaccessible(error) || error instanceof ToolRefusal && error.code === 'resource_unavailable') return null; throw error }
    },
  })
  const id = '[0-9A-HJKMNP-TV-Z]{26}'
  const resources: ResourceDefinition[] = [
    resource('cradle://bases/{base}', 'Readable base', async (uri, ctx) => { const match = uri.match(new RegExp(`^cradle://bases/(${id})$`)); return match ? (await metadata.apps(ctx)).find(item => item.id === match[1]) ?? null : null }),
    resource('cradle://bases/{base}/schema', 'Readable base schema', async (uri, ctx) => { const match = uri.match(new RegExp(`^cradle://bases/(${id})/schema$`)); return match ? baseSchema(ctx, match[1]!) : null }, value => Array.isArray((value as { tables?: unknown[] })?.tables) ? (value as { tables: unknown[] }).tables.length : 0),
    resource('cradle://bases/{base}/tables/{table}/records/{record}', 'Readable record', async (uri, ctx) => { const match = uri.match(new RegExp(`^cradle://bases/(${id})/tables/(${id})/records/(${id})$`)); return match ? scopedRecord(ctx, { appId: match[1]!, entityId: match[2]!, recordId: match[3]! }) : null }),
    resource('cradle://views/{view}', 'Readable view', async (uri, ctx) => { const match = uri.match(new RegExp(`^cradle://views/(${id})$`)); return match ? metadata.readView(ctx, match[1]!) : null }),
    resource('cradle://forms/{form}', 'Readable form', async (uri, ctx) => { const match = uri.match(new RegExp(`^cradle://forms/(${id})$`)); return match ? metadata.readForm(ctx, match[1]!) : null }),
  ]
  return { tools, resources }
}
