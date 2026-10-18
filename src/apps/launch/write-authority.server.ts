import { launchCascadeWrites } from './write-cascades.server'
import type { CommandInput, RevisionRef } from '../../contracts/primitives'
import type { SqlMutation, SqlScalar } from '../../domains/admission/ports'
import type { RequestContext } from '../../domains/authority/ports'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { AdmissionError } from '../../domains/admission/errors'
import { LAUNCH_APP_ID, launchEntities } from './contracts'
import { launchColumns, launchFieldIds, launchTables, type LaunchKind } from './descriptors.server'
import { launchAttributionFields } from './write-fields.server'
import { isLaunchMetadataColumn } from './storage.server'
import type { ChangeSet, LaunchContext } from './domain.server'

type Row = Record<string, SqlScalar>
type Writes = { kind: LaunchKind; action: string; fields: Set<string>; expected: Map<string, RevisionRef>; proposed: Map<string, Row> }
const bookkeeping = new Set(['id', 'version', 'created_at', 'updated_at', 'created_by_id', 'definition_version', 'shipped_key'])
const fieldForColumn = (kind: LaunchKind, column: string): string | undefined => {
 const name = Object.entries(launchColumns[kind]).find(([, value]) => value === column)?.[0] ?? launchAttributionFields[kind]?.[column]
 return name ? launchFieldIds[kind][name] : undefined
}
// A composite command retains its own action check and also requires the native
// action of each secondary entity it actually changes. No persisted policy is
// expanded: these are the existing actions of the retained launch application.
function effectAction(kind: LaunchKind, mutationKind: SqlMutation['kind'], action: string, target: LaunchKind) {
 if (kind === target || /^launch\.(bulk|samples)\./.test(action) || action.startsWith('import.')) return action
 if (kind === 'readiness') return 'launch.readiness.acknowledge'
 if (kind === 'automation') return 'launch.automation.disable'
 const operation = mutationKind === 'insert' ? 'create' : mutationKind === 'delete' ? 'delete' : 'patch'
 return `launch.${kind === 'customField' ? 'custom-field' : kind}.${operation}`
}

/** Authorize the final writes and cascade effects with existing field IDs. An
 * unmodelled effect requires every existing writable field of its entity; an
 * empty field set never supplies vacuous write authority. Reads and persisted
 * policy bytes are unchanged. All permits remain in the same admission batch. */
export async function authorizeLaunchWrites(context: LaunchContext, ctx: RequestContext, input: CommandInput<unknown>, action: string, hash: string, set: ChangeSet, target: LaunchKind) {
 const cascade = await launchCascadeWrites(context.db, set.mutations)
 set.guards.push(...cascade.guards)
 const writes = new Map<string, Writes>()
 const group = (kind: LaunchKind, effect = action) => {
  const key = `${kind}:${effect}`
  let value = writes.get(key)
  if (!value) { value = { kind, action: effect, fields: new Set(), expected: new Map(), proposed: new Map() }; writes.set(key, value) }
  return value
 }
 const primary = group(target)
 const allFields = (value: Writes) => Object.values(launchFieldIds[value.kind]).forEach(field => value.fields.add(field))
 const rowsFor = async (mutation: SqlMutation): Promise<Row[]> => mutation.kind === 'insert' ? [mutation.row] : (await context.db.prepare(`SELECT * FROM "${mutation.table.tableId}" WHERE ${mutation.where.sql}`).bind(...mutation.where.values).all<Row>()).results
 const subject = async (value: Writes, id: string) => {
  const { kind } = value
  if (value.proposed.has(id) || value.expected.has(id)) return
  const row = await context.db.prepare(`SELECT id,version FROM "${launchTables[kind]}" WHERE id=?`).bind(id).first<{ id: string; version: number }>()
  if (!row) throw new AdmissionError('not_found', `Affected ${kind} was not found`)
  value.expected.set(id, { ref: { appId: LAUNCH_APP_ID, entityId: launchEntities[kind], recordId: id }, version: row.version })
  set.guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM "${launchTables[kind]}" WHERE id=? AND version=?)`, [id, row.version]))
 }
 // Collect native records before sidecars so a create binds to the proposed row.
 for (const mutation of cascade.writes) {
  const kind = (Object.entries(launchTables).find(([, table]) => table === mutation.table.tableId)?.[0]) as LaunchKind | undefined
  if (!kind) continue
  const rows = await rowsFor(mutation)
  if (!rows.length) continue
  const value = group(kind, effectAction(kind, mutation.kind, action, target))
  for (const row of rows) {
   const id = String(row.id)
   if (mutation.kind === 'insert') value.proposed.set(id, row)
   else await subject(value, id)
   if (mutation.kind === 'delete' || mutation.kind === 'replaceText') { allFields(value); continue }
   const next = mutation.kind === 'insert' ? row : mutation.set
   for (const [column, cell] of Object.entries(next)) {
    if (bookkeeping.has(column) || isLaunchMetadataColumn(column) || mutation.kind === 'update' && cell === row[column]) continue
    const field = fieldForColumn(kind, column)
    if (field) value.fields.add(field)
    else allFields(value)
   }
  }
 }
 for (const mutation of cascade.writes) {
  if (mutation.table.tableId === 'launch_analyses') {
   for (const row of await rowsFor(mutation)) for (const [kind, column] of [['campaign', 'subject_id'], ['lens', 'lens_id']] as const) {
    if (row[column] == null) continue
    const value = group(kind, action)
    await subject(value, String(row[column])); allFields(value)
   }
   continue
  }
  const sidecar = ({ automation_runs: { kind: 'automation', key: 'automation_id' }, campaign_tags: { kind: 'campaign', key: 'campaign_id', field: launchFieldIds.campaign.tags! }, launch_custom_values: { kind: 'campaign', key: 'campaign_id' }, milestone_dependencies: { kind: 'milestone', key: 'milestone_id' } } as const)[mutation.table.tableId as 'automation_runs' | 'campaign_tags' | 'launch_custom_values' | 'milestone_dependencies']
  if (!sidecar) continue
  // Sidecars modify the owning entity, even if their physical row is inserted
  // or deleted. A cascade still checks the exact affected owner's predicate.
  const effect = effectAction(sidecar.kind, 'update', action, target)
  const rows = await rowsFor(mutation)
  if (!rows.length) continue
  const value = group(sidecar.kind, effect)
  for (const row of rows) {
   const id = String(row[sidecar.key]), proposed = [...writes.values()].find(other => other.kind === sidecar.kind && other.proposed.has(id))?.proposed.get(id)
   if (proposed) value.proposed.set(id, proposed)
   else await subject(value, id)
   if ('field' in sidecar && sidecar.field) value.fields.add(sidecar.field)
   else allFields(value)
  }
 }
 const permits = []
 for (const value of writes.values()) {
  if (!value.fields.size) allFields(value)
  const expected = [...new Map([...input.expected, ...value.expected.values()].map(revision => [revision.ref.entityId + ':' + revision.ref.recordId, revision])).values()]
  permits.push(await context.policy.authorize(ctx, { appId: LAUNCH_APP_ID, action: value.action, commandId: input.commandId, inputHash: hash, expected, cost: [], targetEntityId: launchEntities[value.kind], fieldIds: [...value.fields], proposedRows: [...value.proposed.values()].map(row => ({ entityId: launchEntities[value.kind], row })) }))
 }
 const primaryPermit = permits[[...writes.values()].indexOf(primary)]!
 return { ...primaryPermit, guards: permits.flatMap(permit => permit.guards), reservationMutations: permits.flatMap(permit => permit.reservationMutations), reservationIds: permits.flatMap(permit => permit.reservationIds) }
}
