import type { CommandInput, Json } from '../../contracts/primitives'
import type { AdmissionPlan, AdmissionPort, AdmissionReceipt } from '../../domains/admission/ports'
import type { RequestContext } from '../../domains/authority/ports'

export interface Validator<T> { parse(value: unknown): T }
export interface CommandDefinition<Input, Output> {
  readonly action: string
  readonly description: string
  readonly inputSchema: Json
  readonly input: Validator<CommandInput<Input>>
  /** Disclosure is authorized separately from invocation; no tool-name authority. */
  visible(context: RequestContext): Promise<boolean>
  /** Resolve only canonical identity before any state-dependent preparation or external work. */
  replayIdentity?(context: RequestContext, input: CommandInput<Input>): Promise<{ appId: string; canonicalInputHash: string }>
  prepare(context: RequestContext, input: CommandInput<Input>): Promise<AdmissionPlan<Output>>
}
export interface RegisteredCommand {
  readonly action: string
  readonly description: string
  readonly inputSchema: Json
  visible(context: RequestContext): Promise<boolean>
  execute(context: RequestContext, value: unknown): Promise<AdmissionReceipt<unknown>>
}

export function createCommandRegistry(admission: AdmissionPort) {
  const commands = new Map<string, RegisteredCommand>()
  return {
    register<I, O>(definition: CommandDefinition<I, O>) {
      if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(definition.action)) throw new Error(`Invalid command name: ${definition.action}`)
      if (commands.has(definition.action)) throw new Error(`Duplicate command: ${definition.action}`)
      commands.set(definition.action, {
        action: definition.action, description: definition.description, inputSchema: definition.inputSchema,
        visible: context => definition.visible(context),
        async execute(context, value) {
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
    get(action: string) { return commands.get(action) },
    async discover(context: RequestContext) {
      const disclosed = await Promise.all([...commands.values()].map(async command => await command.visible(context) ? { action: command.action, description: command.description, inputSchema: command.inputSchema } : null))
      return disclosed.filter(item => item !== null)
    },
  }
}
export type CommandRegistry = ReturnType<typeof createCommandRegistry>
export type CommandMetadata = { action: string; description: string; inputSchema: Json }
