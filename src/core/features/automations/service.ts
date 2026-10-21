import { describeSchedule } from '../../../apps/launch/schedule'
import { launchCollection } from '../../../apps/launch/paging'
import { instantSchema } from '../../../domains/records/validators'
import { z } from 'zod'
import type { Platform } from '../../platform'
import { createAutomationRepository, finishedStates } from './repository'

export const successWindowDays = 30

export const createAutomationService = (platform: Platform) => {
  const repository = createAutomationRepository(platform.database)

  return {
    /** Automation Monitor: each definition, its newest run and its success rate over the
     * trailing 30 days ending at `windowEnd` (now unless the caller names an instant). */
    async monitor(windowEnd?: string) {
      const to = windowEnd === undefined ? Date.now() : Date.parse(instantSchema.parse(windowEnd))
      const from = to - successWindowDays * 24 * 60 * 60 * 1000
      const [definitions, latest, finished] = await Promise.all([repository.list(), repository.latestRuns(), repository.finished(from, to)])

      const automations = definitions.map((definition) => {
        const counts = finished.find((row) => row.automationId === definition.id)
        const lastRun = latest.find((row) => row.automationId === definition.id)
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
          successRate30Days: counts ? counts.succeeded / counts.finished : null,
          runCount30Days: counts?.finished ?? 0,
          succeededCount30Days: counts?.succeeded ?? 0,
          lastRunAt: lastRun?.finishedAt ?? lastRun?.startedAt ?? lastRun?.queuedAt ?? null,
          lastRunStatus: lastRun?.state ?? null,
          heldUntil:lastRun?.heldUntil??null,
          failure: lastRun && ['Failed', 'Unknown'].includes(lastRun.state) && lastRun.errorCode && lastRun.errorMessage
            ? { code: lastRun.errorCode, message: lastRun.errorMessage }
            : null,
        }
      })
      return { automations, successWindow: { days: successWindowDays, from: new Date(from).toISOString(), to: new Date(to).toISOString(), finishedStates } }
    },
    /** Retained run history paged under VIEW-007: newest queued first, then run ID. */
    async runs(query: { automationId?: string, cursor?: string, limit?: string }) {
      const page = launchCollection(await repository.runKeys(query.automationId), query.cursor, query.limit, (run) => [run.queuedAt, run.id], ['desc', 'desc'])
      const runs = await repository.runs(page.items.map((run) => run.id))
      return { ...page, items: runs, runs }
    },
  }
}
