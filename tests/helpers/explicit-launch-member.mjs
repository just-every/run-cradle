// Proposed test-only explicit custody setup; UNAPPLIED.
// The test creates a synthetic original launch operator and deliberately maps
// that operator to the retained launch surface. Runtime setup stays scope-safe.
export async function mapReviewedLaunchOperator({ r, db, actor }, memberId) {
  const now = new Date().toISOString(), policyId = r.createUlid()
  const rules = r.launchDescriptors.map(descriptor => {
    const surface = r.legacyLaunchSurface(descriptor.schema.id)
    return { id: r.createUlid(), principals: [{ kind: 'human', id: memberId }], entityId: descriptor.schema.id, rows: { kind: 'all', conditions: [] }, readableFields: surface.fields, writableFields: surface.fields, actions: surface.actions, effect: 'allow', purposes: surface.purposes }
  })
  rules.push(...r.channelLegacyPolicyRules(memberId), ...r.legacyImportStagingRules(memberId, r.createUlid(), r.createUlid()))
  await r.initializeLegacyAuthority(db, { initialOwnerId: actor, launchAppId: r.LAUNCH_APP_ID, policies: [{ id: policyId, appId: r.LAUNCH_APP_ID, name: 'Reviewed synthetic original launch rights', rules, version: 1, createdAt: now, updatedAt: now }], memberships: [{ memberId, policyId }] })
}
