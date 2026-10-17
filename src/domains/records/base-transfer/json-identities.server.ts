import { ImportInputError } from './input-error'
import { RECORD_SCHEMA_ENTITY_ID,RECORD_VIEW_ENTITY_ID,RECORD_FORM_ENTITY_ID } from '../contracts'
import type { DescriptorRegistry } from '../descriptors.server'
import type { PreparedSource,ImportIdentities } from './contracts'
import { validatePortableBase } from './json-validation'
import { allocateJsonIdentities } from './source-json'
import { jsonIdentityMap } from './json-remap'
import { identifier } from '../../admission/sql.server'
/** Read-only collision detection. No uploaded identity ever overwrites a destination object. */
export function createJsonIdentityPreflight(db:D1Database,registry:DescriptorRegistry){
 async function occupied(values:Iterable<string>):Promise<boolean>{const ids=[...values],wanted=new Set(ids);if([RECORD_SCHEMA_ENTITY_ID,RECORD_VIEW_ENTITY_ID,RECORD_FORM_ENTITY_ID].some(id=>wanted.has(id)))return true
  for(const d of registry.list())if(wanted.has(d.schema.appId)||wanted.has(d.schema.id)||d.schema.fields.some(f=>wanted.has(f.id)||f.options?.some(o=>wanted.has(o.id)))||d.schema.incomingRelations?.some(r=>wanted.has(r.id))||d.schema.validationRules?.some(r=>wanted.has(r.id)))return true
  for(let offset=0;offset<ids.length;offset+=1000){const chunk=JSON.stringify(ids.slice(offset,offset+1000));for(const table of ['manual_record_bases','record_views','record_forms',...registry.list().map(d=>d.table.tableId)])if(await db.prepare(`SELECT 1 FROM ${identifier(table)} WHERE id IN (SELECT value FROM json_each(?)) LIMIT 1`).bind(chunk).first())return true}
  return false
 }
 return {async allocate(source:PreparedSource){const snapshot=validatePortableBase(source.portableBase),preserved=allocateJsonIdentities(snapshot,'preserve');return await occupied(jsonIdentityMap(snapshot,preserved).values())?allocateJsonIdentities(snapshot,'copy'):preserved},async validate(source:PreparedSource,ids:ImportIdentities){const map=jsonIdentityMap(validatePortableBase(source.portableBase),ids);if(await occupied(map.values()))throw new ImportInputError('An import identity already exists. Choose the file again to allocate a complete new copy.')}}
}
