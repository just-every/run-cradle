import { ImportColumnSelect } from './column-controls'
import type { BasePreview, ColumnAccounting, ColumnOverride, SourceColumn, SourceTable } from '../../../domains/records/base-transfer/contracts'
import { DiagnosticList } from './diagnostics'
type Coordinates = NonNullable<ColumnOverride['lookup']>
function coordinateValue(coordinates: Coordinates) { return JSON.stringify({ relationColumnKey: coordinates.relationColumnKey, valueColumnKey: coordinates.valueColumnKey }) }
export function ImportLookupEditor({ preview, table, column, accounting, override, onChange }: { preview: BasePreview; table: SourceTable; column: SourceColumn; accounting: ColumnAccounting; override: ColumnOverride; onChange: (value: ColumnOverride) => void }) {
  const candidates = accounting.lookupCandidates ?? []
  if (!candidates.length) return null
  const reported = preview.report.lookups.find(item => item.tableKey === table.key && item.columnKey === column.key)
  const selected = override.lookup ?? column.lookup ?? (reported?.relationColumnKey && reported.valueColumnKey ? { relationColumnKey: reported.relationColumnKey, valueColumnKey: reported.valueColumnKey } : undefined)
  const value = override.type && override.type !== 'computed' ? '' : selected ? coordinateValue(selected) : ''
  function candidateLabel(candidate: typeof candidates[number]) {
    const linkLabel = table.columns.find(item => item.key === candidate.relationColumnKey)?.label ?? candidate.relationColumnKey
    const target = preview.source.tables.find(item => item.key === candidate.targetTableKey)
    const tableLabel = target ? preview.options.tables?.[target.key]?.label ?? target.label : candidate.targetTableKey
    const fieldLabel = target?.columns.find(item => item.key === candidate.valueColumnKey)?.label ?? candidate.valueColumnKey
    return `${linkLabel} → ${tableLabel} · ${fieldLabel}`
  }
  return <section className="cr-import-lookup"><label className="cr-field">Lookup mapping for {column.label}<ImportColumnSelect aria-label={`Lookup mapping for ${column.label}`} value={value} onChange={event => {
    if (!event.target.value) onChange({ ...override, lookup: undefined, type: 'text', skip: false })
    else onChange({ ...override, lookup: JSON.parse(event.target.value) as Coordinates, type: undefined, skip: false })
  }}><option value="">Keep exported value; no lookup mapping</option>{candidates.map(candidate => <option key={coordinateValue(candidate)} value={coordinateValue(candidate)}>{candidateLabel(candidate)} · {candidate.matchedRows}/{candidate.rowsRead} rows match{candidate.matchesAllRows ? ' · proved' : ' · mismatch'}</option>)}</ImportColumnSelect></label><p>Choose the linked field and source field explicitly. The server compares every exported row; a mismatching mapping stays exported text. Equal data alone cannot choose between several matching source fields.</p><details><summary>Compare lookup candidates</summary>{candidates.map(candidate => <section key={coordinateValue(candidate)}><h5>{candidateLabel(candidate)}</h5><p>{candidate.matchedRows} of {candidate.rowsRead} rows match. {candidate.matchesAllRows ? 'All-row equivalence proved.' : 'Not proved; cannot become a lookup.'}</p>{candidate.firstMismatch && <DiagnosticList diagnostics={[candidate.firstMismatch]} title="First mismatch for this mapping" headingLevel={6} />}</section>)}</details></section>
}
