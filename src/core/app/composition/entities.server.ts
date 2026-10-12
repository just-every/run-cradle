import { executionPolicyEntities } from '../../../domains/execution/metadata.server'
import { STAGING_ENTITY, stagingPolicyEntity } from '../../../domains/evidence/staging.server'
import { sourceIntakePolicyEntity } from '../../../domains/construction/intake.server'
import { channelPolicyEntities } from '../../../domains/channels/setup.server'
import type { DescriptorRegistry } from '../../../domains/records/descriptors.server'
import type { EntityRegistry, PolicyEntity } from '../../../domains/authority/scope.server'
import { createRecordEntityRegistry } from '../../../domains/records/policy.server'
import { constructionPolicyEntities } from '../../../domains/construction/authority.server'
import { RECORD_SCHEMA_ENTITY_ID, RECORD_VIEW_ENTITY_ID, RECORD_FORM_ENTITY_ID } from '../../../domains/records/contracts'
import { EVIDENCE_SOURCE_ENTITY_ID } from '../../../domains/evidence/identity'
import { AUTHORITY_ENTITY_IDS } from '../../../domains/authority/contracts'

const metadata: readonly PolicyEntity[] = [
  { id: AUTHORITY_ENTITY_IDS.member, table: 'authority_memberships', idColumn: 'principal_id', appColumn: 'app_id', fields: [] },
  { id: AUTHORITY_ENTITY_IDS.grant, table: 'authority_grants', idColumn: 'id', appColumn: 'app_id', fields: [] },
  { id: AUTHORITY_ENTITY_IDS.policy, table: 'authority_policies', idColumn: 'id', appColumn: 'app_id', fields: [] },
  { id: RECORD_SCHEMA_ENTITY_ID, table: 'record_schemas', idColumn: 'id', appColumn: 'app_id', fields: [] },
  { id: RECORD_VIEW_ENTITY_ID, table: 'record_views', idColumn: 'id', appColumn: 'app_id', fields: [] },
  { id: RECORD_FORM_ENTITY_ID, table: 'record_forms', idColumn: 'id', appColumn: 'app_id', fields: [] },
  { id: EVIDENCE_SOURCE_ENTITY_ID, table: 'evidence_sources', idColumn: 'id', appColumn: 'app_id', fields: [] },
  ...constructionPolicyEntities,
  ...channelPolicyEntities,
  ...executionPolicyEntities,
  sourceIntakePolicyEntity,
]
/** Metadata registration describes storage; membership and exact rules still confer authority. */
export function createApplicationEntityRegistry(descriptors: DescriptorRegistry): EntityRegistry {
  const records = createRecordEntityRegistry(descriptors)
  return { get(appId, entityId) {
    if (entityId === STAGING_ENTITY && descriptors.list(appId).some(d => d.schema.id === entityId)) return stagingPolicyEntity(appId)
    const stored = metadata.find(entity => entity.id === entityId)
    if (stored) return stored
    if (!descriptors.list(appId).some(d => d.schema.id === entityId)) return undefined
    return records.get(appId, entityId)
  } }
}
