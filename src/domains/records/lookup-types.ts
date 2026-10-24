import type { Field } from './contracts'

const scalarTypes = ['phone','text', 'url', 'number', 'date', 'instant', 'money', 'boolean', 'select', 'person'] as const
export function lookupCollection(source: Field): boolean {
  return ['multi_select', 'relation', 'attachment', 'array'].includes(source.type === 'computed' ? source.resultType ?? '' : source.type)
}
/** Collection lookups are flat, typed lists; ARRAYUNIQUE without element metadata holds strings. */
export function lookupElementType(source: Field): Field['resultElementType'] {
  const type = source.type === 'computed' ? source.resultType : source.type
  if (type === 'array') return source.resultElementType ?? 'text'
  if (type === 'multi_select') return 'select'
  if (type === 'relation' || type === 'attachment') return type
  return scalarTypes.find(item => item === type)
}
