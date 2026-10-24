import type {DescriptorRegistry} from '../descriptors.server'
import type {IdentityPlace} from '../../lifecycle/member-identity-places'
import {AdmissionError} from '../../admission/errors'
import {identifier} from '../../admission/sql.server'
import {storedValidationValues} from '../validation-values.server'
import type {TrashRow} from './storage.server'
/** Held values stay canonical. Deletion attribution does not confer ownership of
 * a business record: erase identity-only rows, scrub other held identity values,
 * and anonymize the deleter without making a retained row visible. */
export async function trashErasurePlaces(db:D1Database,registry:DescriptorRegistry,person:{id:string;name:string;email:string}):Promise<IdentityPlace[]>{
 const held=await db.prepare("SELECT * FROM record_trash WHERE kind='record'").all<TrashRow>(),places:IdentityPlace[]=[],identity=new Set([person.id,person.name,person.email])
 for(const row of held.results){
  const d=registry.get(row.app_id,row.entity_id),current=await db.prepare(`SELECT * FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)}=?`).bind(row.record_id).first<Record<string,unknown>>()
  if(current&&(current[d.versionColumn]!==row.record_version||current[d.lifecycleColumn]!=='deleted'))throw new AdmissionError('version_conflict','A held trash record changed; resolve its custody before erasure.')
  const values=current?Object.values(await storedValidationValues(db,d,current)):[],personal=values.some(v=>typeof v==='string'&&identity.has(v)),identityOnly=personal&&values.every(v=>v===null||Array.isArray(v)&&v.length===0||typeof v==='string'&&identity.has(v))
  places.push({table:d.table.tableId,where:'id=? AND version=? AND lifecycle=\'deleted\'',values:()=>[row.record_id,String(row.record_version)],action:identityOnly?'delete':'scrub',reason:identityOnly?'identity-only canonical values held in trash':'identity values held in a business record in trash'})
  const where='app_id=? AND entity_id=? AND record_id=?',marker={table:'record_trash',where,values:()=>[row.app_id,row.entity_id,row.record_id]}
  if(identityOnly||!current)places.push({...marker,action:'delete',reason:'trash marker for a permanently erased record'})
  if(identityOnly)places.push({table:'slack_app_actions',where:'app_id=? AND entity_id=? AND record_id=?',values:()=>[row.app_id,row.entity_id,row.record_id],action:'delete',reason:'Slack approval copies for a permanently erased identity-only record'})
  if(identityOnly)places.push({table:'sms_messages',where:'app_id=? AND entity_id=? AND record_id=?',values:()=>[row.app_id,row.entity_id,row.record_id],action:'delete',reason:'phone copies for a permanently erased identity-only record'})
  if(identityOnly)places.push({table:'admission_audit',where:"app_id=? AND json_extract(subject_json,'$.entityId')=? AND json_extract(subject_json,'$.recordId')=?",values:()=>[row.app_id,row.entity_id,row.record_id],action:'set',columns:['subject_json','changes_json','source_ids_json','personal_refs_json'],set:()=>({subject_json:'null',changes_json:'[]',source_ids_json:'[]',personal_refs_json:'[]'}),reason:'anonymized retained audit of an irreversibly erased identity-only record'})
  else if(row.actor_id===person.id)places.push({...marker,action:'set',columns:['actor_id'],set:()=>({actor_id:null}),reason:'anonymized deletion attribution; retained business values stay in trash'})
 }
 return places
}
