import {restoreCheckpoint} from './restore-checkpoint.server'
import {preparePortabilityCustody} from './portability-custody.server'
import {inspectImportReports} from './import-reports.server'
import {inspectImportHistory} from './import-history.server'
import {importInventory} from './import-inventory.server'
import type {DescriptorRegistry} from '../records/descriptors.server'
import {createNativeImportTarget} from '../records/base-transfer/target.server'
import {loadPlans} from '../../../vendor/base/modules/import-kit/src/d1/plans'
import {headerCells,retirementScope} from '../../../vendor/base/modules/import-kit/src/d1/retirement-scope'
import {retireD1ImportCustody} from '../../../vendor/base/modules/import-kit/src/d1/retirement'
import {canonicalJson} from '../../../vendor/base/modules/import-kit/src/d1/index'
import type {D1ImportContext,D1ImportPerson} from '../../../vendor/base/modules/import-kit/src/d1/types'
import type {RequestContext} from '../authority/ports'
import {AuthorityError} from '../authority/errors'
import {and,trustedPredicate} from '../admission/sql.server'
import type {SqlPredicate} from '../admission/ports'
import type {Statement} from '../admission/compiler.server'
import type {IdentityPlace} from './member-identity-places'
import type {IdentityCopy} from './identity-redaction.server'
import {hasWholeToken} from './identity-match'
import {attachmentText} from './attachment-text.server'
import {removeRows,type Effects} from './changes.server'
import {operatorErasureTarget} from './import-operator-target.server'

/** Import custody that holds the person's name without their email or ID. */
export const IMPORT_NAME_COPIES='import custody'
/** Decode and attribute import custody before native mutation. Exact email and
 * operator ID identify the person; a name alone never assigns another row.
 * Name-only copies are reported like native copies the person did not write: the
 * owner confirms them (keepCopies) and they stay unchanged. */
export async function prepareImportCustody(db:D1Database,registry:DescriptorRegistry,change:Effects,ctx:RequestContext,person:{id:string;name:string;email:string},others:string[],keep:ReadonlySet<string>){
 const transfers=await preparePortabilityCustody(db,change)
 // The request's admitted registry retains source-owned physical mappings and
 // protection alongside imported schemas. Recompiling with no sources invents
 // generic tables for retained launch/repair entities and aborts privacy checks.
 const native=createNativeImportTarget(registry),targets=operatorErasureTarget(native,person.id)
 const matches=(value:unknown,literals=[person.email,person.id])=>hasWholeToken(typeof value==='string'?value:canonicalJson(value as never),literals,others)
 let nameCopies=0
 const nameOnly=(value:unknown)=>{const found=matches(value,[person.name]);if(found)nameCopies++;return found}
 const nameRefusal=()=>new AuthorityError('version_conflict',`Erasure found the name outside this person's own records: ${IMPORT_NAME_COPIES} (1 not attributed). Confirm it is not this person's identity to leave it unchanged; no identity was erased.`,409,{erasureCopies:[{store:IMPORT_NAME_COPIES,rows:1,reason:'not_attributed'}]})
 const jobs=(await db.prepare('SELECT * FROM ik_jobs ORDER BY destination,id').all<any>()).results
 const destinations=[...new Set(jobs.map(j=>j.destination as string).concat((await db.prepare('SELECT destination FROM ik_d1_staging UNION SELECT destination FROM ik_d1_native_staging UNION SELECT destination FROM ik_d1_streams UNION SELECT destination FROM ik_d1_stream_revisions UNION SELECT parent_destination FROM ik_d1_stream_origins').all<{destination:string}>()).results.map(r=>r.destination)))]
 const places:IdentityPlace[]=[],reviews=new Set<string>(),selectedSources=new Set<string>(),selectedJobs=new Set<string>(),retiredJobs=new Set<string>(),values=[person.email,person.id]
 change.guards.push(trustedPredicate("(SELECT json_group_array(json_array(id,destination,fingerprint)) FROM (SELECT id,destination,fingerprint FROM ik_jobs ORDER BY destination,id))=?",[JSON.stringify(jobs.map(j=>[j.id,j.destination,j.fingerprint]))]))
 const finalInventory=await importInventory(db,change)
 for(const {table,columns} of [...headerCells,{table:'ik_originals',columns:['name']},{table:'ik_d1_staging_originals',columns:['name']}]){const rows=(await db.prepare(`SELECT ${columns.join(',')} FROM ${table}`).all<Record<string,string>>()).results;for(const row of rows)for(const column of columns){const value=row[column]!;if(values.includes(value))continue;if(matches(value,[person.email]))throw new AuthorityError('version_conflict','Import header contains an identity outside an exact identifier; resolve its custody before erasure.',409);nameOnly(value)}}
 const plans=await loadPlans(jobs,db,targets.planCodec)
 for(const job of jobs){
  const plan=plans.get(job.id)!
  for(const entry of plan.entries){if(entry.erased)continue
   const selected=matches(entry.source.payload)
   if(!selected&&matches(entry.effects,[person.email,person.id]))throw new AuthorityError('version_conflict','Import effect contains an unattributed identity. Resolve its custody before erasure; no identity was erased.',409)
   if(!selected){if(!nameOnly(entry.effects))nameOnly(entry.source.payload);continue}
   reviews.add(job.operation_key);selectedSources.add(entry.identity);selectedJobs.add(job.id)
   for(const effect of entry.effects){
    if(!effect.targetKind.startsWith('record:'))continue
    const descriptor=registry.get(job.destination,effect.targetKind.slice(7))
    places.push({table:descriptor.table.tableId,where:'id=?',values:()=>[effect.targetId],action:'scrub',reason:'native imported record with this exact operator identity'})
   }
  }
 }
 for(const destination of destinations){
  const scope=await retirementScope(db,destination,values);for(const id of scope.jobs)retiredJobs.add(id)
  for(const job of jobs.filter(j=>scope.jobs.includes(j.id)))reviews.add(job.operation_key)
  // An unpublished plan cannot be attributed through published source identities.
  // Matching headers are closed and retired by the kit; refuse all other private
  // stages rather than silently searching compressed/chunked custody as text.
  const pending=(await db.prepare('SELECT id,NULL AS job_id FROM ik_d1_staging WHERE destination=? UNION SELECT id,job_id FROM ik_d1_native_staging WHERE destination=?').bind(destination,destination).all<{id:string;job_id:string|null}>()).results
  if(pending.some(p=>!scope.stages.includes(p.id)&&!scope.jobs.includes(p.job_id??'')))throw new AuthorityError('version_conflict','Finish or cancel uninspectable private import preparations before erasure; no identity was erased.',409)
 }
 const unattributed=(value:unknown)=>matches(value,[person.email])||(nameOnly(value),false)
 finalInventory.push(...await inspectImportHistory(db,change,selectedSources,retiredJobs,unattributed))
 finalInventory.push(...await inspectImportReports(db,change,new Set([...selectedJobs,...retiredJobs]),unattributed))
 const reviewRows=(await db.prepare('SELECT id,principal_id,detail_json FROM record_import_reviews').all<{id:string;principal_id:string;detail_json:string}>()).results
 for(const review of reviewRows){
  const chunks=(await db.prepare('SELECT ordinal,body FROM record_import_review_chunks WHERE review_id=? ORDER BY ordinal').bind(review.id).all<{ordinal:number;body:string}>()).results
  const manifest=JSON.parse(review.detail_json) as {chunks:number}
  if(chunks.length!==manifest.chunks||chunks.some((c,i)=>c.ordinal!==i))throw new AuthorityError('version_conflict','Import review custody is incomplete; no identity was erased.',409)
  change.guards.push(trustedPredicate("(SELECT json_group_array(json_array(ordinal,body)) FROM (SELECT ordinal,body FROM record_import_review_chunks WHERE review_id=? ORDER BY ordinal))=?",[review.id,JSON.stringify(chunks.map(c=>[c.ordinal,c.body]))]))
  const detail=JSON.parse(chunks.map(c=>c.body).join(''))
  if(review.principal_id===person.id||matches(detail))reviews.add(review.id)
  else nameOnly(detail)
 }
 // Delete the seed's raw review/report copy too. Mixed Kit jobs retain their
 // non-person effects and undo; withdrawn seed reports explicitly refuse retrieval.
 for(const id of reviews){
  await removeRows(db,change,'record_import_review_chunks','review_id=?',[id])
  await removeRows(db,change,'record_import_reviews','id=?',[id])
 }
 const managedTables=new Set([...transfers.managedTables,...(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'ik_*' OR name IN ('record_import_reviews','record_import_review_chunks'))").all<{name:string}>()).results.map(r=>r.name)])
 // Fence all reviewed bytes and the destination inventory, including clean jobs.
 // The kit independently fences plans, originals, native before-images and scope.
 change.guards.push(trustedPredicate("(SELECT json_group_array(json_array(id,detail_json,detail_hash)) FROM (SELECT id,detail_json,detail_hash FROM record_import_reviews ORDER BY id))=?",[(await db.prepare('SELECT json_group_array(json_array(id,detail_json,detail_hash)) snapshot FROM (SELECT id,detail_json,detail_hash FROM record_import_reviews ORDER BY id)').first<{snapshot:string}>())!.snapshot]))
 const related:D1ImportPerson['related']={source:record=>matches(record.payload),original:(bytes,metadata)=>{
  const content=attachmentText(bytes,/\.csv$/i.test(metadata.name)?'text/csv':'');if(content.some(text=>matches(text)))return true
  if(!keep.has(IMPORT_NAME_COPIES)&&content.some(text=>matches(text,[person.name])))throw nameRefusal()
  return false
 }}
 const custodyPlaces=[...transfers.places,...['record_import_reviews','record_import_review_chunks'].map(store=>({store,action:'delete' as const,rows:change.mutations.filter(m=>m.kind==='delete'&&m.table.tableId===store).reduce((n,m)=>n+(m.kind==='delete'?m.expectedRows:0),0),reason:'raw import review/report custody withdrawn for the erased identity'}))]
 const residual:IdentityCopy[]=nameCopies?[{store:IMPORT_NAME_COPIES,rows:nameCopies,reason:'not_attributed'}]:[]
 return {places,managedTables,custodyPlaces,residual,async commit(statements:readonly Statement[],authority:readonly SqlPredicate[],fallbackDestination:string){
  const checkpoint=[...transfers.statements,...await restoreCheckpoint(db)]
  const predicate=and(...authority),context=(destination:string):D1ImportContext=>({destination,namespace:'operator-erasure',mappingVersion:'cradle-native-base-v1',storage:{database:db,targets},authorization:{principalId:ctx.principal.id,predicate:()=>({sql:predicate.sql,params:[...predicate.values]})}})
  const input:D1ImportPerson={target:{kind:'operator',id:person.id},values,related}
  const scopes=destinations.length?destinations:[fallbackDestination]
  await retireD1ImportCustody(input,statements.map(s=>({sql:s.sql,params:s.values})),context(scopes[0]!),checkpoint,scopes.slice(1).map(destination=>({person:input,context:context(destination)})),[...finalInventory,...transfers.final])
 }}
}
