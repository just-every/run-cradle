import type { View } from './contracts'
import type { DescriptorRegistry } from './descriptors.server'
import type { PolicyPort, RequestContext } from '../authority/ports'
import type { SqlPredicate } from '../admission/ports'
import { AdmissionError } from '../admission/errors'
import { schemaGuard } from './change.server'
import { listLevelFields, validateListLevels } from './list-schema'

/** Redact display fields, but refuse hidden filter, sort and link dependencies rather than disclosing them. */
export async function checkedListLevels(ctx: RequestContext, view: Pick<View, 'appId' | 'entityId' | 'display' | 'listLevels'>, descriptors: DescriptorRegistry, policy: PolicyPort, reading = false): Promise<SqlPredicate[]> {
  const guards: SqlPredicate[] = []
  for (const level of view.listLevels ?? []) {
    const descriptor = descriptors.list(view.appId).find(descriptor => descriptor.schema.id === level.entityId)
    if (!descriptor) throw new AdmissionError('forbidden', 'List level references an unavailable table')
    const scope = await policy.scope(ctx, { appId: view.appId, entityId: level.entityId, purpose: 'read' })
    if (reading) level.fields = level.fields.filter(id => descriptor.fields.has(id) && scope.readableFieldIds.includes(id))
    if (listLevelFields(level).some(id => !descriptor.fields.has(id) || !scope.readableFieldIds.includes(id))) throw new AdmissionError('forbidden', 'List level references an unavailable field')
    guards.push(...scope.currentAuthorityGuards, schemaGuard(descriptor))
  }
  try { validateListLevels(view, entityId => descriptors.get(view.appId, entityId).schema.fields) }
  catch (error) { throw new AdmissionError('validation', (error as Error).message) }
  return guards
}
