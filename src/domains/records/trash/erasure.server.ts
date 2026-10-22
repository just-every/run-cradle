import type {DescriptorRegistry} from '../descriptors.server'
import type {IdentityPlace} from '../../lifecycle/member-identity-places'
import {AdmissionError} from '../../admission/errors'
import {identifier} from '../../admission/sql.server'
import type {TrashRow} from './storage.server'
/** Personal erasure retires the person's own held records in the same admission.
 * Their values stay in canonical columns until that deletion, never a trash copy. */
export async function trashErasurePlaces(db:D1Database,registry:DescriptorRegistry,personId:string):Promise<IdentityPlace[]>{
 const held=await db.prepare('SELECT * FROM record_trash').all<TrashRow>(),places:IdentityPlace[]=[]
 for(const row of held.results){const d=registry.get(row.app_id,row.entity_id),current=await db.prepare(`SELECT ${identifier(d.versionColumn)} version,${identifier(d.lifecycleColumn)} lifecycle FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)}=?`).bind(row.record_id).first<{version:number;lifecycle:string}>()
  if(current&&(current.version!==row.record_version||current.lifecycle!=='deleted'))throw new AdmissionError('version_conflict','A held trash record changed; resolve its custody before erasure.')
  places.push({table:d.table.tableId,where:'id=? AND version=? AND lifecycle=\'deleted\'',values:()=>[row.record_id,String(row.record_version)],action:row.actor_id===personId?'delete':'scrub',reason:row.actor_id===personId?'canonical values of their own trashed record':'identity values held in another trashed record'})
 }
 return places
}
