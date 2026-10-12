import type { D1Database, D1Sql } from '../../../../vendor/base/modules/import-kit/src/d1/types'
import type { Json } from '../../../../vendor/base/modules/import-kit/src/types'
import type { EntityDescriptor, FieldStorage } from '../descriptors.server'
import { canonicalJson } from '../../../../vendor/base/modules/import-kit/src/d1/index'
import { identifier } from '../../admission/sql.server'

const maximumBytes=500000,encoder=new TextEncoder()
/** Includes JSON array delimiters and commas in the bound UTF-8 byte count. */
export function boundedUndoJson(values:readonly Json[]):string[] {
 const chunks:string[]=[],items:string[]=[];let bytes=2
 const flush=()=>{if(items.length)chunks.push('['+items.join(',')+']');items.length=0;bytes=2}
 for(const value of values){const encoded=canonicalJson(value),size=encoder.encode(encoded).length;if(size+2>maximumBytes)throw new Error('IMPORT_D1_VALUE_LIMIT: native undo observation exceeds its bounded guard capacity');if(bytes+size+(items.length?1:0)>maximumBytes)flush();bytes+=size+(items.length?1:0);items.push(encoded)}
 flush();return chunks
}

export type NativeUndoMarker={target_kind:string;record_id:string;revision:string}
export function nativeUndoMarkerGuards(destination:string,markers:NativeUndoMarker[]):D1Sql[] {
 const columns=['target_kind','record_id','revision']
 return [{sql:'(SELECT COUNT(*) FROM record_import_revisions WHERE app_id=?)=?',params:[destination,markers.length]},...boundedUndoJson(markers).map(chunk=>({sql:`NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM record_import_revisions m WHERE m.app_id=? AND ${columns.map(c=>`typeof(m.${c})=json_type(e.value,'$.${c}') AND m.${c} IS json_extract(e.value,'$.${c}')`).join(' AND ')}))`,params:[chunk,destination]}))]
}

/** Each disjoint target-ID set has an exact count guard. Every observed row is
 * also compared by native identity, type, value and owning-record version.
 * Chunking changes neither coverage nor the detection of newly incoming rows. */
export async function incomingUndoRows(db:D1Database,descriptor:EntityDescriptor,field:FieldStorage,ids:string[]) {
 const owner=identifier(descriptor.table.tableId),join=field.join,from=join?`${identifier(join.table.tableId)} j JOIN ${owner} r ON r.id=j.record_id`:`${owner} r`
 const columns:Record<string,string>=join?{id:'j.id',record_id:'j.record_id',value:'j.value',position:'j.position',version:'r.version'}:{record_id:'r.id',value:'r.'+identifier(field.column),version:'r.version'}
 const selection=Object.entries(columns).map(([name,column])=>column+' AS '+name).join(','),rows:Record<string,Json>[]=[],guards:D1Sql[]=[]
 for(const targets of boundedUndoJson(ids)){
  const query=`SELECT ${selection} FROM ${from} WHERE ${columns.value} IN (SELECT value FROM json_each(?))`,found=(await db.prepare(query+' ORDER BY '+(join?'j.id':'r.id')).bind(targets).all<Record<string,Json>>()).results
  for(const row of found)rows.push(row)
  guards.push({sql:`(SELECT COUNT(*) FROM (${query}))=?`,params:[targets,found.length]})
  for(const chunk of boundedUndoJson(found))guards.push({sql:`NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM ${from} WHERE ${Object.entries(columns).map(([name,column])=>`typeof(${column})=json_type(e.value,'$.${name}') AND ${column} IS json_extract(e.value,'$.${name}')`).join(' AND ')}))`,params:[chunk]})
 }
 return {rows,guards}
}
