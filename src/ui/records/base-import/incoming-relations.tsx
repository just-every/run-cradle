import type { EntitySchema, RecordDetail } from '../../../domains/records/contracts'
import { useResource } from '../../shared/api'
import { ResourceState } from '../../shared/presentation'
import { recordLabel } from '../record-label'
type Incoming = NonNullable<RecordDetail['incomingRelations']>[number]
function IncomingSection({ relation, appId }: { relation: Incoming; appId: string }) {
  const schema = useResource<EntitySchema>(`/api/v1/apps/${encodeURIComponent(appId)}/entities/${encodeURIComponent(relation.sourceEntityId)}`)
  return <section className="cr-section"><h2>{relation.label}</h2><p>Read-only incoming links. Edit the linked source record to change this relationship.</p><ResourceState resource={schema.resource} operation={`${relation.label} source schema`} retry={schema.refresh}>{source => <><div className="cr-actions">{relation.page.items.map(row => <a className="cr-record-chip" key={row.id} href={`/app/records/${appId}/${relation.sourceEntityId}/${row.id}`}>{recordLabel(row, source)}</a>)}</div>{relation.page.total.value > relation.page.items.length && <p>{relation.page.items.length} shown of {relation.page.total.value}{relation.page.total.kind === 'at_least' ? '+' : ''} incoming records. <a href={`/app/records/${appId}/${relation.sourceEntityId}`}>Open source table</a></p>}</>}</ResourceState></section>
}
export function IncomingRelations({ relations, appId }: { relations: RecordDetail['incomingRelations']; appId: string }) {
  return <>{relations?.filter(relation => relation.page.items.length > 0).map(relation => <IncomingSection key={relation.id} relation={relation} appId={appId} />)}</>
}
