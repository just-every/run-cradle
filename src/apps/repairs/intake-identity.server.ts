import type { CellValue, Ref } from '../../contracts/primitives'
import { AdmissionError } from '../../domains/admission/errors'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { REPAIRS_APP_ID, REPAIR_ENTITIES, repairFieldId, repairRef } from './model'
import type { RepairIntakeContext } from './context.server'
import { str } from './repository.server'

function selection(value: CellValue | undefined, entity: 'stores' | 'assets'): Ref | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value) || !('recordId' in value)
    || value.appId !== REPAIRS_APP_ID || value.entityId !== REPAIR_ENTITIES[entity]) {
    throw new AdmissionError('validation', `Choose a repair ${entity === 'stores' ? 'store' : 'asset'} reference`)
  }
  return value as Ref
}

/** Identity is current authorized data, never a guessed interpretation of a supplied ID. */
export async function intakeIdentity(c: RepairIntakeContext, values: Record<string, CellValue>) {
  const suppliedStore = selection(values[repairFieldId('intakes', 'store_id')], 'stores')
  const suppliedAsset = selection(values[repairFieldId('intakes', 'asset_id')], 'assets')
  const staff = await c.repo.list(c.ctx, 'staff', trustedPredicate('principal_id=? AND active=1', [c.ctx.principal.id]))
  const storeId = suppliedStore?.recordId ?? (staff.length === 1 ? str(staff[0]!, 'store_id') : null)
  const store = storeId ? await c.repo.load(c.ctx, 'stores', storeId) : null
  if (store && store.active !== 1) throw new AdmissionError('validation', 'Store is inactive')
  if (store) {
    if (suppliedStore) c.requireExpected('stores', store)
    else {
      c.guards.push(c.repo.version('stores', store))
      // A newly assigned second store invalidates an automatically chosen identity.
      c.guards.push(trustedPredicate('1=(SELECT COUNT(*) FROM repair_store_staff WHERE principal_id=? AND active=1)', [c.ctx.principal.id]))
    }
  }
  for (const row of staff) c.guards.push(c.repo.version('staff', row))
  const assets = store ? await c.repo.list(c.ctx, 'assets', trustedPredicate('store_id=? AND active=1', [store.id])) : []
  const selected = suppliedAsset ? await c.repo.load(c.ctx, 'assets', suppliedAsset.recordId) : assets.length === 1 ? assets[0] : null
  if (suppliedAsset && selected) {
    if (selected.active !== 1) throw new AdmissionError('validation', 'Asset is inactive')
    if (!store || selected.store_id !== store.id) throw new AdmissionError('validation', 'Asset and store disagree')
    c.requireExpected('assets', selected)
  }
  if (selected) {
    c.guards.push(c.repo.version('assets', selected))
    if (!suppliedAsset) c.guards.push(trustedPredicate('1=(SELECT COUNT(*) FROM repair_assets WHERE store_id=? AND active=1)', [store!.id]))
  }
  // Candidate names are returned only while the same authorized rows are still current.
  for (const asset of assets) {
    await c.repo.load(c.ctx, 'assets', asset.id, ['name'])
    c.guards.push(c.repo.version('assets', asset))
  }
  return { store, selected, candidates: assets.map(asset => ({ ref: repairRef('assets', asset.id), reasons: [str(asset, 'name')] })) }
}
