import { describeSchedule } from '../../../apps/launch/schedule'
import { z } from 'zod'
import type { Platform } from '../../platform'
import { createAutomationRepository } from './repository'

export const createAutomationService = (platform: Platform) => {
  const repository = createAutomationRepository(platform.database)

  return {
    async list() {
      const [definitions, runs] = await Promise.all([repository.list(), repository.runs()])
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000

      return definitions.map((definition) => {
        const definitionRuns = runs.filter((run) => run.automationId === definition.id)
        const recentFinished = definitionRuns.filter((run) => run.finishedAt && Date.parse(run.finishedAt) >= cutoff)
        const succeeded = recentFinished.filter((run) => run.state === 'Succeeded').length
        const lastRun = definitionRuns[0]
        const triggerConfig = definition.triggerConfig as Record<string, unknown>
        const events=[triggerConfig.event,...(Array.isArray(triggerConfig.events)?triggerConfig.events:[])].filter(Boolean)
        const trigger = definition.triggerType === 'event'
          ? events.length?events.map(event=>String(event).replace(/\.v1$/,'').replaceAll('.', ' ')).join(' or '):'Choose a product event before enabling'
          : triggerConfig.localRule?describeSchedule(String(triggerConfig.localRule),String(triggerConfig.timezone??'workspace time'))
          : triggerConfig.weekday!==undefined
            ? `Every ${typeof triggerConfig.weekday==='number'?['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][triggerConfig.weekday]:String(triggerConfig.weekday)} at ${String(triggerConfig.hour).padStart(2,'0')}:00 workspace time`
            : `Every day at ${String(triggerConfig.hour).padStart(2,'0')}:00 workspace time${triggerConfig.leadDays?`, ${String(triggerConfig.leadDays)} days before launch`:''}`

        return {
          id: definition.id,
          name: definition.name,
          description: definition.triggerType === 'event'
            ? 'Responds only after the matching workspace event is committed.'
            : 'Evaluates current workspace records on its configured schedule.',
          trigger,
          actions: z.array(z.union([z.string(), z.object({ command: z.string() }).passthrough()])).parse(definition.actions).map(action => typeof action === 'string' ? action : action.command),
          enabled: definition.enabled,
          version: definition.version,
          definitionVersion: definition.definitionVersion,
          successRate30Days: recentFinished.length ? succeeded / recentFinished.length : null,
          runCount30Days: recentFinished.length,
          lastRunAt: lastRun?.finishedAt ?? lastRun?.startedAt ?? lastRun?.queuedAt ?? null,
          lastRunStatus: lastRun?.state ?? null,
          heldUntil:lastRun?.heldUntil??null,
          failure: lastRun && ['Failed', 'Unknown'].includes(lastRun.state) && lastRun.errorCode && lastRun.errorMessage
            ? { code: lastRun.errorCode, message: lastRun.errorMessage }
            : null,
        }
      })
    },
    runs: (automationId?: string) => repository.runs(automationId),
  }
}
