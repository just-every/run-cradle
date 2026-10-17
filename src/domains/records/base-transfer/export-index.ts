import type { PortableBase, PortableField } from './json-format'

/** Build once per snapshot: exact record identity and incoming order never use label guesses. */
export function exportIndex(base: PortableBase['base']) {
 const tables = new Map(base.tables.map(table => [table.id, table]))
 const records = new Map(base.tables.map(table => [table.id, new Map(table.records.map(row => [row.id, row]))]))
 const options = new Map(base.tables.flatMap(table => table.fields.map(field => [field.id, new Map(field.options?.map(option => [option.id, option.label]) ?? [])] as const)))
 const incoming = new Map<string, Map<string, string[]>>()
 for (const table of base.tables) for (const projection of table.incomingRelations) {
  const targets = new Map<string, string[]>()
  for (const row of tables.get(projection.sourceEntityId)!.records) {
   const value = row.values[projection.sourceFieldId]
   for (const target of value === null ? [] : Array.isArray(value) ? value : [value]) {
    const refs = targets.get(String(target)) ?? []
    refs.push(row.id)
    targets.set(String(target), refs)
   }
  }
  incoming.set(projection.id, targets)
 }
 function scalar(field: PortableField, value: unknown): string {
  if (value === null) return ''
  if (field.type === 'select' || field.type === 'computed' && field.resultType === 'select') return options.get(field.id)!.get(String(value))!
  if (field.type === 'boolean' || field.type === 'computed' && field.resultType === 'boolean') return value ? 'checked' : ''
  if(field.type==='multi_select'||field.type==='computed'&&field.resultType==='multi_select')return JSON.stringify((value as string[]).map(id=>options.get(field.id)!.get(id)!))
  return typeof value==='object'?JSON.stringify(value):String(value)
 }
 return { tables, records, incoming, scalar }
}
