import { useState } from 'react'
import type { EntitySchema } from '../../domains/records/contracts'
import type { CsvImportPreview } from '../../domains/records/csv-import-contracts'
import { CellDisplay } from './record-fields'
import './manual-import.css'

export function ManualImportPreview({ schema, preview }: { schema: EntitySchema; preview: CsvImportPreview }) {
  const [offset, setOffset] = useState(0)
  const rows = [
    ...preview.rows.map(row => ({ ...row, message: null, problems: undefined })),
    ...preview.errors.map(error => ({ ...error, operation: 'rejected', values: {}, message: error.message, problems: error.problems })),
  ].sort((left, right) => left.row - right.row)
  const operation = { create: 'Create', update: 'Update', unchanged: 'Unchanged', rejected: 'Rejected' }
  return <>
    <div className="cr-table-wrap cr-import-preview" role="region" tabIndex={0} aria-label="CSV import changes"><table className="cr-table">
      <thead><tr><th>CSV row</th><th>Record</th><th>Change</th><th>Values or reason</th></tr></thead>
      <tbody>{rows.slice(offset, offset + 50).map(row => <tr key={row.row}>
        <td data-label="CSV row">{row.row}</td><td data-label="Record">{row.label}</td><td data-label="Change">{operation[row.operation as keyof typeof operation]}</td>
        <td data-label="Values or reason"><div>{row.message ? <ul className="cr-error">{(row.problems ?? [row.message]).map((problem, index) => <li key={index}>{problem}</li>)}</ul> : Object.entries(row.values).map(([id, value]) => {
          const field = schema.fields.find(field => field.id === id)
          return <p key={id}>{field?.label}: <CellDisplay cell={{ state: 'value', value }} field={field} appId={schema.appId} /></p>
        })}</div></td>
      </tr>)}</tbody>
    </table></div>
    <div className="cr-actions"><span>Showing {Math.min(offset + 1, rows.length)}–{Math.min(offset + 50, rows.length)} of {rows.length} rows</span>
      {offset > 0 && <button type="button" className="cr-button cr-button--quiet" onClick={() => setOffset(0)}>First changes</button>}
      {offset + 50 < rows.length && <button type="button" className="cr-button cr-button--quiet" onClick={() => setOffset(offset + 50)}>Next changes</button>}
    </div>
  </>
}
