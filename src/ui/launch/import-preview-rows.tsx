import { useState } from 'react'
import { useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'

type Cell = string | number | boolean | null
type Row = { row: number; operation: 'create' | 'update' | 'unchanged'; values: Record<string, Cell>; changes?: { field: string; before: Cell; after: Cell }[] }
export type LaunchImportPage = { state: string; expiresAt: string; rows: Row[]; nextCursor: string | null; total: number }
const shown = (value: Cell) => value === null || value === '' ? 'empty' : String(value)
const operations = { create: 'New', update: 'Update', unchanged: 'Unchanged' }

/** Every previewed row with, for updates, each field that will change from its stored value. */
export function LaunchImportRows({ id, label }: { id: string; label: (field: string) => string }) {
 const [cursor, setCursor] = useState<string | null>(null)
 const page = useResource<LaunchImportPage>(`/api/v1/launch/imports/${id}/rows${cursor ? `?cursor=${cursor}` : ''}`)
 return <ResourceState resource={page.resource} operation="import changes" retry={page.refresh}>{data => <>
  <div className="cr-table-wrap" role="region" aria-label="Import changes" tabIndex={0}><table className="cr-table launch-import-rows"><thead><tr><th scope="col">CSV row</th><th scope="col">Change</th><th scope="col">Fields</th></tr></thead><tbody>
   {data.rows.map(row => <tr key={row.row}><td>{row.row}</td><td>{operations[row.operation]}</td><td>{row.operation === 'update'
    ? <ul className="launch-import-changes">{(row.changes ?? []).map(change => <li key={change.field}><strong>{label(change.field)}</strong> {shown(change.before)} → {shown(change.after)}</li>)}</ul>
    : row.operation === 'create' ? <ul className="launch-import-changes">{Object.entries(row.values).filter(([, value]) => value !== null && String(value).trim()).map(([field, value]) => <li key={field}><strong>{label(field)}</strong> {shown(value)}</li>)}</ul>
    : <span className="cr-muted">No field changes</span>}</td></tr>)}
  </tbody></table></div>
  <div className="cr-actions"><span>Showing {data.rows.length} of {data.total} rows</span>{cursor && <button type="button" className="cr-button cr-button--quiet" onClick={() => setCursor(null)}>First rows</button>}{data.nextCursor && <button type="button" className="cr-button cr-button--quiet" onClick={() => setCursor(data.nextCursor)}>Next rows</button>}</div>
 </>}</ResourceState>
}
