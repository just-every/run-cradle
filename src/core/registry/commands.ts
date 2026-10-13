import type { CommandInput, Json } from '../../contracts/primitives'
import type { AdmissionPlan, AdmissionPort, AdmissionReceipt } from '../../domains/admission/ports'
import type { RequestContext } from '../../domains/authority/ports'
import { ApiError } from './errors'

export interface Validator<T> { parse(value: unknown): T }
export interface CommandDefinition<Input, Output> {
  readonly action: string
  readonly description: string
  readonly inputSchema: Json
  readonly input: Validator<CommandInput<Input>>
  /** Proposer tools exist only for a proposing key, and a proposing key sees only them. */
  readonly proposer?: boolean
  /** Disclosure is authorized separately from invocation; no tool-name authority. */
  visible(context: RequestContext): Promise<boolean>
  /** Resolve only canonical identity before any state-dependent preparation or external work. */
  replayIdentity?(context: RequestContext, input: CommandInput<Input>): Promise<{ appId: string; canonicalInputHash: string }>
  prepare(context: RequestContext, input: CommandInput<Input>): Promise<AdmissionPlan<Output>>
}
/** A read a tool caller may make; it admits nothing and changes nothing. */
export interface QueryDefinition<Input, Output> {
  readonly action: string
  readonly description: string
  readonly inputSchema: Json
  readonly input: Validator<Input>
  readonly proposer: true
  run(context: RequestContext, input: Input): Promise<Output>
}
export interface RegisteredQuery { readonly action: string; visible(context: RequestContext): boolean; run(context: RequestContext, value: unknown): Promise<unknown> }
export interface RegisteredCommand {
  readonly action: string
  readonly description: string
  readonly inputSchema: Json
  visible(context: RequestContext): Promise<boolean>
  execute(context: RequestContext, value: unknown): Promise<AdmissionReceipt<unknown>>
}

export function createCommandRegistry(admission: AdmissionPort) {
  const commands = new Map<string, RegisteredCommand>(), queries = new Map<string, RegisteredQuery & { description: string; inputSchema: Json }>()
  const admitted = (context: RequestContext, proposer: boolean | undefined) => Boolean(context.principal.proposer) === Boolean(proposer)
  const name = (action: string) => {
    if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(action)) throw new Error(`Invalid command name: ${action}`)
    if (commands.has(action) || queries.has(action)) throw new Error(`Duplicate command: ${action}`)
  }
  return {
    register<I, O>(definition: CommandDefinition<I, O>) {
      name(definition.action)
      commands.set(definition.action, {
        action: definition.action, description: definition.description, inputSchema: definition.inputSchema,
        visible: async context => admitted(context, definition.proposer) && definition.visible(context),
        async execute(context, value) {
          if (!admitted(context, definition.proposer)) throw new ApiError('not_found', 'Unknown command.')
          const input = definition.input.parse(value)
          const identity = await definition.replayIdentity?.(context, input)
          if (identity) {
            const replay = await admission.replay(context, input.commandId, definition.action, identity.appId, identity.canonicalInputHash)
            if (replay) return replay
          }
          const plan = await definition.prepare(context, input)
          if (plan.action !== definition.action || plan.commandId !== input.commandId) throw new Error('Prepared command identity does not match invocation')
          if (identity && (plan.appId !== identity.appId || plan.canonicalInputHash !== identity.canonicalInputHash)) throw new Error('Prepared canonical identity does not match replay identity')
          return admission.commit(context, plan)
        },
      })
    },
    registerQuery<I, O>(definition: QueryDefinition<I, O>) {
      name(definition.action)
      queries.set(definition.action, { action: definition.action, description: definition.description, inputSchema: definition.inputSchema,
        visible: context => admitted(context, definition.proposer),
        async run(context, value) {
          if (!admitted(context, definition.proposer)) throw new ApiError('not_found', 'Tool is not available.')
          return definition.run(context, definition.input.parse(value))
        } })
    },
    get(action: string) { return commands.get(action) },
    query(action: string) { return queries.get(action) },
    async discover(context: RequestContext) {
      const disclosed = await Promise.all([...commands.values()].map(async command => await command.visible(context) ? { action: command.action, description: command.description, inputSchema: command.inputSchema } : null))
      return [...disclosed.filter(item => item !== null), ...[...queries.values()].filter(query => query.visible(context)).map(query => ({ action: query.action, description: query.description, inputSchema: query.inputSchema }))]
    },
  }
}
export type CommandRegistry = ReturnType<typeof createCommandRegistry>
export type CommandMetadata = { action: string; description: string; inputSchema: Json }
