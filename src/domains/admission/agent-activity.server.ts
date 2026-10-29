import { agentAttribution } from '../authority/agent-admission.server'
import type { RequestContext } from '../authority/ports'
import type { SqlMutation } from './ports'
import { registerTable } from './sql.server'
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
