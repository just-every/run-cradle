import { readFile } from 'node:fs/promises'
import { harness, base, realAuthority } from './repairs-harness.mjs'
import { installManualRepairMandate } from './repair-case-fixture.mjs'
export async function fixture({ realEvidence = false } = {}) {
  const h = await harness(), b = await base(h), auth = await realAuthority(h), r = h.r
  await h.db.exec((await readFile('migrations/core/0800_continuing_operations.sql', 'utf8')).replace(/\n/g, ' '))
  await h.db.prepare('UPDATE evidence_sources SET entity_id=?,record_id=?,field_ids=? WHERE id=?').bind(r.REPAIR_ENTITIES.stores,b.store,JSON.stringify([r.repairFieldId('stores','repair_evidence')]),b.ev.sourceId).run()
  const descriptors = r.createDescriptorRegistry(r.repairDescriptors)
  if (realEvidence) {
    h.d.evidence.source = r.createSourceService({db:h.db,policy:h.d.policy,admission:h.admission,access:{checkReference:r.createReferenceAccess(h.db,h.d.policy,r.createApplicationEntityRegistry(descriptors))}}).source
    await h.db.prepare('INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) VALUES(?,?,1,?,?,?,?)').bind(r.createUlid(),b.ev.sourceId,'synthetic-credential-sha','Synthetic private credential source','[]',h.ctx.now).run()
  }
  const operations = new r.OperationsRepository({ db: h.db, policy: h.d.policy, environment: { project: r.createOperationsProjection({ db: h.db, policy: h.d.policy, descriptors, evidence: h.d.evidence }) } })
  const d = { db: h.db, policy: h.d.policy, evidence: h.d.evidence, cases: r.createRepairCaseAdapter(operations, h.d.evidence) }
  const replay = r.createReplayAccess(h.db, h.d.policy, r.createApplicationEntityRegistry(descriptors))
  const admission = r.createAdmissionService(h.db, { authorizeReplay: replay.authorizeReplay })
  const registry = r.createCommandRegistry(admission)
  r.registerRepairIntakeCommands(registry, d); r.registerRepairOpenCommand(registry, d)
  const reads = r.createRepairCaseReads(d, operations), http = r.createRepairCaseHttp(reads, async () => h.ctx)
  const m = await installManualRepairMandate(h.db, { id: r.createUlid(), appId: r.REPAIRS_APP_ID, entityId: r.REPAIR_ENTITIES.workOrders, ownerId: h.ctx.principal.id, now: h.ctx.now })
  async function report(sourceId) {
    const result = await registry.get('intake.submit').execute(h.ctx, await h.envelope({ appId: r.REPAIRS_APP_ID, formId: r.REPAIRS_FORM_ID, values: {}, text: 'Cooling failed '+r.createUlid(), fileIds: [], ...(sourceId ? { sourceId } : {}) }))
    return result.result.value.id
  }
  async function command(id, overrides = {}) {
    return h.envelope({ intakeId: id, asset: await h.ref('assets', b.asset), store: await h.ref('stores', b.store), sourceVersions:await Promise.all([...(m.sourceIds??[]),...JSON.parse((await h.db.prepare('SELECT source_ids FROM repair_intakes WHERE id=?').bind(id).first()).source_ids)].map(async id=>({id,version:(await h.db.prepare('SELECT current_version FROM evidence_sources WHERE id=?').bind(id).first()).current_version}))), mandate: { id: m.id, version: m.version }, ...overrides }, [h.ref('intakes', id)])
  }
  const counts = async () => Object.fromEntries(await Promise.all(['operation_cases','repair_jobs','repair_work_orders','operation_wakes'].map(async table => [table, (await h.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n])))
  return { ...h, b, auth, r, d, operations, admission, registry, reads, http, m, report, command, counts }
}
