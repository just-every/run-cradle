import { useEffect, useState } from 'react'
import type { ImportPreviewPage } from '../../domains/portability/contracts'
import type { EntitySchema } from '../../domains/records/contracts'
import { useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'
import { CellDisplay } from './record-fields'
export function ImportPreviewRows({ id, schema, onValidity }: { id: string; schema: EntitySchema; onValidity: (valid: boolean) => void }) {
  const [cursor, setCursor] = useState<string | null>(null)
  const result = useResource<ImportPreviewPage>(`/api/v1/previews/${id}?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
  const valid = result.resource.state === 'ready' && result.resource.data.state === 'valid' && Date.parse(result.resource.data.expiresAt) > Date.now()
  useEffect(() => onValidity(valid), [valid])
  return <ResourceState resource={result.resource} operation="import changes" retry={result.refresh}>{page => <><div className="cr-table-wrap" tabIndex={0} role="region" aria-label="Import changes"><table className="cr-table"><thead><tr><th>CSV row</th><th>Change</th><th>Fields</th></tr></thead><tbody>{page.rows.map(row => <tr key={row.row}><td>{row.row}</td><td>{row.operation}</td><td>{Object.entries(row.values).map(([fieldId, value]) => { const field = schema.fields.find(item => item.id === fieldId); return <div key={fieldId}><strong>{field?.label ?? 'Field unavailable'}</strong>{row.operation === 'update' && <> · Before: <CellDisplay appId={schema.appId} field={field} cell={{ state: 'value', value: row.before[fieldId] ?? null }} /> → </>}<CellDisplay appId={schema.appId} field={field} cell={{ state: 'value', value }} /></div> })}</td></tr>)}</tbody></table></div><div className="cr-actions">{cursor && <button type="button" className="cr-button cr-button--quiet" onClick={() => setCursor(null)}>First changes</button>}{page.nextCursor && <button type="button" className="cr-button cr-button--quiet" onClick={() => setCursor(page.nextCursor)}>Next changes</button>}</div>{!valid && <p className="cr-error">These changes need a fresh preview before importing.</p>}</>}</ResourceState>
}
