import { identifier, trustedPredicate } from '../../admission/sql.server'
import type { SqlPredicate } from '../../admission/ports'
import type { EntityDescriptor } from '../descriptors.server'
export async function snapshotTables(db:D1Database, descriptors:EntityDescriptor[]) {
 const guards:SqlPredicate[]=[], rows:Record<string,Record<string,unknown>[]>={}
 for(const descriptor of descriptors){
  const tables=[descriptor.table,...[...descriptor.fields.values()].flatMap(f=>f.join?[f.join.table]:[])]
  for(const table of tables){
   const cols=table.writableColumnIds, expression=`(SELECT COALESCE(json_group_array(json(row)),'[]') FROM (SELECT json_object(${cols.flatMap(c=>[`'${c}'`,identifier(c)]).join(',')}) AS row FROM ${identifier(table.tableId)} ORDER BY id))`
   const result=await db.prepare(`SELECT ${expression} AS snapshot`).first<{snapshot:string}>()
   guards.push(trustedPredicate(`${expression}=?`,[result!.snapshot]))
   rows[table.tableId]=JSON.parse(result!.snapshot)
  }
  guards.push(trustedPredicate('EXISTS(SELECT 1 FROM record_schemas WHERE id=? AND app_id=? AND version=? AND schema_json=?)',[descriptor.schema.id,descriptor.schema.appId,descriptor.schema.version,JSON.stringify(descriptor.schema)]))
 }
 // Metadata JSON has a canonical key ordering; compare through SQLite JSON, not object iteration order.
 for(let i=0;i<guards.length;i++)if(guards[i]!.sql.includes('schema_json=?')){
  const values=[...guards[i]!.values], row=await db.prepare('SELECT schema_json FROM record_schemas WHERE id=? AND app_id=?').bind(values[0],values[1]).first<{schema_json:string}>()
  values[3]=row?.schema_json??'';guards[i]=trustedPredicate(guards[i]!.sql,values)
 }
 return {guards,rows}
}
