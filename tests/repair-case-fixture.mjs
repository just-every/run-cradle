/** Synthetic manual mandate only. Never production setup or implicit authority activation. */
export async function installManualRepairMandate(db, { id, appId, entityId, ownerId, now, sourceIds = [] }) {
  const value = { id, version: 1, createdAt: now, updatedAt: now, appId, objective: 'Review the reported repair with the store', eligibleEntities: [entityId], sourceIds,
    constraints: ['No contractor contact, booking, spending or background action is authorized.'], actionIds: [], grants: {}, state: 'active', deadline: null,
    budget: { limit: [], reserved: [], consumed: [], modelCallsRemaining: 0, timeRemainingSeconds: 0, accountingAsOf: now },
    verification: { verifierId: 'repairs.manual-review', version: 1, requiredEvidence: ['physical_acceptance'], target: {} }, stallAfterMinutes: 30, reviewCadenceMinutes: 60,
    escalateTo: [ownerId], impact: { summary: 'A human owns the next repair review; no external commitment.', spend: [], commitments: [], affected: [], accessChanges: [], egress: [], uncertainty: ['Repair outcome has not been verified.'] }, unanswered: [] }
  await db.prepare('INSERT INTO operation_mandates(id,app_id,version,data_json) VALUES(?,?,?,?)').bind(id, appId, value.version, JSON.stringify(value)).run()
  return value
}
