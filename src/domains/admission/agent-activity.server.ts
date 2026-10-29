import { agentAttribution } from '../authority/agent-admission.server'
import type { RequestContext } from '../authority/ports'
import type { SqlMutation } from './ports'
import { registerTable } from './sql.server'
import { canonical } from './canonical'
import type { Ref } from '../../contracts/primitives'
const activity = registerTable('cradle_agent_activity', ['command_id', 'agent_id', 'agent_name', 'sponsor_id', 'sponsor_name', 'label', 'operation_id', 'approvers_json', 'created_at'])
/** Included in the native command's own atomic admission, never an after-effect log. */
export function nativeAgentActivity(ctx: RequestContext, commandId: string): SqlMutation[] {
  const actor = agentAttribution(ctx)
  return actor ? [{ kind: 'insert', table: activity, row: {
    command_id: commandId, agent_id: actor.agent.id, agent_name: actor.agent.name,
    sponsor_id: actor.for.id, sponsor_name: actor.for.name, label: actor.label,
    operation_id: actor.operationId, approvers_json: JSON.stringify(actor.approvers), created_at: ctx.now,
  } }] : []
}

export interface NativeAgentAttribution {
  agent: { id: string; name: string }; for: { id: string; name: string }
  label: string; approvers: { id: string; name: string }[]
}
/** Call only after the native record reader has authorized its subject. */
export async function readNativeAgentAttribution(db: D1Database, ref: Ref): Promise<NativeAgentAttribution | null> {
  const row = await db.prepare(`SELECT g.* FROM admission_audit a
    JOIN cradle_agent_activity g ON g.command_id=a.command_id
    WHERE a.app_id=? AND a.subject_json=? ORDER BY a.created_at DESC,a.id DESC LIMIT 1`)
    .bind(ref.appId, canonical(ref)).first<{ agent_id: string; agent_name: string; sponsor_id: string; sponsor_name: string; label: string; approvers_json: string }>()
  return row ? { agent: { id: row.agent_id, name: row.agent_name }, for: { id: row.sponsor_id, name: row.sponsor_name },
    label: row.label, approvers: JSON.parse(row.approvers_json) } : null
}
