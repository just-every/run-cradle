import type { AuthorizationRequest, RequestContext } from '../../domains/authority/ports'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { AdmissionError } from '../../domains/admission/errors'
import { LAUNCH_APP_ID, launchEntities } from './contracts'
import { launchFieldIds } from './descriptors.server'
import type { LegacyAutomationRun } from './automation-runtime.server'
import { emptyChange, operator } from './domain.server'
import { legacyRecipientGuards } from '../../domains/channels/recipient.server'

// The shipped risk capability includes only its deterministic linked decision,
// bound to the same risk and campaign. It is not general decision-create power.
export async function retainedRiskWriteGuards(db: D1Database, ctx: RequestContext, run: LegacyAutomationRun, request: AuthorizationRequest) {
 const deny = (): never => { throw new AdmissionError('forbidden', 'Retained automation cannot acquire another business or provider action') }
 const decision = request.action === 'launch.decision.create' && request.targetEntityId === launchEntities.decision
 if (request.appId !== LAUNCH_APP_ID || !(request.action === 'launch.risk.escalate' && request.targetEntityId === launchEntities.risk || decision) || run.definition.shipped_key !== 'critical-risk' || request.cost.length || request.expected.length !== 1 || request.expected[0]!.ref.appId !== LAUNCH_APP_ID || request.expected[0]!.ref.entityId !== launchEntities.risk || !run.subjectIds.includes(request.expected[0]!.ref.recordId)) return deny()
 if (!request.fieldIds?.length || request.fieldIds.some(id => !Object.values(launchFieldIds[decision ? 'decision' : 'risk']).includes(id))) return deny()
 const subject = request.expected[0]!
 const risk = await db.prepare("SELECT r.*,c.owner_id AS campaign_owner,c.version AS campaign_version FROM risks r JOIN campaigns c ON c.id=r.campaign_id WHERE r.id=? AND r.version=? AND r.severity='Critical' AND r.state NOT IN ('Resolved','Escalated') AND c.archived_at IS NULL").bind(subject.ref.recordId, subject.version).first<Record<string, string | number | null>>()
 if (!risk) throw new AdmissionError('forbidden', 'Risk context no longer permits the shipped escalation')
 // Assignment requires the actual owner's current operator and launch scope,
 // even when notification delivery is suppressed. Reuse the recipient policy
 // predicates without creating a login, grant, or notification side effect.
 const owner = emptyChange()
 await operator(db, owner, risk.campaign_owner)
 const access = await legacyRecipientGuards(db, { kind: 'critical-risk-escalated', operatorId: String(risk.campaign_owner), campaignId: String(risk.campaign_id), subjectId: String(risk.id), eventId: run.triggerKey }, ctx.now)
 if (!access) throw new AdmissionError('forbidden', 'Campaign owner no longer has access to this risk')
 if (decision) {
  const row = request.proposedRows?.[0]?.row, now = Date.parse(ctx.now)
  const bound = { created_at: now, updated_at: now, version: 1, campaign_id: risk.campaign_id, risk_id: risk.id, requester_id: risk.owner_id, assignee_id: risk.campaign_owner, title: `Resolve Critical risk: ${risk.title}`, priority: 'Critical', due_at: now + 86400000, recommendation: 'Critical severity automation', impact: String(risk.signal), state: 'Awaiting approval' }
  if (request.proposedRows?.length !== 1 || request.proposedRows[0]!.entityId !== launchEntities.decision || !row || typeof row.id !== 'string' || Object.keys(row).length !== Object.keys(bound).length + 1 || Object.entries(bound).some(([key, value]) => row[key] !== value)) return deny()
 } else if (request.proposedRows?.length) return deny()
 return [...owner.guards, ...access, trustedPredicate("EXISTS(SELECT 1 FROM risks r JOIN campaigns c ON c.id=r.campaign_id WHERE r.id=? AND r.version=? AND r.severity='Critical' AND r.state NOT IN ('Resolved','Escalated') AND c.archived_at IS NULL AND c.version=? AND c.owner_id=?)", [subject.ref.recordId, subject.version, Number(risk.campaign_version), String(risk.campaign_owner)])]
}
