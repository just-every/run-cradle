import { trustedPredicate } from '../admission/sql.server';
import type { ExecutionDependencies } from './ports';
import type { RequestContext } from '../authority/ports';

type Binding = Parameters<ExecutionDependencies['settlement']>[4];

/** Released capacity can only be corrected by evidence about the original attempt. */
export async function releasedSettlementEvidence(db: D1Database, ctx: RequestContext, binding: Binding) {
 const evidence = binding.humanEvidence ?? binding.readback;
 if (!evidence?.previousReceiptId) return null;
 const human = !!binding.humanEvidence;
 if (human && (ctx.principal.kind !== 'human' || !ctx.principal.sessionId || ctx.principal.credentialId))
  throw new Error('Released human settlement requires a current human session.');
 const history = `FROM execution_attempts a JOIN execution_receipts r ON r.attempt_id=a.id
  WHERE a.id=? AND a.receipt_id=?
  AND ${human ? "a.state='unknown' AND EXISTS(SELECT 1 FROM execution_receipts current WHERE current.id=a.receipt_id AND current.attempt_id=a.id AND current.status='unknown')" : "a.state IN ('refused','unknown','partial','dispatching')"}
  AND a.first_possible_effect_at IS NOT NULL AND r.status='refused'
  AND (r.method IS NULL OR r.method='readback')
  AND NOT EXISTS(SELECT 1 FROM execution_receipts h WHERE h.attempt_id=a.id AND h.method='human_evidence')`;
 const values = [binding.attemptId, evidence.previousReceiptId];
 const release = await db.prepare(`SELECT r.id ${history} ORDER BY r.observed_at,r.id LIMIT 1`).bind(...values).first<{id:string}>();
 if (!release) return null;
 return {
  context: {receiptId:evidence.receiptId, previousReceiptId:evidence.previousReceiptId, releaseReceiptId:release.id},
  guard: trustedPredicate(`EXISTS(SELECT 1 ${history} AND r.id=?)`, [...values, release.id]),
 };
}
