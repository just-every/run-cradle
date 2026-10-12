import type { PreparedSource, ImportIdentities } from './contracts'

// JSON restores normal prototypes. Source field names remain data, including
// constructor and __proto__; absent cells must never resolve to inherited values.
const ownMap = <T,>(map: Record<string, T>): Record<string, T> => Object.assign(Object.create(null), map)
export function sourceWithOwnRowMaps(source: PreparedSource): PreparedSource {
 return {...source, tables: source.tables.map(table => ({...table, rows: table.rows.map(row => ({
  ...row, values: ownMap(row.values),
  ...(row.numericOrigins ? {numericOrigins: ownMap(row.numericOrigins)} : {}),
  ...(row.numericTokens ? {numericTokens: ownMap(row.numericTokens)} : {}),
 }))}))}
}

/** Restore null-prototype ID maps after JSON transport, including optional
 * option maps whose source keys may be constructor or __proto__. */
export function copyImportIdentities(input:ImportIdentities):ImportIdentities {
 const tables:ImportIdentities['tables']=Object.create(null)
 for(const [key,table] of Object.entries(input.tables)){
  const options:typeof table.options=Object.create(null)
  for(const [column,choices] of Object.entries(table.options))options[column]=Object.assign(Object.create(null),choices)
  tables[key]={...table,fields:Object.assign(Object.create(null),table.fields),records:Object.assign(Object.create(null),table.records),options}
 }
 return {...input,tables}
}
