import type {D1Database,D1Sql,D1TargetAdapter} from '../../../../vendor/base/modules/import-kit/src/d1/types'
import type {Json,TargetRow} from '../../../../vendor/base/modules/import-kit/src/types'
import {canonicalJson} from '../../../../vendor/base/modules/import-kit/src/d1/index'

const columns=['id','app_id','author_id','version','definition_json','created_at','updated_at','deleted_at','expires_at']
const versionColumns=['interface_id','version','author_id','definition_json','created_at']
const sql=(sql:string,...params:unknown[]):D1Sql=>({sql,params})
type VersionRow=Record<string,Json>
type InterfaceValue={row:Record<string,Json>;versions:VersionRow[]}
const content=(row:TargetRow)=>row.value as unknown as InterfaceValue
const historyExpression="(SELECT COALESCE(json_group_array(json_array(interface_id,version,author_id,definition_json,created_at)),'[]') FROM (SELECT * FROM record_interface_versions WHERE interface_id=? ORDER BY version))"
const historyGuard=(id:string,versions:VersionRow[])=>sql(`${historyExpression}=?`,id,JSON.stringify(versions.map(row=>versionColumns.map(column=>row[column]))))

/** One effect owns an interface and every retained layout version, including exact undo fences. */
export function createInterfaceImportTarget():D1TargetAdapter{
 async function read(db:D1Database,destination:string,_kind:string,id:string):Promise<TargetRow|undefined>{
  const row=await db.prepare(`SELECT ${columns.join(',')} FROM record_interfaces WHERE id=? AND app_id=?`).bind(id,destination).first<Record<string,Json>>();if(!row)return undefined
  const versions=(await db.prepare(`SELECT ${versionColumns.join(',')} FROM record_interface_versions WHERE interface_id=? ORDER BY version`).bind(id).all<VersionRow>()).results
  const marker=await db.prepare("SELECT revision FROM record_import_revisions WHERE app_id=? AND target_kind='interface' AND record_id=?").bind(destination,id).first<{revision:string}>()
  return {destination,targetKind:'interface',targetId:id,value:{row,versions},revision:marker?.revision??'native-unattributed'}
 }
 function matches(row:TargetRow|null,destination:string,_kind:string,id:string):D1Sql{
  if(!row)return sql("NOT EXISTS(SELECT 1 FROM record_interfaces WHERE id=?) AND NOT EXISTS(SELECT 1 FROM record_interface_versions WHERE interface_id=?) AND NOT EXISTS(SELECT 1 FROM record_import_revisions WHERE app_id=? AND target_kind='interface' AND record_id=?)",id,id,destination,id)
  const value=content(row),history=historyGuard(id,value.versions)
  return sql(`EXISTS(SELECT 1 FROM record_interfaces WHERE id=? AND app_id=? AND ${columns.map(column=>`${column} IS json_extract(?,'$.${column}')`).join(' AND ')}) AND COALESCE((SELECT revision FROM record_import_revisions WHERE app_id=? AND target_kind='interface' AND record_id=?),'native-unattributed')=? AND ${history.sql}`,id,destination,...columns.map(()=>canonicalJson(value.row)),destination,id,row.revision,...(history.params??[]))
 }
 function write(target:TargetRow):D1Sql[]{
  const value=content(target),row=value.row
  if(target.targetKind!=='interface'||row.id!==target.targetId||row.app_id!==target.destination||Object.keys(row).sort().join()!==[...columns].sort().join()||!value.versions.length||value.versions.some(version=>version.interface_id!==row.id||Object.keys(version).sort().join()!==[...versionColumns].sort().join()))throw new Error('Incomplete interface import effect')
  return [sql(`INSERT INTO record_interfaces(${columns.join(',')}) SELECT ${columns.map(column=>`json_extract(value,'$.${column}')`).join(',')} FROM (SELECT ? AS value) WHERE 1 ON CONFLICT(id) DO UPDATE SET ${columns.filter(column=>column!=='id').map(column=>`${column}=excluded.${column}`).join(',')}`,canonicalJson(row)),sql('DELETE FROM record_interface_versions WHERE interface_id=?',target.targetId),...value.versions.map(version=>sql(`INSERT INTO record_interface_versions(${versionColumns.join(',')}) VALUES(${versionColumns.map(()=>'?').join(',')})`,...versionColumns.map(column=>version[column]))),sql("INSERT INTO record_import_revisions(app_id,target_kind,record_id,revision) VALUES(?,'interface',?,?) ON CONFLICT(app_id,target_kind,record_id) DO UPDATE SET revision=excluded.revision",target.destination,target.targetId,target.revision)]
 }
 function remove(destination:string,_kind:string,id:string):D1Sql[]{return [sql('DELETE FROM record_interface_versions WHERE interface_id IN (SELECT id FROM record_interfaces WHERE id=? AND app_id=?)',id,destination),sql('DELETE FROM record_interfaces WHERE id=? AND app_id=?',id,destination),sql("DELETE FROM record_import_revisions WHERE app_id=? AND target_kind='interface' AND record_id=?",destination,id)]}
 async function list(db:D1Database,destination:string):Promise<TargetRow[]>{const ids=(await db.prepare('SELECT id FROM record_interfaces WHERE app_id=? ORDER BY id').bind(destination).all<{id:string}>()).results;const rows:TargetRow[]=[];for(const {id}of ids)rows.push((await read(db,destination,'interface',id))!);return rows}
 function matchesMany(rows:TargetRow[],destination:string):D1Sql[]{return [sql('(SELECT COUNT(*) FROM record_interfaces WHERE app_id=?)=?',destination,rows.length),...rows.map(row=>matches(row,destination,'interface',row.targetId))]}
 return {read,matches,write,remove,list,matchesMany}
}
