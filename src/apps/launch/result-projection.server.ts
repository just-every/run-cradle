import type { Json } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { LAUNCH_APP_ID, launchEntities } from './contracts'
import { launchFieldIds, type LaunchKind } from './descriptors.server'
import { toWire, type LaunchRow } from './storage.server'
import { launchFieldForColumn } from './write-fields.server'
import { ref, type ChangeSet, type LaunchContext } from './domain.server'

const identity = new Set(['id', 'version', 'created_at', 'updated_at'])

/** A command result returns a written row only through the caller's current read
 * fields; a column outside the field model needs every field. Replay and status
 * recheck the same fields. A refused read scope leaves the row's identity alone. */
export async function readableWire(context: LaunchContext, ctx: RequestContext, set: ChangeSet, kind: LaunchKind, row: LaunchRow): Promise<Record<string, Json>> {
 const readable: readonly string[] = await context.policy.scope(ctx, { appId: LAUNCH_APP_ID, entityId: launchEntities[kind], purpose: 'read' }).then(scope => scope.readableFieldIds, error => {
  if (error instanceof Error && 'code' in error && error.code === 'forbidden') return []
  throw error
 })
 const every = Object.values(launchFieldIds[kind]), complete = every.every(id => readable.includes(id)), fieldIds = new Set<string>()
 const visible = Object.fromEntries(Object.entries(row).filter(([column]) => {
  if (identity.has(column)) return true
  const field = launchFieldForColumn(kind, column)
  if (field ? !readable.includes(field) : !complete) return false
  for (const id of field ? [field] : every) fieldIds.add(id)
  return true
 })) as LaunchRow
 set.access.push({ ref: ref(kind, row.id), fieldIds: [...fieldIds] })
 return toWire(visible)
}
