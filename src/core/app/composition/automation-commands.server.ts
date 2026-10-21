import type { CommandRegistry } from '../../registry/commands'
import type { LaunchAction } from '../../../apps/launch/contracts'
import { createAutomationCommands, type AutomationCommandContribution } from '../../../apps/launch/automation-commands.server'
import { createLaunchHandlers } from '../../../apps/launch/registry.server'

/** A registered Launch command, prepared by its own handler under the context it runs in. */
const launchCommand = (action: LaunchAction): AutomationCommandContribution => ({
 action: `launch.${action}`,
 prepare(context) {
  const prepare = createLaunchHandlers(context)[action]
  if (!prepare) throw new Error(`Launch handler missing for jobs.commands.v1 contribution ${action}`)
  return prepare
 },
})

/** jobs.commands.v1 contributions this installation offers as Launch automation actions.
 * Creating a deliverable is a follow-up step none of the built-in actions can take. */
export const shippedAutomationCommands: readonly AutomationCommandContribution[] = [launchCommand('deliverable.create')]

export const launchAutomationCommands = (registry: CommandRegistry) => createAutomationCommands(registry, shippedAutomationCommands)
