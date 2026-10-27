import type { Principal } from '../../../domains/authority/ports'
import { and } from '../../../domains/admission/sql.server'
import { manualOwnerGuards } from '../../../domains/records/manual/authority.server'

/** A document hint only; proposal reads and adoption still enforce current authority. */
export async function isProposalReviewer(db: D1Database, principal: Principal): Promise<boolean> {
  if (principal.kind !== 'human' || !principal.sessionId) return false
  const check = and(...manualOwnerGuards({ principal, requestId: principal.id, now: new Date().toISOString(), ingress: 'http' }))
  return !!await db.prepare(`SELECT 1 WHERE ${check.sql}`).bind(...check.values).first()
}
