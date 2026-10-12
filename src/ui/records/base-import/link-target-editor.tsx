import { ImportColumnSelect } from './column-controls'
import type { BasePreview, ColumnOverride, SourceColumn } from '../../../domains/records/base-transfer/contracts'
/** Choice values are UI coordinates only; an omitted target never gets a fabricated source ID. */
export function ImportLinkTargetEditor({ preview, column, target, override, onChange }: { preview: BasePreview; column: SourceColumn; target?: string; override: ColumnOverride; onChange: (value: ColumnOverride) => void }) {
  const included = preview.source.tables.some(table => table.key === target)
  const missing = override.type === 'relation' && override.skip && !included
  const missingValue = JSON.stringify({ included: false })
  return <><label className="cr-field">Linked table for {column.label}<ImportColumnSelect aria-label={`Linked table for ${column.label}`} value={missing ? missingValue : target ? JSON.stringify({ included: true, tableKey: target }) : ''} onChange={event => {
    if (!event.target.value) onChange({ ...override, relationTableKey: undefined, reciprocal: undefined, skip: false })
    else {
      const choice = JSON.parse(event.target.value) as { included: boolean; tableKey?: string }
      onChange({ ...override, type: 'relation', relationTableKey: choice.included ? choice.tableKey : undefined, reciprocal: undefined, skip: !choice.included })
    }
  }}><option value="">Choose a target</option>{preview.source.tables.map(table => <option key={table.key} value={JSON.stringify({ included: true, tableKey: table.key })}>{preview.options.tables?.[table.key]?.label ?? table.label}</option>)}<option value={missingValue}>Target table not included in this set</option></ImportColumnSelect></label>{missing && <p>The native link column is skipped. Every source reference is still counted and listed as unresolved; nonempty source values remain in the original upload.</p>}</>
}
