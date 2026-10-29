import { z } from 'zod'
import { ToolRefusal } from '../../vendor/base/modules/agent-door/index.ts'
import type { JsonSchema, JsonSchemaObject, ResourceContext, ResourceDefinition, ToolContext, ToolDefinition } from '../../vendor/base/modules/agent-door/types.ts'
import type { Runtime } from '../core/app/composition/runtime.server'
import type { RequestContext } from '../domains/authority/ports'
import { proposalSchema } from '../domains/records/manual/proposal-contracts'
import { idSchema } from '../domains/records/validators'
import { canonicalHash } from '../domains/admission/canonical'

const object = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchemaObject => ({ type: 'object', properties, required, additionalProperties: false })
const text: JsonSchema = { type: 'string' }
const optionalText: JsonSchema = { type: ['string', 'null'] }
const objects: JsonSchema = { type: 'array', items: { type: 'object' } }
const strings: JsonSchema = { type: 'array', items: text }
const summaryOutput = object({
  id: text, appId: text, baseName: text, keyName: text, createdAt: text, expiresAt: text,
  summary: text, state: { enum: ['pending', 'adopted', 'declined', 'stale', 'withdrawn'] },
  keyCurrent: { type: 'boolean' }, note: text, declineNote: optionalText, releaseId: optionalText,
})
const proposalOutput = object({ ...summaryOutput.properties, previewHash: text, impacts: objects, metadata: strings, views: objects, forms: objects, access: text })
const schemaOutput = object({ appId: text, name: optionalText, tables: objects, views: objects, forms: objects, newIds: strings })
const oneInput = z.object({ proposalId: idSchema }).strict()

/** Base 0.2.87 supports patternProperties, but not Zod's propertyNames keyword.
 * Express the native ULID-keyed formula map with the equivalent closed pattern
 * map. Native proposalSchema.parse and the command validator still run below.
 */
export const proposalToolInputSchema = (() => {
  const generated = z.toJSONSchema(proposalSchema, { io: 'input', reused: 'ref' }) as JsonSchemaObject
  const draft = generated.properties!.schema as JsonSchemaObject
  const formulas = draft.properties!.formulaSources as Record<string, unknown>
  const identifier = z.toJSONSchema(idSchema, { io: 'input' })
  if (identifier.type !== 'string' || typeof identifier.pattern !== 'string' || !formulas.propertyNames || !formulas.additionalProperties)
    throw new TypeError('The native proposal formula map needs a supported identifier schema.')
  const { propertyNames: _names, additionalProperties: valueSchema, ...map } = formulas
  draft.properties!.formulaSources = { ...map, patternProperties: { [identifier.pattern]: valueSchema }, additionalProperties: false }
  return generated
})()
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Stable native command identity follows the door's original operation, including approval execution. */
async function commandId(ctx: ToolContext, action: string) {
  const digest = await canonicalHash({ operation: ctx.operationId, action, agent: ctx.agent.id, client: ctx.clientId ?? null })
  let value = BigInt('0x' + digest.slice(0, 32)), encoded = ''
  for (let i = 0; i < 26; i++) { encoded = alphabet[Number(value & 31n)] + encoded; value >>= 5n }
  return encoded
}
const nativeError = (error: unknown): never => {
  if (error instanceof ToolRefusal) throw error
  if (error instanceof Error && 'code' in error) throw new ToolRefusal(String(error.code), error.message, { message: error.message })
  if (error instanceof z.ZodError) throw new ToolRefusal('invalid_arguments', 'The proposal does not match its native schema.')
  throw error
}

/** Inert proposals keep their original key, issuer fence and native command service. */
export function createCradleProposalTools(runtime: Runtime, native: (ctx: ToolContext | ResourceContext) => Promise<RequestContext>) {
  const registry = runtime.foundation.commands
  const query = async (action: string, args: Record<string, unknown>, ctx: ToolContext | ResourceContext) => {
    try {
      const current = await native(ctx), definition = registry.query(action)
      if (!current.principal.proposer || !definition?.visible(current)) throw new ToolRefusal('tool_not_found', 'This tool requires its native proposing key.')
      return await definition.run(current, args) as Record<string, unknown>
    } catch (error) { return nativeError(error) }
  }
  const authorize = (ctx: ToolContext | ResourceContext) => query('schema.read', {}, ctx)
  const standard = () => [{ class: 'standard' as const, facts: { measure: 1 } }]
  const base = { scope: 'schema:read', classes: ['standard'] as ToolDefinition['classes'], clauses: ['RECORDS-007'], untrusted: true }
  const read = (action: string, title: string, inputSchema: JsonSchemaObject, outputSchema: JsonSchema): ToolDefinition => ({
    ...base, name: `cradle.${action}`, title, description: `Read the native proposing key's ${title.toLowerCase()}; current issuer and base authority are required.`,
    readOnly: true, inputSchema, outputSchema,
    async classify(args, ctx) { await query(action, args, ctx); return standard() },
    async run(args, ctx) { return { result: await query(action, args, ctx) } },
  })
  const proposal = (args: Record<string, unknown>, ctx: ToolContext | ResourceContext) => query('schema.proposal', { proposalId: args.proposalId }, ctx)
  const tools: ToolDefinition[] = [
    read('schema.read', 'Schema', object({}), schemaOutput),
    read('schema.proposals', 'Proposals', object({}), object({ items: { type: 'array', items: summaryOutput } })),
    {
      ...read('schema.proposal', 'Proposal', z.toJSONSchema(oneInput, { io: 'input', reused: 'ref' }) as JsonSchemaObject, proposalOutput),
      async target(args, ctx) { const row = await proposal(args, ctx); return { kind: 'schema_proposal', id: String(row.id) } },
    },
    {
      ...base, scope: 'schema:propose', name: 'cradle.schema.propose', title: 'Propose schema',
      description: 'Prepare one inert schema, view and form proposal for this key’s base. The native owner must separately adopt it; this tool changes no records, authority or provider state.',
      readOnly: false, inputSchema: proposalToolInputSchema, outputSchema: proposalOutput,
      async classify(args, ctx) {
        try {
          const input = proposalSchema.parse(args), current = await authorize(ctx)
          if (input.schema.appId !== current.appId) throw new ToolRefusal('not_found', 'Application not found.')
          return standard()
        } catch (error) { return nativeError(error) }
      },
      async summary(args, ctx) {
        try {
          await authorize(ctx)
          const input = proposalSchema.parse(args)
          return { target: { id: input.schema.appId, name: input.schema.name }, items: input.schema.tables.map(table => table.label) }
        } catch (error) { return nativeError(error) }
      },
      async run(args, ctx) {
        try {
          const current = await native(ctx), definition = registry.get('schema.propose')
          if (!definition || !await definition.visible(current)) throw new ToolRefusal('tool_not_found')
          const receipt = await definition.execute(current, { commandId: await commandId(ctx, 'schema.propose'), expected: [], input: proposalSchema.parse(args) })
          if (receipt.result.state !== 'committed') throw new ToolRefusal('version_conflict', 'The native proposal has not committed.')
          return { result: receipt.result.value, resources: [{ uri: `cradle://proposals/${(receipt.result.value as { id: string }).id}`, name: 'Schema proposal' }] }
        } catch (error) { return nativeError(error) }
      },
    },
    {
      ...base, scope: 'schema:propose', name: 'cradle.schema.withdraw', title: 'Withdraw proposal',
      description: 'Withdraw a pending proposal made by this exact proposing key. Adoption remains exclusively with the native owner.',
      readOnly: false, inputSchema: z.toJSONSchema(oneInput, { io: 'input', reused: 'ref' }) as JsonSchemaObject,
      outputSchema: object({ id: text, state: { const: 'withdrawn' } }), revisionType: 'string',
      async revision(args, ctx) { const row = await proposal(args, ctx); return JSON.stringify([row.state, row.previewHash, row.expiresAt, row.keyCurrent]) },
      async target(args, ctx) { const row = await proposal(args, ctx); return { kind: 'schema_proposal', id: String(row.id) } },
      async classify(args, ctx) { await proposal(args, ctx); return standard() },
      async summary(args, ctx) { const row = await proposal(args, ctx); return { target: { id: String(row.id), name: String(row.summary) }, items: ['Withdraw the pending proposal'] } },
      async run(args, ctx) {
        try {
          const current = await native(ctx), definition = registry.get('schema.withdraw')
          if (!definition || !await definition.visible(current)) throw new ToolRefusal('tool_not_found')
          const receipt = await definition.execute(current, { commandId: await commandId(ctx, 'schema.withdraw'), expected: [], input: oneInput.parse(args) })
          if (receipt.result.state !== 'committed') throw new ToolRefusal('version_conflict', 'The native withdrawal has not committed.')
          return { result: receipt.result.value }
        } catch (error) { return nativeError(error) }
      },
    },
  ]
  const resources: ResourceDefinition[] = [{
    uriTemplate: 'cradle://proposals/{proposal}', name: 'Schema proposal', description: 'Only the exact proposing key can read its own proposal.',
    scope: 'schema:read', classes: ['standard'], mimeType: 'application/json',
    classify: () => standard(),
    async read(uri, ctx) {
      const match = /^cradle:\/\/proposals\/([0-9A-HJKMNP-TV-Z]{26})$/.exec(uri)
      if (!match) return null
      try { return { json: await proposal({ proposalId: match[1] }, ctx), untrusted: true } }
      catch (error) { if (error instanceof ToolRefusal && ['tool_not_found', 'not_found', 'forbidden', 'grant_revoked', 'unauthenticated'].includes(error.code)) return null; throw error }
    },
  }]
  return { tools, resources }
}
