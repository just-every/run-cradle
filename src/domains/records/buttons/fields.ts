import type { Field } from '../contracts'

/** Literal values only; references and collections keep their existing doors. */
export function isButtonField(field: Field) {
  return !field.readOnly && !['computed', 'relation', 'attachment', 'multi_select', 'person'].includes(field.type)
}
