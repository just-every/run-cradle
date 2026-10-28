import { calculationKind } from '../../../domains/records/calculation-schema'
import type { Field } from '../../../domains/records/contracts'

export const manualFieldTypes = [
  ['text', 'Text'], ['email', 'Email'], ['rating', 'Rating'], ['duration', 'Duration'], ['phone', 'Phone'], ['url', 'URL / link'], ['number', 'Number'],
  ['date', 'Date'], ['instant', 'Date and time'], ['money', 'Currency'], ['select', 'Select'], ['multi_select', 'Multiple select'], ['person', 'Person'], ['boolean', 'Checkbox'],
  ['relation', 'Link to record'], ['computed', 'Lookup'],
] as const

// Change prose remains authoritative; only a known added field's type is presented.
export function impactChangeLabel(change: string, fields: Field[]) {
  for (const field of fields) {
    const type = field.type === 'computed' ? calculationKind(field) : field.type
    if (change === `Add ${field.label} (${type})`) {
      const label = field.type==='computed'?fieldTypeLabel(field):manualFieldTypes.find(([value]) => value === field.type)?.[1]
      return `Add ${field.label} (${label ?? type})`
    }
  }
  return change
}

const otherFieldTypes: Partial<Record<Field['type'], string>> = { instant: 'Date and time', money: 'Money', multi_select: 'Multi-select', person: 'Person', attachment: 'Attachment' }
/** The type subtitle a table header shows under each field name. */
export function fieldTypeLabel(field: Field) {
  if(field.type==='computed'){if(!field.expression)return 'Calculated';if(field.expression.kind!=='rollup')return 'Formula';return field.expression.aggregate==='lookup'?'Lookup':field.expression.aggregate==='countall'?'Count':'Rollup'}
  return manualFieldTypes.find(([value]) => value === field.type)?.[1] ?? otherFieldTypes[field.type] ?? field.type
}
