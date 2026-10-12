import type { Field } from '../../../domains/records/contracts'
import { manualFieldTypes } from '../schema/field-type-label'
/** The manual editor's labels remain the vocabulary for native import types. */
export function importTypeLabel(type: Field['type'] | 'skipped') {
  const manual = manualFieldTypes.find(([value]) => value === type)?.[1]
  if (manual) return manual
  const other = { instant: 'Date and time', money: 'Money', multi_select: 'Multiple choices', person: 'Person', attachment: 'Attachment', skipped: 'Skipped column' } as const
  return other[type as keyof typeof other] ?? 'Unsupported field'
}
