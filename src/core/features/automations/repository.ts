import type { Database } from '../shared/repository'
import { iso, queryAll } from '../shared/repository'

export const createAutomationRepository = (database: Database) => ({
  async list() {
    const automations = await queryAll<{ id: string, name: string, triggerType: string, triggerConfigJson: string, actionsJson: string, enabled: number, definitionVersion: number, version: number }>(database, `
      SELECT id, name, trigger_type AS triggerType, trigger_config_json AS triggerConfigJson, actions_json AS actionsJson,
        enabled, definition_version AS definitionVersion, version FROM automations
        WHERE NOT EXISTS(SELECT 1 FROM record_automation_bindings WHERE automation_id=automations.id) ORDER BY id ASC
    `)
    return automations.map(({ actionsJson, triggerConfigJson, ...automation }) => ({
      ...automation,
      actions: JSON.parse(actionsJson),
      enabled: Boolean(automation.enabled),
      triggerConfig: JSON.parse(triggerConfigJson),
    }))
  },

  async runs(automationId?: string) {
    const rows = await queryAll<{ id: string, automationId: string, definitionVersion: number, subjectId: string | null, state: string, queuedAt: number, startedAt: number | null, finishedAt: number | null, affectedCount: number, errorCode: string | null, errorMessage: string | null, heldUntil:string|null, version: number }>(database, `
      SELECT id, automation_id AS automationId, definition_version AS definitionVersion, subject_id AS subjectId, state,
        queued_at AS queuedAt, started_at AS startedAt, finished_at AS finishedAt, affected_count AS affectedCount,
        error_code AS errorCode, error_message AS errorMessage, version,
        (SELECT json_extract(a.result_json,'$.heldUntil') FROM launch_automation_actions a
         WHERE a.run_id=automation_runs.id AND a.state='Pending' AND json_extract(a.result_json,'$.heldUntil') IS NOT NULL
         ORDER BY a.position LIMIT 1) AS heldUntil
      FROM automation_runs WHERE NOT EXISTS(SELECT 1 FROM record_automation_bindings WHERE automation_id=automation_runs.automation_id)
      ${automationId ? 'AND automation_id = ?' : ''} ORDER BY queued_at DESC, id DESC
    `, automationId ? [automationId] : [])
    return rows.map((row) => ({ ...row, state:row.heldUntil&&['Queued','Running'].includes(row.state)?'Held':row.state, finishedAt: iso(row.finishedAt), queuedAt: iso(row.queuedAt), startedAt: iso(row.startedAt) }))
  },
})
