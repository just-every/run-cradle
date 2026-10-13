import type {D1Sql} from '../../../vendor/base/modules/import-kit/src/d1/types'
import {AuthorityError} from '../authority/errors'
import {identifier,trustedPredicate} from '../admission/sql.server'
import type {Effects} from './changes.server'

const copies="type='table' AND (name GLOB 'rer_portability_snap_*' OR name GLOB 'rer_portability_stage_*')"
const inventory=`SELECT json_group_array(name) FROM (SELECT name FROM sqlite_master WHERE ${copies} ORDER BY name)`
const jobs="SELECT json_group_array(json_array(id,kind,phase,completed)) FROM (SELECT id,kind,phase,completed FROM rer_portability_jobs ORDER BY id)"
const quiescent="NOT EXISTS(SELECT 1 FROM rer_portability_jobs WHERE kind NOT IN ('export','import') OR phase NOT IN ('complete','aborted')) AND NOT EXISTS(SELECT 1 FROM rer_portability_state WHERE import_job IS NOT NULL OR applying<>0)"
const stores=['rer_portability_jobs','rer_portability_parts','rer_portability_segments','rer_portability_owned']
export const installationTransfersIdle=async(db:D1Database)=>Boolean(await db.prepare(`SELECT 1 WHERE ${quiescent}`).first())

/** Base erasure's fence.transfers() contract retires ALL installation snapshots,
 * not native records or import-kit undo custody. Only terminal transfers may be
 * retired: an applying import can own R2 writes outside the database transaction.
 * Preparation writes nothing; admission, retirement and the durable checkpoint
 * share one batch, with the same inventory checked again after native writes.
 * This matches portability/journal.mjs invalidateTransfersStatements, preserving
 * its durable journal/epochs and deleting no native FILES objects. */
export async function preparePortabilityCustody(db:D1Database,change:Effects){
 if(!await installationTransfersIdle(db))throw new AuthorityError('version_conflict','Finish or cancel active installation transfers before erasure; no identity was erased.',409)
 const tables=(await db.prepare(`SELECT name FROM sqlite_master WHERE ${copies} ORDER BY name`).all<{name:string}>()).results.map(row=>row.name)
 const jobInventory=(await db.prepare(`SELECT (${jobs}) snapshot`).first<{snapshot:string}>())!.snapshot
 const guards=[trustedPredicate(quiescent),trustedPredicate(`(${inventory})=?`,[JSON.stringify(tables)]),trustedPredicate(`(${jobs})=?`,[jobInventory])]
 change.guards.push(...guards)
 const statements:D1Sql[]=[...guards.map(guard=>({sql:`INSERT INTO rer_portability_guard(value) SELECT CASE WHEN (${guard.sql}) THEN 1 ELSE 0 END`,params:[...guard.values]})),
  ...tables.map(name=>({sql:`DROP TABLE ${identifier(name)}`})),
  {sql:'DELETE FROM rer_portability_segments'},{sql:'DELETE FROM rer_portability_parts'},
  {sql:'DELETE FROM rer_portability_jobs'}, // owned rows cascade; FILES objects stay native custody.
  {sql:'UPDATE rer_portability_state SET import_job=NULL,applying=0 WHERE id=1'},
  {sql:'DELETE FROM rer_portability_guard'},
 ]
 const final:D1Sql[]=[{sql:`NOT EXISTS(SELECT 1 FROM sqlite_master WHERE ${copies}) AND ${stores.map(name=>`NOT EXISTS(SELECT 1 FROM ${name})`).join(' AND ')}`}]
 return {statements,final,managedTables:new Set([...stores,...tables]),places:[{store:'installation transfer custody',action:'delete' as const,rows:JSON.parse(jobInventory).length,reason:'completed or aborted installation transfers invalidated by the erasure checkpoint'}]}
}
