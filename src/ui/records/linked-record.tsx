import { recordLabel } from './record-label'
import type { Ref } from '../../contracts/primitives'
import type { EntitySchema, RecordDetail } from '../../domains/records/contracts'
import { useResource } from '../shared/api'
import { UiIcon } from '../shared/ui-icon'
export function LinkedRecord({ reference }: { reference: Ref }) {
  const base = `/api/v1/apps/${reference.appId}/entities/${reference.entityId}`
  const schema = useResource<EntitySchema>(base)
  const detail = useResource<RecordDetail>(`${base}/records/${reference.recordId}`)
  const resources = [schema.resource, detail.resource]
  if (resources.some(resource => resource.state === 'loading')) return <span className="cr-muted" role="status" aria-busy="true">Reading linked record…</span>
  if (resources.some(resource => resource.state === 'forbidden' || resource.state === 'signed_out')) return <span className="cr-muted">Linked record access is restricted</span>
  if (resources.some(resource => resource.state === 'not_found')) return <span className="cr-muted">Linked record is unavailable</span>
  if (schema.resource.state !== 'ready' || detail.resource.state !== 'ready') return <span className="cr-error">Could not read linked record <button type="button" onClick={() => { schema.refresh(); detail.refresh() }}>Try again</button></span>
  const record = detail.resource.data.record
  return <a className="cr-record-chip" href={`/app/records/${reference.appId}/${reference.entityId}/${reference.recordId}`}><UiIcon name="link" size={13} />{recordLabel(record,schema.resource.data)}</a>
}
