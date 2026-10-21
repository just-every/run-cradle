import { ZodError } from 'zod'
import type { CommandInput, Json } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import type { AdmissionPlan } from '../../domains/admission/ports'
import type { CommandRegistry } from '../../core/registry/commands'
import { AdmissionError } from '../../domains/admission/errors'
import { canonicalHash } from '../../domains/admission/canonical'
import { createUlid } from '../../core/shared/ids'
import { LAUNCH_APP_ID } from './contracts'
import type { LaunchContext } from './domain.server'
import type { LegacyAutomationPorts } from './automation-runtime.server'

type Prepare = (ctx: RequestContext, input: CommandInput<Record<string, unknown>>) => Promise<AdmissionPlan<Json>>
type Effects = ReturnType<LegacyAutomationPorts['external']>
type Request = Parameters<LegacyAutomationPorts['external']>[1]
/** jobs.commands.v1: a command registered in the installation command registry, offered
 * as a Launch automation action. `prepare` is that command's own preparation bound to the
 * Launch context it runs under; a run supplies the context of its saved authority. */
export type AutomationCommandContribution = { readonly action: string; prepare(context: LaunchContext): Prepare }
export type AutomationCommands = ReturnType<typeof createAutomationCommands>

const refuse = (message: string): never => { throw new AdmissionError('validation', message) }
// Paths start at the command envelope, so a saved action's input reads as `input.<field>`.
const issues = (error: unknown) => error instanceof ZodError
 ? error.issues.map(issue => `${issue.path.map(String).join('.')}: ${issue.message}`).join('; ')
 : String(error)

export function createAutomationCommands(registry: CommandRegistry, contributions: readonly AutomationCommandContribution[]) {
 const offered = new Map(contributions.map(contribution => [contribution.action, contribution]))
 if (offered.size !== contributions.length) throw new Error('A jobs.commands.v1 command is contributed twice')
 const registered = (action: string) => {
  const contribution = offered.get(action), command = contribution && registry.get(action)
  if (!contribution || !command) return refuse(`Automation action ${action} is not a built-in action or a command contributed through jobs.commands.v1`)
  return { contribution, command }
 }
 // The registered command's own validator checks the saved input inside its usual envelope.
 const envelope = (action: string, commandId: string, input: unknown) => {
  const { command } = registered(action)
  try { return command.input.parse({ commandId, expected: [], input }) as CommandInput<Record<string, unknown>> }
  catch (error) { return refuse(`Automation action ${action} input does not match its command schema: ${issues(error)}`) }
 }
 return {
  offers: (action: string) => offered.has(action),
  /** Composition fails loudly when a contribution names no registered command. */
  verify() { for (const action of offered.keys()) if (!registry.get(action)) throw new Error(`jobs.commands.v1 contribution ${action} is not a registered command`) },
  validate(action: string, input: unknown) { envelope(action, createUlid(), input) },
  /** Prepare the command under the run's scoped context. The run admits this plan with the
   * action's own receipt, so a redelivery cannot repeat it, and its events carry the run. */
  async execute(context: LaunchContext, ctx: RequestContext, request: Request): Effects {
   const commandId = (await canonicalHash({ automationAction: request.idempotencyKey })).slice(0, 26).toUpperCase()
   const input = envelope(request.action, commandId, request.input)
   let plan: AdmissionPlan<Json>
   try { plan = await registered(request.action).contribution.prepare(context)(ctx, input) }
   catch (error) {
    if (error instanceof AdmissionError && error.code === 'version_conflict') refuse(`${request.action} fences a record version, which an automation action does not supply`)
    throw error
   }
   if (plan.action !== request.action || plan.commandId !== commandId || plan.appId !== LAUNCH_APP_ID || plan.commitAtomic) throw new Error(`Contributed command ${request.action} must prepare one Launch plan the run can admit`)
   const causeRunIds = [...request.run.causeRunIds, request.run.id]
   return { guards: [...plan.permit.guards, ...plan.guards], mutations: [...plan.mutations, ...plan.permit.reservationMutations], outbox: plan.outbox.map(entry => ({ ...entry, causeRunIds })), events: [...plan.events], audit: [...plan.audit], changed: [...plan.changed ?? []], state: 'Complete', result: plan.committedResult }
  },
 }
}
