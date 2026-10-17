import type { Principal } from '../../../domains/authority/ports'
import { AuthorityError } from '../../../domains/authority/errors'
import { createPolicyPort } from '../../../domains/authority/policy.server'
import { createDescriptorRegistry } from '../../../domains/records/descriptors.server'
import { createRecordEntityRegistry } from '../../../domains/records/policy.server'
import { launchDescriptors } from '../../../apps/launch/descriptors.server'
import { authorizeLaunchProjection } from '../../../apps/launch/projection-authority.server'

let launchEntities: ReturnType<typeof createRecordEntityRegistry> | undefined

/** A protected navigation hint, admitted by the same policy as the launch view. */
export async function launchInUse(db: D1Database, principal: Principal): Promise<boolean> {
  const policy = createPolicyPort(db, launchEntities ??= createRecordEntityRegistry(createDescriptorRegistry(launchDescriptors)))
  try {
    const recheck = await authorizeLaunchProjection(db, policy, { principal, requestId: principal.id, now: new Date().toISOString(), ingress: 'http' })
    const used = await db.prepare('SELECT 1 AS used FROM campaigns LIMIT 1').first()
    await recheck()
    return !!used
  } catch (error) {
    if (error instanceof AuthorityError && error.code === 'forbidden') return false
    throw error
  }
}
