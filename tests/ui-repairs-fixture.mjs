import './helpers/typescript-loader.mjs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import { installManualRepairMandate } from './repair-case-fixture.mjs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
const { setupRepairs } = await import('../src/apps/repairs/setup.server.ts')
const { repairDescriptors } = await import('../src/apps/repairs/descriptors.ts')
const { REPAIRS_APP_ID, REPAIRS_RELEASE_ID, REPAIR_MODEL, REPAIR_ENTITIES, repairFieldId } = await import('../src/apps/repairs/model.ts')
const { repairActionSchemas } = await import('../src/apps/repairs/contracts.ts')
const { createUlid } = await import('../src/core/shared/ids.ts')
export async function installUiRepairsFixture(directory, ownerId) {
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response(null,{status:404})}}', d1Databases: { DB: '00000000-0000-0000-0000-000000000000' }, resourcePersistencePath: path.join(directory, 'v3') }))
  try {
    const db = await runtime.getD1Database('DB'), now = new Date().toISOString()
    await setupRepairs(db, { managerId: ownerId, releaseId: REPAIRS_RELEASE_ID, now })
    const policyId = createUlid()
    const actions = [...Object.keys(repairActionSchemas), 'upload.begin', 'upload.complete', 'source.capture', 'member.read', 'record.read', 'case.pause', 'case.takeover', 'case.resume', 'case.cancel']
    const rules = repairDescriptors.map(descriptor => ({ id: createUlid(), principals: [{ id: ownerId, kind: 'human' }], entityId: descriptor.schema.id, rows: { kind: 'all', conditions: [] }, readableFields: descriptor.schema.fields.map(field => field.id), writableFields: descriptor.schema.fields.map(field => field.id), actions, effect: 'allow', purposes: ['read'] }))
    await db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,created_at,updated_at,version) VALUES(?,?,?,?,?,?,1)').bind(policyId, REPAIRS_APP_ID, 'Isolated UI repair fixture role', JSON.stringify(rules), Date.now(), Date.now()).run()
    await db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,0,'active',1)").bind(ownerId, REPAIRS_APP_ID, policyId).run()
    async function insert(entity, values) {
      const id = createUlid(), data = { id, version: 1, created_at: now, updated_at: now, lifecycle: 'active', schema_version: 1, ...values }
      await db.prepare(`INSERT INTO ${REPAIR_MODEL[entity].table}(${Object.keys(data).join(',')}) VALUES(${Object.keys(data).map(() => '?').join(',')})`).bind(...Object.values(data)).run()
      return id
    }
    const storeId = await insert('stores', { name: 'UI test store', location: 'Brisbane', contact_id: ownerId, availability: '09:00–17:00', active: 1 })
    const assetId = await insert('assets', { name: 'UI test cold room', store_id: storeId, serial: 'UI-COLD-ONE', trade: 'refrigeration', active: 1 })
    await insert('staff', { store_id: storeId, principal_id: ownerId, active: 1 })
    const contractorId=await insert('contractors',{name:'UI test licensed refrigeration',payee_id:'SYNTHETIC-UI-SUPPLIER',email:'synthetic@example.invalid',active:1})
    for(const kind of ['licence','insurance']){
      const sourceId=createUlid(),content=`Synthetic UI fixture ${kind}; no real credential or provider.`,digest=createHash('sha256').update(content).digest('hex')
      await db.prepare('INSERT INTO evidence_sources(id,app_id,entity_id,record_id,field_ids,kind,current_version,created_at) VALUES(?,?,?,?,?,?,1,?)').bind(sourceId,REPAIRS_APP_ID,REPAIR_ENTITIES.stores,storeId,JSON.stringify([repairFieldId('stores','repair_evidence')]),'inspection',now).run()
      await db.prepare('INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) VALUES(?,?,1,?,?,?,?)').bind(createUlid(),sourceId,digest,content,'[]',now).run()
      await insert('credentials',{contractor_id:contractorId,kind,trade:'refrigeration',location:'Brisbane',valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',source_id:sourceId,source_version:'1',active:1})
    }
    const mandate=await installManualRepairMandate(db,{id:createUlid(),appId:REPAIRS_APP_ID,entityId:REPAIR_ENTITIES.workOrders,ownerId,now})
    return { storeId, assetId, mandateId:mandate.id }
  } finally { await runtime.dispose() }
}
