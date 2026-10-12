import { ImportInputError } from './input-error'
import type { ImportOptions, PreparedSource } from './contracts'

/** Mapping keys must identify actual retained source fields, never hidden payload. */
export function validateImportMapping(source:PreparedSource, options:ImportOptions):void {
 for(const [tableKey,mapping] of Object.entries(options.tables??{})) {
  const table=source.tables.find(item=>item.key===tableKey)
  if(!table)throw new ImportInputError(`Unknown mapping table ${JSON.stringify(tableKey)}`)
  for(const columnKey of Object.keys(mapping.columns??{})) {
   if(!table.columns.some(column=>column.key===columnKey))throw new ImportInputError(`Unknown mapping column ${JSON.stringify(tableKey)}.${JSON.stringify(columnKey)}`)
  }
 }
}
