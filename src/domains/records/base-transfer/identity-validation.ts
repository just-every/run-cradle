import { ImportInputError } from './input-error'
import type { PreparedSource,ImportIdentities } from './contracts'

/** Source coordinates and destination IDs are identities, never overwrite keys. */
export function validateImportIdentities(source:PreparedSource,ids:ImportIdentities):void {
 const targets=new Set<string>(),tables=new Set<string>(),sourceRecords=new Set<string>()
 const target=(id:string|undefined,description:string)=>{if(typeof id!=='string'||!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id))throw new ImportInputError(`Invalid or missing ${description} identity`);if(targets.has(id))throw new ImportInputError(`Duplicate destination identity for ${description}`);targets.add(id)}
 const sourceKey=(key:string,seen:Set<string>,kind:string)=>{if(typeof key!=='string'||!key||key.includes('\0'))throw new ImportInputError(`Invalid source ${kind} identity`);if(seen.has(key))throw new ImportInputError(`Duplicate source ${kind} identity ${key}`);seen.add(key)}
 target(ids.appId,'base')
 for(const table of source.tables){sourceKey(table.key,tables,'table');const identity=Object.hasOwn(ids.tables,table.key)?ids.tables[table.key]:undefined;if(!identity)throw new ImportInputError(`Missing identity map for ${table.key}`);target(identity.entityId,`${table.key} table`);const columns=new Set<string>(),rows=new Set<string>()
  for(const column of table.columns){sourceKey(column.key,columns,'field');target(identity.fields[column.key],`${table.key}.${column.key} field`)}
  for(const row of table.rows){sourceKey(row.key,rows,'record');sourceKey(table.key+':'+row.key,sourceRecords,'qualified record');target(identity.records[row.key],`${table.key}.${row.key} record`)}
  for(const [column,options]of Object.entries(identity.options))for(const [label,id]of Object.entries(options))target(id,`${table.key}.${column}.${label} option`)
  for(const key of Object.keys(identity.fields))if(!columns.has(key))throw new ImportInputError(`Unknown source field identity ${key}`)
  for(const key of Object.keys(identity.records))if(!rows.has(key))throw new ImportInputError(`Unknown source record identity ${key}`)
  for(const key of Object.keys(identity.options))if(!columns.has(key))throw new ImportInputError(`Unknown source option field identity ${key}`)
 }
 for(const key of Object.keys(ids.tables))if(!tables.has(key))throw new ImportInputError(`Unknown source table identity ${key}`)
 for(const kind of ['views','forms','incomingRelations','validationRules'] as const)for(const id of Object.values(ids[kind]??{}))target(id,kind)
}
