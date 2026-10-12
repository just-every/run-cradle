import type { PolicyPort, RequestContext } from '../../domains/authority/ports'
import { denied } from '../../domains/authority/errors'
import { and } from '../../domains/admission/sql.server'
import { launchDescriptors } from './descriptors.server'
import { LAUNCH_APP_ID } from './contracts'

/** The retained views join records, comments, history, lenses and derived totals.
 * They are an indivisible full-launch projection. Restricted policies use the
 * canonical records surface, which masks fields and evaluates row predicates.
 * This checks actual current policy, never the historical membership's legacy bit.
 */
export async function authorizeLaunchProjection(db: D1Database, policy: PolicyPort, ctx: RequestContext) {
  const scopes = await Promise.all(launchDescriptors.map(descriptor => policy.scope(ctx, {
    appId: LAUNCH_APP_ID, entityId: descriptor.schema.id, purpose: 'read',
  })))
  for (const [index, scope] of scopes.entries()) {
    if (!scope.unrestrictedRows || launchDescriptors[index]!.schema.fields.some(field => !scope.readableFieldIds.includes(field.id))) {
      return denied('This full launch view requires access to all launch records and fields. Open Records for your permitted fields and rows.')
    }
  }
  // The entities share one current app policy and session. Keep one copy of
  // each revision predicate so this remains inside D1's bind-parameter limit.
  const guards = new Map(scopes.flatMap(scope => scope.currentAuthorityGuards.map(guard => [JSON.stringify(guard), guard] as const)))
  const guard = and(...guards.values())
  return async () => {
    if (!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()) return denied()
  }
}
