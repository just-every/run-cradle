import type { Principal, RequestContext } from './ports'
import type { SqlPredicate } from '../admission/ports'
import type { PreparedBy } from '../../../vendor/base/modules/agent-door/types'

export interface AgentAttribution extends PreparedBy {
  operationId: string
  approvers: readonly { id: string; name: string }[]
}
// A door admission is an in-process capability, never a JSON principal field.
// Only the production door bridge attaches it after Base authenticates the caller.
const admissions = new WeakMap<Principal, { guards: SqlPredicate[]; actor: AgentAttribution }>()
export function admitAgentPrincipal(principal: Principal, guards: SqlPredicate[], actor: AgentAttribution): void {
  admissions.set(principal, { guards, actor })
}
export const agentPrincipalGuards = (principal: Principal) => admissions.get(principal)?.guards
export const agentAttribution = (ctx: RequestContext) => admissions.get(ctx.principal)?.actor
