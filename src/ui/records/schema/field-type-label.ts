import type { Field } from '../../../domains/records/contracts'

export const manualFieldTypes = [
  ['text', 'Text'], ['url', 'URL / link'], ['number', 'Number'],
  ['date', 'Date'], ['select', 'Select'], ['boolean', 'Checkbox'],
  ['relation', 'Link to record'], ['computed', 'Lookup'],
] as const

// Change prose remains authoritative; only a known added field's type is presented.
export function impactChangeLabel(change: string, fields: Field[]) {
  for (const field of fields) {
    const type = field.type === 'computed' ? 'lookup' : field.type
    if (change === `Add ${field.label} (${type})`) {
      const label = manualFieldTypes.find(([value]) => value === field.type)?.[1]
      return `Add ${field.label} (${label ?? type})`
    }
  }
  return change
}
