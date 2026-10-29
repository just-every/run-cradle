import { AuthorityError } from '../authority/errors'
import type { Effects } from './changes.server'
import { trustedPredicate } from '../admission/sql.server'

// Base retains summaries, outcomes and decisions without a client-scoped erasure
// contract. Until it supplies that contract, native erasure must fail closed.
const retained = `EXISTS(SELECT 1 FROM agent_door_calls)
 OR EXISTS(SELECT 1 FROM agent_door_approvals)
 OR EXISTS(SELECT 1 FROM agent_door_reviews)
 OR EXISTS(SELECT 1 FROM agent_door_events)
 OR EXISTS(SELECT 1 FROM agent_door_audit)`
export async function requireAgentCustodyQuiescent(db: D1Database, change: Effects) {
  if (await db.prepare(`SELECT 1 WHERE ${retained}`).first()) throw new AuthorityError('version_conflict',
    'Erasure requires resolving retained agent decisions, outcomes and pending approvals first; no data was erased.', 409)
  change.guards.push(trustedPredicate(`NOT (${retained})`))
}
