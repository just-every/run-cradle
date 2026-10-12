import { canonicalJson } from '../../../../vendor/base/modules/import-kit/src/d1/index'
import type { D1Database, D1Sql } from '../../../../vendor/base/modules/import-kit/src/d1/types'
import type { Json, TargetRow } from '../../../../vendor/base/modules/import-kit/src/types'
import type { DescriptorRegistry, EntityDescriptor } from '../descriptors.server'
import { identifier } from '../../admission/sql.server'

export const scalarColumns = (d:EntityDescriptor) => d.table.writableColumnIds.filter(c => ![...d.fields.values()].some(f => f.field.type === 'relation' && !f.join && !f.field.required && f.column === c))
const literal = (value:string) => "'" + value.replaceAll("'", "''") + "'"
// Small json_object calls also work on SQLite builds with the legacy argument cap.
function object(columns:readonly string[], alias:string):string {
 const groups:string[]=[]
 for(let start=0;start<columns.length;start+=30) groups.push(`json_object(${columns.slice(start,start+30).flatMap(c=>[literal(c),`${alias}.${identifier(c)}`]).join(',')})`)
 return groups.length===1?groups[0]!: `json('{'||${groups.map(g=>`substr(${g},2,length(${g})-2)`).join("||','||")}||'}')`
}
type NativeSet = {kind:string; sql:string; comparisons:string[]}
function sets(registry:DescriptorRegistry,destination:string):NativeSet[] {
 const result:NativeSet[]=[]
 for(const d of registry.list(destination)) {
  const table=identifier(d.table.tableId), columns=scalarColumns(d), kind='record:'+d.schema.id
  const query=(kind:string,value:string,where='')=>`SELECT r.id,json(${value}) AS native_value,COALESCE(m.revision,'native-unattributed') AS revision FROM ${table} r LEFT JOIN record_import_revisions m ON m.app_id=${literal(destination)} AND m.target_kind=${literal(kind)} AND m.record_id=r.id${where}`
  result.push({kind,sql:query(kind,`json_object('row',json(${object(columns,'r')}))`),comparisons:columns.map(c=>`json_extract(n.native_value,'$.row.${c}') IS json_extract(e.value,'$.value.row.${c}')`)})
  for(const f of d.fields.values()) if(f.field.type==='relation'&&(f.join||!f.field.required)) {
   const kind='link:'+d.schema.id+':'+f.field.id
   const values=f.join?`(SELECT COALESCE(json_group_array(json_object('id',id,'position',position,'record_id',record_id,'value',value)),'[]') FROM (SELECT id,record_id,value,position FROM ${identifier(f.join.table.tableId)} WHERE record_id=r.id ORDER BY position,id))`:undefined
   const value=f.join?`json_object('recordVersion',r.version,'values',json(${values}))`:`json_object('recordVersion',r.version,'value',r.${identifier(f.column)})`
   const nonempty=f.join?`EXISTS(SELECT 1 FROM ${identifier(f.join.table.tableId)} j WHERE j.record_id=r.id)`:`r.${identifier(f.column)} IS NOT NULL`
   result.push({kind,sql:query(kind,value,` WHERE m.revision IS NOT NULL OR ${nonempty}`),comparisons:[`json_extract(n.native_value,'$.recordVersion') IS json_extract(e.value,'$.value.recordVersion')`,`json_extract(n.native_value,'$.${f.join?'values':'value'}') IS json_extract(e.value,'$.value.${f.join?'values':'value'}')`]})
  }
 }
 return result
}
/** D1 permits five terms per compound SELECT. Nest bounded groups rather than
 * increasing requests with every relation field. */
function compound(queries:string[]):string {
 if(queries.length<=5)return queries.join(' UNION ALL ')
 const groups:string[]=[];for(let i=0;i<queries.length;i+=5)groups.push(`SELECT * FROM (${compound(queries.slice(i,i+5))})`)
 return compound(groups)
}
export async function listNativeSet(db:D1Database,registry:DescriptorRegistry,destination:string):Promise<TargetRow[]> {
 const result:TargetRow[]=[];let queries:string[]=[],length=0
 const flush=async()=>{if(!queries.length)return;const rows=await db.prepare(compound(queries)).all<{kind:string;id:string;native_value:string;revision:string}>();for(const r of rows.results)result.push({destination,targetKind:r.kind,targetId:r.id,value:JSON.parse(r.native_value) as Json,revision:r.revision});queries=[];length=0}
 for(const set of sets(registry,destination)) {const query=`SELECT ${literal(set.kind)} AS kind,id,native_value,revision FROM (${set.sql})`;if(queries.length>=100||length+query.length>85000)await flush();queries.push(query);length+=query.length+11}
 await flush();return result
}
/** Set-level read guards keep reconciliation bounded independently of row count.
 * Count every kind, then compare complete native values and attribution in chunks. */
export function matchNativeSet(rows:TargetRow[],registry:DescriptorRegistry,destination:string):D1Sql[] {
 const predicates:D1Sql[]=[],byKind=new Map<string,TargetRow[]>()
 for(const row of rows){const group=byKind.get(row.targetKind)??[];group.push(row);byKind.set(row.targetKind,group)}
 for(const set of sets(registry,destination)) {
  const expected=byKind.get(set.kind)??[]
  predicates.push({sql:`(SELECT COUNT(*) FROM (${set.sql}))=?`,params:[expected.length]})
  let chunk:TargetRow[]=[],bytes=2
  const flush=()=>{if(!chunk.length)return;predicates.push({sql:`NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM (${set.sql}) n WHERE n.id=json_extract(e.value,'$.targetId') AND n.revision=json_extract(e.value,'$.revision') AND ${set.comparisons.join(' AND ')}))`,params:[canonicalJson(chunk)]});chunk=[];bytes=2}
  for(const row of expected){const size=new TextEncoder().encode(canonicalJson(row)).length;if(chunk.length&&bytes+size>500000)flush();chunk.push(row);bytes+=size+1}flush();byKind.delete(set.kind)
 }
 if(byKind.size)throw new Error('Unknown native import kind in set snapshot')
 return predicates.length?predicates:[{sql:'1',params:[]}]
}
