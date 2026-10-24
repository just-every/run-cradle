import type {AdmissionPort,SqlMutation,SqlPredicate} from '../../admission/ports'
import type {RequestContext,AuthorityPermit} from '../../authority/ports'
import type {EntitySchema} from '../contracts'
import {identifier,registerTable,trustedPredicate} from '../../admission/sql.server'
import {canonical,canonicalHash} from '../../admission/canonical'
import {createUlid} from '../../../core/shared/ids'
import {physicalName} from '../descriptors.server'
import {schemaTable} from '../change.server'
import {trashTable,type TrashRow} from './storage.server'
import {purgeSchemaRecovery,purgeSchemaDefinition,type SchemaDisposal} from './schema-recovery-purge'
const releases=registerTable('manual_record_releases',['id','detail_json'])
const previews=registerTable('manual_record_previews',['id','state','detail_json'])
const rootPattern=/^r_([0-9a-hjkmnp-tv-z]{26})(?:_v[1-9][0-9]*)?_manual_[0-9a-hjkmnp-tv-z]{26}$/
type RecoveryRow={id:string;detail_json:string}
/** Dispose expired values atomically. Current tables and FK targets needed by
 * unexpired table custody remain intact until that custody can expire too. */
export async function purgeExpiredSchema(db:D1Database,admission:AdmissionPort,now:number){
 const apps=await db.prepare("SELECT DISTINCT app_id FROM record_trash WHERE kind IN ('field','table') AND expires_at<=? AND purge_state<>'purged' ORDER BY app_id LIMIT 100").bind(now).all<{app_id:string}>()
 for(const {app_id:appId}of apps.results)await purgeBase(db,admission,appId,now)
}
async function purgeBase(db:D1Database,admission:AdmissionPort,appId:string,now:number){
 const guards:SqlPredicate[]=[]
 async function snapshot<T>(query:string,values:(string|number)[]):Promise<T[]>{
  const expression=`(SELECT coalesce(json_group_array(json(payload)),'[]') FROM (${query}))`,row=await db.prepare(`SELECT ${expression} value`).bind(...values).first<{value:string}>()
  if(!row)throw new Error('Schema disposal snapshot is unavailable')
  guards.push(trustedPredicate(`${expression}=?`,[...values,row.value]));return JSON.parse(row.value)
 }
 const markers=await snapshot<TrashRow>("SELECT json_object('app_id',app_id,'entity_id',entity_id,'record_id',record_id,'group_id',group_id,'actor_id',actor_id,'deleted_at',deleted_at,'expires_at',expires_at,'record_version',record_version,'schema_version',schema_version,'prior_lifecycle',prior_lifecycle,'links_json',links_json,'purge_state',purge_state,'kind',kind,'detail_json',detail_json) payload FROM record_trash WHERE app_id=? AND kind IN ('field','table') ORDER BY entity_id,record_id",[appId])
 const schemas=await snapshot<{id:string;schema_json:string}>("SELECT json_object('id',id,'schema_json',schema_json) payload FROM record_schemas WHERE app_id=? ORDER BY id",[appId])
 // Guard recovery inventory by IDs; each update separately fences its full
 // before-image. Aggregating all historical JSON into one binding exceeds D1.
 await snapshot<{id:string}>("SELECT json_object('id',id) payload FROM manual_record_releases WHERE app_id=? ORDER BY id",[appId])
 await snapshot<{id:string}>("SELECT json_object('id',id) payload FROM manual_record_previews WHERE app_id=? ORDER BY id",[appId])
 const history=(await db.prepare('SELECT id,detail_json FROM manual_record_releases WHERE app_id=? ORDER BY id').bind(appId).all<RecoveryRow>()).results
 const reviews=(await db.prepare('SELECT id,detail_json FROM manual_record_previews WHERE app_id=? ORDER BY id').bind(appId).all<RecoveryRow>()).results
 const current=schemas.map(row=>JSON.parse(row.schema_json) as EntitySchema),ids=new Set(current.map(schema=>schema.id))
 for(const row of history){const detail=JSON.parse(row.detail_json);for(const schema of [...(detail.prior??[]),...(detail.schemas??[])])ids.add(schema.id)}
 for(const marker of markers)if(marker.purge_state!=='purged'){const detail=JSON.parse(marker.detail_json);if(detail.schema)ids.add(detail.schema.id)}
 const objects=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all<{name:string;sql:string|null}>()).results
 const roots=objects.map(row=>row.name).filter(name=>{const match=name.match(rootPattern);return !!match&&ids.has(match[1]!.toUpperCase())})
 const rootOf=(table:string)=>roots.find(root=>table===root||table.startsWith(root+'_'))
 const kept=new Set(current.filter(schema=>!markers.some(marker=>marker.kind==='table'&&marker.entity_id===schema.id&&marker.purge_state!=='purged')).map(physicalName))
 for(const marker of markers)if(marker.kind==='table'&&marker.expires_at>now&&marker.purge_state!=='purged')kept.add(physicalName(JSON.parse(marker.detail_json).schema))
 let changed=true
 while(changed){changed=false;for(const root of [...kept])for(const object of objects.filter(object=>object.name===root||new RegExp('^'+root+'_f_[0-9a-hjkmnp-tv-z]{26}$').test(object.name))){
  const foreign=await db.prepare(`PRAGMA foreign_key_list(${identifier(object.name)})`).all<{table:string}>()
  for(const key of foreign.results){const target=rootOf(key.table);if(target&&!kept.has(target)){kept.add(target);changed=true}}
 }}
 const expired=markers.filter(marker=>marker.expires_at<=now&&marker.purge_state!=='purged'),eligible:TrashRow[]=[]
 for(const marker of expired){
  let blocked=marker.kind==='table'&&[...kept].some(root=>root.match(rootPattern)?.[1]?.toUpperCase()===marker.entity_id)
  if(marker.kind==='field')for(const root of kept)if(root.match(rootPattern)?.[1]?.toUpperCase()===marker.entity_id){const columns=await db.prepare(`PRAGMA table_xinfo(${identifier(root)})`).all<{name:string}>();if(columns.results.some(column=>column.name==='f_'+marker.record_id.toLowerCase()))blocked=true}
  if(!blocked)eligible.push(marker)
 }
 if(!eligible.length)return
 const disposal:SchemaDisposal={tables:new Set(eligible.filter(row=>row.kind==='table').map(row=>row.entity_id)),fields:new Map()}
 for(const row of eligible)if(row.kind==='field'){const fields=disposal.fields.get(row.entity_id)??new Set<string>();fields.add(row.record_id);disposal.fields.set(row.entity_id,fields)}
 const discarded=roots.filter(root=>!kept.has(root)),mutations:SqlMutation[]=[]
 for(const row of markers)if(row.purge_state!=='purged'&&!eligible.includes(row)){
  const detail=JSON.parse(row.detail_json)
  if(!detail.schema)continue
  detail.schema=purgeSchemaDefinition(detail.schema,disposal)
  if(detail.fieldId)detail.position=detail.schema.fields.findIndex((field:{id:string})=>field.id===detail.fieldId)
  const next=canonical(detail)
  if(next!==row.detail_json)mutations.push({kind:'update',table:trashTable,set:{detail_json:next},where:trustedPredicate('app_id=? AND entity_id=? AND record_id=? AND kind=? AND detail_json=?',[row.app_id,row.entity_id,row.record_id,row.kind,row.detail_json]),expectedRows:1})
 }

 for(const [table,rows]of [[releases,history],[previews,reviews]] as const)for(const row of rows)mutations.push({kind:'update',table,set:{detail_json:purgeSchemaRecovery(row.detail_json,disposal),...(table===previews?{state:'expired'}:{})},where:trustedPredicate('id=? AND detail_json=?',[row.id,row.detail_json]),expectedRows:1})
 for(const row of eligible)mutations.push({kind:'update',table:trashTable,set:{purge_state:'purged',detail_json:'{}',links_json:'[]',actor_id:null},where:trustedPredicate('app_id=? AND entity_id=? AND record_id=? AND kind=? AND detail_json=?',[row.app_id,row.entity_id,row.record_id,row.kind,row.detail_json]),expectedRows:1})
 for(const id of disposal.tables){const row=schemas.find(schema=>schema.id===id);if(row)mutations.push({kind:'delete',table:schemaTable,where:trustedPredicate('app_id=? AND id=? AND schema_json=?',[appId,id,row.schema_json]),expectedRows:1})}
 const at=new Date(now).toISOString(),ctx:RequestContext={principal:{id:'00000000000000000000000948',kind:'system',humanId:null,sessionId:null,credentialId:null,authenticationEpoch:1,issuedAt:at,expiresAt:new Date(Math.max(now,Date.now())+60000).toISOString()},requestId:createUlid(),now:at,ingress:'schedule'},action='schema.trash.purge',permit:AuthorityPermit={actor:{id:ctx.principal.id,kind:'system'},action,appId,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards:[],reservationMutations:[],reservationIds:[]}
 await admission.commit(ctx,{commandId:createUlid(),action,appId,canonicalInputHash:await canonicalHash(eligible.map(row=>({kind:row.kind,id:row.record_id,version:row.record_version}))),permit,guards,mutations,audit:eligible.map(row=>({action,subject:{appId,entityId:row.entity_id,recordId:row.record_id},changes:[],sourceIds:[],personalContentRefs:[]})),events:[],outbox:[],committedResult:{purged:eligible.map(row=>({kind:row.kind,id:row.record_id}))},async commitAtomic(statements){
  const extra:string[]=[]
  for(const root of discarded)extra.push(`DELETE FROM ${identifier(root)}`)
  for(const root of discarded){for(const object of objects)if(new RegExp('^'+root+'_f_[0-9a-hjkmnp-tv-z]{26}$').test(object.name))extra.push(`DROP TABLE ${identifier(object.name)}`);extra.push(`DROP TABLE ${identifier(root)}`);if(objects.some(object=>object.name===root+'_search'))extra.push(`DROP TABLE ${identifier(root+'_search')}`)}
  await db.batch([...statements.map(statement=>db.prepare(statement.sql).bind(...statement.values)),...extra.map(sql=>db.prepare(sql)),...discarded.map(root=>db.prepare('DELETE FROM record_capacity WHERE table_id=?').bind(root))])
 }})
}
