import { withMetadataTarget } from './target-metadata.server'
import { canonicalJson } from '../../../../vendor/base/modules/import-kit/src/d1/index'
import type { D1Database, D1Sql, D1TargetAdapter } from '../../../../vendor/base/modules/import-kit/src/d1/types'
import type { Json, TargetRow } from '../../../../vendor/base/modules/import-kit/src/types'
import type { DescriptorRegistry, FieldStorage } from '../descriptors.server'
import { identifier } from '../../admission/sql.server'
import { scalarColumns, listNativeSet, matchNativeSet } from './target-set.server'
import { nativeOwnedContent, nativePreservedUndo } from './undo-target.server'

/** Row scalars and each relation form disjoint native entities. Together they cover
 * every native column and join tuple; no JSON copy is used as native readback. */
export function createNativeImportTarget(registry:DescriptorRegistry):D1TargetAdapter {
 const resolve=(destination:string,kind:string)=>{const [type,entityId,fieldId]=kind.split(':');if(type!=='record'&&type!=='link')throw new Error('Unknown native import kind');const d=registry.get(destination,entityId!);const field=fieldId?d.fields.get(fieldId):undefined;if(type==='link'&&field?.field.type!=='relation'&&field?.field.type!=='multi_select')throw new Error('Unknown native relation');return {d,field,type}}
 const marker=(destination:string,kind:string,id:string)=>({sql:'SELECT revision FROM record_import_revisions WHERE app_id=? AND target_kind=? AND record_id=?',params:[destination,kind,id]})
 const predicate=(sql:string,...params:unknown[]):D1Sql=>({sql,params})
 const joins=(f:FieldStorage,id:string)=>`SELECT id,record_id,value,position FROM ${identifier(f.join!.table.tableId)} WHERE record_id=? ORDER BY position,id`
 async function read(db:D1Database,destination:string,kind:string,id:string):Promise<TargetRow|undefined>{
  const {d,field,type}=resolve(destination,kind),native=await db.prepare(`SELECT * FROM ${identifier(d.table.tableId)} WHERE id=?`).bind(id).first<Record<string,Json>>()
  if(!native)return undefined
  const m=marker(destination,kind,id),revision=await db.prepare(m.sql).bind(...m.params).first<{revision:string}>()
  if(type==='link'&&!revision){const nonempty=field!.join?(await db.prepare(`SELECT 1 FROM ${identifier(field!.join.table.tableId)} WHERE record_id=? LIMIT 1`).bind(id).first()):native[field!.column]!==null;if(!nonempty)return undefined}
  const value:Json=type==='record'?{row:Object.fromEntries(scalarColumns(d).map(c=>[c,native[c]??null]))}:field!.join?{recordVersion:native.version!,values:(await db.prepare(joins(field!,id)).bind(id).all<Record<string,Json>>()).results}:{recordVersion:native.version!,value:native[field!.column]??null}
  return {destination,targetKind:kind,targetId:id,value,revision:revision?.revision??'native-unattributed'}
 }
 function matches(row:TargetRow|null,destination:string,kind:string,id:string):D1Sql {
  const {d,field,type}=resolve(destination,kind),table=identifier(d.table.tableId),m=marker(destination,kind,id),parts:string[]=[],params:unknown[]=[]
  if(!row){parts.push(`NOT EXISTS(${m.sql})`);params.push(...m.params)
   if(type==='record'){parts.push(`NOT EXISTS(SELECT 1 FROM ${table} WHERE id=?)`);params.push(id)}
   else {parts.push(`EXISTS(SELECT 1 FROM ${table} WHERE id=?${field!.join?'':` AND ${identifier(field!.column)} IS NULL`})`);params.push(id);if(field!.join){parts.push(`NOT EXISTS(SELECT 1 FROM ${identifier(field!.join.table.tableId)} WHERE record_id=?)`);params.push(id)}}
  }else{
   parts.push(`EXISTS(SELECT 1 FROM record_import_revisions WHERE app_id=? AND target_kind=? AND record_id=? AND revision=?)`);params.push(destination,kind,id,row.revision)
   const value=row.value as Record<string,Json>
   if(type==='record'){const values=value.row as Record<string,Json>,cols=scalarColumns(d);if(Object.keys(values).sort().join()!==[...cols].sort().join())throw new Error('Incomplete native row snapshot');parts.push(`EXISTS(SELECT 1 FROM ${table},(SELECT ? AS native_snapshot) WHERE ${cols.map(c=>`${identifier(c)} IS json_extract(native_snapshot,'$.${c}')`).join(' AND ')})`);params.push(JSON.stringify(values))}
   else {parts.push(`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND version=?${field!.join?'':` AND ${identifier(field!.column)} IS ?`})`);params.push(id,value.recordVersion);if(!field!.join)params.push(value.value)
    if(field!.join){parts.push(`(SELECT COALESCE(json_group_array(json_object('id',id,'position',position,'record_id',record_id,'value',value)),'[]') FROM (${joins(field!,id)}))=?`);params.push(id,canonicalJson(value.values!))}
   }
  }
  return {sql:parts.map(p=>'('+p+')').join(' AND '),params}
 }
 function write(row:TargetRow):D1Sql[]{
  const {d,field,type}=resolve(row.destination,row.targetKind),value=row.value as Record<string,Json>,out:D1Sql[]=[]
  if(type==='record'){const values=value.row as Record<string,Json>,cols=scalarColumns(d);out.push(predicate(`INSERT INTO ${identifier(d.table.tableId)}(${cols.map(identifier).join(',')}) SELECT ${cols.map(c=>`json_extract(native_snapshot,'$.${c}')`).join(',')} FROM (SELECT ? AS native_snapshot) WHERE 1 ON CONFLICT(id) DO UPDATE SET ${cols.filter(c=>c!=='id').map(c=>`${identifier(c)}=excluded.${identifier(c)}`).join(',')}`,JSON.stringify(values)))}
  else if(field!.join){out.push(predicate(`DELETE FROM ${identifier(field!.join.table.tableId)} WHERE record_id=?`,row.targetId));out.push(predicate(`INSERT INTO ${identifier(field!.join.table.tableId)}(id,record_id,value,position) SELECT json_extract(value,'$.id'),json_extract(value,'$.record_id'),json_extract(value,'$.value'),json_extract(value,'$.position') FROM json_each(?)`,JSON.stringify(value.values)))}
  else out.push(predicate(`UPDATE ${identifier(d.table.tableId)} SET ${identifier(field!.column)}=? WHERE id=?`,value.value,row.targetId))
  out.push(predicate('INSERT INTO record_import_revisions(app_id,target_kind,record_id,revision) VALUES(?,?,?,?) ON CONFLICT(app_id,target_kind,record_id) DO UPDATE SET revision=excluded.revision',row.destination,row.targetKind,row.targetId,row.revision));return out
 }
 function remove(destination:string,kind:string,id:string):D1Sql[]{
  const {d,field,type}=resolve(destination,kind),out:D1Sql[]=[]
  if(type==='link')out.push(field!.join?predicate(`DELETE FROM ${identifier(field!.join.table.tableId)} WHERE record_id=?`,id):predicate(`UPDATE ${identifier(d.table.tableId)} SET ${identifier(field!.column)}=NULL WHERE id=?`,id))
  else {const relations=[...d.fields.values()].filter(f=>f.field.type==='multi_select'||f.field.type==='relation'&&(f.join||!f.field.required));out.push(predicate(`DELETE FROM ${identifier(d.table.tableId)} WHERE id=?${relations.map(f=>f.join?` AND NOT EXISTS(SELECT 1 FROM ${identifier(f.join.table.tableId)} WHERE record_id=?)`:` AND ${identifier(f.column)} IS NULL`).join('')}`,id,...relations.filter(f=>f.join).map(()=>id)))}
  out.push(predicate('DELETE FROM record_import_revisions WHERE app_id=? AND target_kind=? AND record_id=?',destination,kind,id));return out
 }
 const target:D1TargetAdapter=withMetadataTarget({read,matches,write,remove,list:(db,destination)=>listNativeSet(db,registry,destination),matchesMany:(rows,destination)=>matchNativeSet(rows,registry,destination)})
 return {...target,ownedContent:nativeOwnedContent,preparePreservedUndo:nativePreservedUndo(registry,target)}
}
