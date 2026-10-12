import type { CellValue } from '../../contracts/primitives'
import type { EntitySchema, RecordDetail, RecordRow } from '../../domains/records/contracts'
import { useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'
import { CellDisplay } from './record-fields'
export function RecordConflict({ schema, original, proposed, onReviewed }: { schema: EntitySchema; original: RecordRow; proposed: Record<string, CellValue>; onReviewed: (current: RecordRow) => void }) {
  const latest = useResource<RecordDetail>(`/api/v1/apps/${schema.appId}/entities/${schema.id}/records/${original.id}`)
  return <section className="cr-notice"><h3>This record changed</h3><p>Review the current values against your edits before saving again.</p><ResourceState resource={latest.resource} operation="latest record" retry={latest.refresh}>{detail => <><div className="cr-table-wrap" tabIndex={0} role="region" aria-label="Current values and your edits"><table className="cr-table"><thead><tr><th>Field</th><th>Current value</th><th>Your edit</th></tr></thead><tbody>{schema.fields.filter(field => Object.hasOwn(proposed, field.id)).map(field => <tr key={field.id}><th>{field.label}</th><td><CellDisplay appId={schema.appId} field={field} cell={detail.record.fields[field.id]} /></td><td><CellDisplay appId={schema.appId} field={field} cell={{ state: 'value', value: proposed[field.id]! }} /></td></tr>)}</tbody></table></div><button type="button" className="cr-button cr-button--quiet" disabled={!detail.record.allowedActions.some(action => action.action === 'record.patch')} onClick={() => onReviewed(detail.record)}>I reviewed version {detail.record.version}; keep my edits</button></>}</ResourceState></section>
}
