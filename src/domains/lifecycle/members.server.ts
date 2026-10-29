import {eraseInterfaceIdentity} from './interface-erasure.server'
import {anonymizeAuditSubjects} from './audit-identity.server'
import {trashErasurePlaces} from '../records/trash/erasure.server'
import {prepareLifecycleRemoval} from './removal.server'
import {trustedPredicate} from '../admission/sql.server'
const warehouseObjectInventoryGuard=(keys:string[])=>trustedPredicate("(SELECT COALESCE(json_group_array(object_key),'[]') FROM (SELECT object_key FROM warehouse_objects ORDER BY object_key))=?",[JSON.stringify(keys)])
import {prepareImportCustody} from './import-custody.server'
import {requireQuiescentFiles} from './file-writes.server'
import type {RequestContext} from '../authority/ports'
import type {MemberLifecyclePort} from '../authority/members.server'
import type {DescriptorRegistry} from '../records/descriptors.server'
import {AuthorityError} from '../authority/errors'
import {createMemberEvidenceErasure} from '../evidence/member-erasure.server'
import {effects,append,removeRows,updateRows} from './changes.server'
import {redactIdentityCopies} from './identity-redaction.server'
import {classifyIdentityObjects} from './identity-objects.server'
import {memberIdentityPlaces} from './member-identity-places'
import {otherIdentities} from './other-identities.server'
import {retainCleanup} from './cleanup.server'

export function memberLifecycle(db:D1Database,bucket:R2Bucket,registry:DescriptorRegistry):MemberLifecyclePort{
 return {
 prepareRemoval:prepareLifecycleRemoval(db),
 async prepareErasure(ctx,id,label,keepCopies){
  const person=await db.prepare('SELECT name,email FROM operators o JOIN authority_principals p ON p.id=o.id WHERE o.id=? AND p.state=\'removed\'').bind(id).first<{name:string;email:string}>()
  if(!person)throw new AuthorityError('version_conflict','Remove this operator before erasure.',409)
  const overlap=await db.prepare('SELECT 1 FROM operators WHERE id<>? AND (name=? OR email=?) LIMIT 1').bind(id,person.name,person.email).first()
  if(overlap)throw new AuthorityError('version_conflict','Another operator shares an identity literal; resolve the ambiguous copy before erasure.',409)
  const change=effects(),needles=[person.name,person.email].filter(Boolean),keys:string[]=[],keep=new Set(keepCopies)
  if(needles.some(needle=>label.includes(needle)||`erased-${id}@invalid.invalid`.includes(needle)))throw new AuthorityError('version_conflict','Anonymous identity would retain an original literal; resolve the replacement-label conflict before erasure.',409)
  await requireQuiescentFiles(db,change)
  const others=await otherIdentities(db,id,needles)
  const custody=await prepareImportCustody(db,registry,change,ctx,{id,...person},others,keep)
  const {planned,residual}=await redactIdentityCopies(db,change,{person:{id,email:person.email},needles,label,places:[...memberIdentityPlaces,...await trashErasurePlaces(db,registry,{id,...person}),...custody.places],others,keep,managedTables:custody.managedTables})
  await eraseInterfaceIdentity(db,change,id,needles,label,others)
  await anonymizeAuditSubjects(db,change,{id},label)
  const encrypted=await db.prepare("SELECT a.id,a.sealed_input,a.reconcile_input FROM execution_attempts a JOIN execution_runs r ON r.id=a.run_id WHERE json_extract(r.actor_json,'$.id')=? OR a.custodian_id=?").bind(id,id).all<{id:string;sealed_input:string|null;reconcile_input:string|null}>()
  const inputKeys=encrypted.results.flatMap(row=>[row.sealed_input,row.reconcile_input].flatMap(value=>{const key=value?JSON.parse(value).payloadRef?.key:undefined;return key?[key as string]:[]}))
  const objects=await classifyIdentityObjects(db,bucket,{personId:id,matches:[...new Set(needles.flatMap(needle=>[needle,JSON.stringify(needle).slice(1,-1)]))],label,others,deleting:new Set(inputKeys)})
  const unresolved=[...residual,...custody.residual,...objects.residual].filter(copy=>!keep.has(copy.store))
  if(unresolved.length)throw new AuthorityError('version_conflict',`Erasure found the name or email outside this person's own records: ${unresolved.map(copy=>`${copy.store} (${copy.rows} ${copy.reason.replaceAll('_',' ')})`).join('; ')}. Edit those copies, or confirm they are not this person's identity to leave them unchanged; no identity was erased.`,409,{erasureCopies:unresolved})
  if(await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='oa_dev_credentials'").first())await removeRows(db,change,'oa_dev_credentials',"id IN (SELECT id FROM oa_sessions WHERE operator_id IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?)) OR id IN (SELECT id FROM oa_tokens WHERE operator_id IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?))",[id,id])
  await updateRows(db,change,'oa_sessions',{revoked_at:Date.parse(ctx.now)},'operator_id IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?)',[id])
  await updateRows(db,change,'oa_tokens',{revoked_at:Date.parse(ctx.now)},'operator_id IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?)',[id])
  append(change,await createMemberEvidenceErasure(db)(ctx,id,label))
  const mentions=await db.prepare('SELECT id,mentions_json FROM evidence_comments WHERE EXISTS(SELECT 1 FROM json_each(mentions_json) WHERE value=?)').bind(id).all<{id:string;mentions_json:string}>()
  for(const comment of mentions.results)await updateRows(db,change,'evidence_comments',{mentions_json:JSON.stringify((JSON.parse(comment.mentions_json) as string[]).filter(member=>member!==id))},'id=?',[comment.id])
  for(const object of objects.erase){keys.push(object.key);if(object.fileId)await updateRows(db,change,'evidence_files',{state:'erased',filename:'erased',updated_at:ctx.now},'id=?',[object.fileId])}
  // FILE-002: store references the person attached and the file-store connections they own leave with them.
  for(const d of registry.list())for(const f of d.fields.values())if(f.field.type==='attachment'&&f.join)await removeRows(db,change,f.join.table.tableId,"CASE WHEN substr(value,1,1)='{' AND json_valid(value) THEN json_extract(value,'$.attachedBy') END=?",[id])
  await removeRows(db,change,'connection_credentials',"connection_id IN (SELECT id FROM provider_connections WHERE owner_id=?)",[id])
  await updateRows(db,change,'provider_connections',{state:'revoked',revoked_at:ctx.now,remote_revocation_state:'erased',updated_at:ctx.now},'owner_id=? AND revoked_at IS NULL',[id])
  keys.push(...inputKeys)
  for(const row of encrypted.results)await updateRows(db,change,'execution_attempts',{sealed_input:null,reconcile_input:null,payload_erased_at:ctx.now},'id=?',[row.id])
  const app=(await db.prepare('SELECT app_id FROM authority_memberships WHERE principal_id=? ORDER BY app_id LIMIT 1').bind(id).first<{app_id:string}>())!
  const warehouseKeys=(await db.prepare('SELECT object_key FROM warehouse_objects ORDER BY object_key').all<{object_key:string}>()).results.map(row=>row.object_key)
  change.guards.push(warehouseObjectInventoryGuard(warehouseKeys))
  await updateRows(db,change,'warehouse_exports',{watermark_json:'{}'},'1=1',[])
  retainCleanup(change,{id,appId:app.app_id,kind:'member',subjectId:id,label,now:ctx.now,keys,warehouseKeys})
  return {...change,commit:custody.commit,plan:{places:[...planned,...custody.custodyPlaces,{store:'R2 warehouse export copies',action:'delete' as const,rows:warehouseKeys.length,reason:'all retained scheduled export copies retired by person erasure'},{store:'R2 private intake files',action:'delete' as const,rows:objects.erase.length,reason:'their own uploads that carry their identity'},{store:'R2 execution inputs',action:'delete' as const,rows:encrypted.results.length,reason:'captured inputs of runs they started or held'}],kept:[...residual,...custody.residual,...objects.residual,...objects.notInspected?[{store:'R2 files not inspected',rows:objects.notInspected,reason:'not_inspected'}]:[]]}}
 },
 }
}
