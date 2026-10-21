import type { Database } from '../shared/repository'
import { iso, queryAll } from '../shared/repository'

/** Terminal states that count as finished for the success rate (AUTO-006). Cancelled and
 * Suppressed runs were stopped or never dispatched and are not finished outcomes. */
export const finishedStates = ['Succeeded', 'Failed', 'Unknown'] as const
// Record-base automations keep their own history (AUTO-USER-006); these reads are Launch runs.
const launchRun = (alias: string) => `NOT EXISTS(SELECT 1 FROM record_automation_bindings WHERE automation_id=${alias}.automation_id)`
const heldUntil = (alias: string) => `(SELECT json_extract(a.result_json,'$.heldUntil') FROM launch_automation_actions a
  WHERE a.run_id=${alias}.id AND a.state='Pending' AND json_extract(a.result_json,'$.heldUntil') IS NOT NULL ORDER BY a.position LIMIT 1)`
const shownState = (state: string, held: string | null) => held && ['Queued', 'Running'].includes(state) ? 'Held' : state

type RunRow = { id: string, automationId: string, version: number, definitionVersion: number, subjectId: string | null, state: string, queuedAt: number, startedAt: number | null, finishedAt: number | null, affectedCount: number, errorCode: string | null, errorMessage: string | null, heldUntil: string | null, triggerKey: string | null, retryOf: string | null, definitionJson: string | null, eventName: string | null, eventVersion: number | null }
type ActionRow = { runId: string, position: number, state: string, resultJson: string | null, errorCode: string | null, errorMessage: string | null, startedAt: number | null, finishedAt: number | null }

function trigger(row: RunRow) {
  if (row.triggerKey === null) return null
  if (row.triggerKey.startsWith('schedule:')) return { kind: 'schedule' as const, key: row.triggerKey, occurrence: row.triggerKey.slice('schedule:'.length) }
  return { kind: 'event' as const, key: row.triggerKey, event: row.eventName === null ? null : `${row.eventName}.v${row.eventVersion}` }
}
function run(row: RunRow, actions: ActionRow[]) {
  // Campaign deletion keeps the run but redacts its saved definition snapshot to '{}' (CAMP-011).
  const snapshot = JSON.parse(row.definitionJson ?? '{}') as { definition?: { actions_json: string }, subjectIds?: string[] }
  const saved = snapshot.definition ? JSON.parse(snapshot.definition.actions_json) as { command: string }[] : []
  const { definitionJson: _snapshot, eventName: _name, eventVersion: _version, triggerKey: _key, ...fields } = row
  return {
    ...fields, trigger: trigger(row), subjectIds: snapshot.subjectIds ?? [], state: shownState(row.state, row.heldUntil),
    queuedAt: iso(row.queuedAt), startedAt: iso(row.startedAt), finishedAt: iso(row.finishedAt),
    actions: actions.map(action => ({ position: action.position, command: saved[action.position]?.command ?? null, state: action.state,
      result: action.resultJson === null ? null : JSON.parse(action.resultJson) as unknown, errorCode: action.errorCode, errorMessage: action.errorMessage,
      startedAt: iso(action.startedAt), finishedAt: iso(action.finishedAt) })),
  }
}

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

  /** The paging key of every retained run: queued time, then run ID. */
  runKeys(automationId?: string) {
    return queryAll<{ id: string, queuedAt: number }>(database, `SELECT id, queued_at AS queuedAt FROM automation_runs r WHERE ${launchRun('r')}
      ${automationId ? 'AND automation_id = ?' : ''}`, automationId ? [automationId] : [])
  },

  /** The given runs, in that order, each with its trigger and every action in position order. */
  async runs(ids: string[]) {
    if (!ids.length) return []
    const list = JSON.stringify(ids)
    const [rows, actions] = await Promise.all([
      queryAll<RunRow>(database, `
        SELECT r.id, r.automation_id AS automationId, r.version, r.definition_version AS definitionVersion, r.subject_id AS subjectId, r.state,
          r.queued_at AS queuedAt, r.started_at AS startedAt, r.finished_at AS finishedAt, r.affected_count AS affectedCount,
          r.error_code AS errorCode, r.error_message AS errorMessage, ${heldUntil('r')} AS heldUntil, r.trigger_key AS triggerKey,
          r.retry_of AS retryOf, r.definition_json AS definitionJson, e.name AS eventName, e.version AS eventVersion
        FROM automation_runs r LEFT JOIN admission_events e ON e.id = r.trigger_key WHERE r.id IN (SELECT value FROM json_each(?))
      `, [list]),
      queryAll<ActionRow>(database, `
        SELECT run_id AS runId, position, state, result_json AS resultJson, error_code AS errorCode, error_message AS errorMessage,
          started_at AS startedAt, finished_at AS finishedAt FROM launch_automation_actions
        WHERE run_id IN (SELECT value FROM json_each(?)) ORDER BY run_id, position
      `, [list]),
    ])
    const byId = new Map(rows.map(row => [row.id, row]))
    return ids.flatMap(id => { const row = byId.get(id); return row ? [run(row, actions.filter(action => action.runId === id))] : [] })
  },

  /** The newest run of each automation by queued time, then run ID. */
  async latestRuns() {
    const rows = await queryAll<{ automationId: string, state: string, queuedAt: number, startedAt: number | null, finishedAt: number | null, errorCode: string | null, errorMessage: string | null, heldUntil: string | null }>(database, `
      SELECT d.id AS automationId, r.state, r.queued_at AS queuedAt, r.started_at AS startedAt, r.finished_at AS finishedAt,
        r.error_code AS errorCode, r.error_message AS errorMessage, ${heldUntil('r')} AS heldUntil
      FROM automations d JOIN automation_runs r ON r.id = (SELECT x.id FROM automation_runs x WHERE x.automation_id = d.id ORDER BY x.queued_at DESC, x.id DESC LIMIT 1)
      WHERE ${launchRun('r')}
    `)
    return rows.map(row => ({ ...row, state: shownState(row.state, row.heldUntil), queuedAt: iso(row.queuedAt), startedAt: iso(row.startedAt), finishedAt: iso(row.finishedAt) }))
  },

  /** Finished and successful runs of each automation that finished after `from`, up to and including `to`. */
  finished(from: number, to: number) {
    return queryAll<{ automationId: string, finished: number, succeeded: number }>(database, `
      SELECT automation_id AS automationId, COUNT(*) AS finished, SUM(state = 'Succeeded') AS succeeded FROM automation_runs
      WHERE finished_at > ? AND finished_at <= ? AND state IN (${finishedStates.map(() => '?').join(',')}) AND ${launchRun('automation_runs')} GROUP BY automation_id
    `, [from, to, ...finishedStates])
  },
})
