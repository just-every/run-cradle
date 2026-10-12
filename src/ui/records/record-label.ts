import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
export function primaryRecordField(schema: EntitySchema) {
  return schema.primaryFieldId ? schema.fields.find(field => field.id === schema.primaryFieldId) : schema.fields.find(field => field.type === 'text')
}
export function recordLabel(record: RecordRow, schema: EntitySchema) {
  const field = primaryRecordField(schema), cell = field && record.fields[field.id]
  if (!field || cell?.state !== 'value' || cell.value === null) return 'Record without a title'
  const type = field.type === 'computed' ? field.resultType : field.type
  if (type === 'select') return field.options?.find(option => option.id === cell.value)?.label || 'Record without a title'
  if (typeof cell.value === 'boolean') return cell.value ? 'Yes' : 'No'
  return typeof cell.value === 'string' && cell.value.trim() ? cell.value : 'Record without a title'
}
