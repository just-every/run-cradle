import type { Json } from '../../../contracts/primitives'
import type { BasePreview } from '../../../domains/records/base-transfer/contracts'

/** Import samples use the same public labels as the mapping, without exposing generated IDs. */
function displayValue(value: Json, preview: BasePreview): string {
  if (value === null) return 'Empty'
  if (typeof value === 'string') {
    const option = preview.schemaDraft.tables.flatMap(table => table.fields).flatMap(field => field.options ?? []).find(option => option.id === value)
    return option?.label ?? value
  }
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(item => displayValue(item, preview)).join(', ')
  if ('recordId' in value) return 'Linked record'
  return Object.entries(value).map(([key, item]) => `${key}: ${displayValue(item, preview)}`).join(' · ')
}
export function ImportColumnSamples({ preview, samples }: { preview: BasePreview; samples: Json[] }) {
  if (!samples.length) return <p>No sample values.</p>
  return <><h4>Sample values</h4><ul className="cr-import-samples">{samples.map((sample, index) => {
    if (sample && typeof sample === 'object' && !Array.isArray(sample) && 'raw' in sample && 'converted' in sample) return <li key={index}>{displayValue(sample.raw!, preview)} → {displayValue(sample.converted!, preview)}</li>
    return <li key={index}>{displayValue(sample, preview)}</li>
  })}</ul></>
}
