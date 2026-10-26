import {AuthorityError} from '../../authority/errors'
import { Buffer } from 'node:buffer'
import {restoredJobAuthority} from './restored-job.server'
import { requireCsvCapacityAcceptance } from './csv-capacity'
import { assertSourceSize } from '../../../../vendor/base/modules/import-kit/src/plan/size'
import { importCapacityError } from './plan-capacity'
import { createUlid } from '../../../core/shared/ids'
import type { RequestContext, PolicyPort } from '../../authority/ports'
import type { DescriptorRegistry } from '../descriptors.server'
import type { createManualSchemas } from '../manual/service.server'
import { createPolicyPort } from '../../authority/policy.server'
import { createApplicationEntityRegistry } from '../../../core/app/composition/entities.server'
import { loadDescriptorRegistry } from '../loader.server'
import { AdmissionError } from '../../admission/errors'
import { manualAuthority } from '../manual/authority.server'
import { retainReview, loadReview, type StoredReview } from './storage-review.server'
import { importAuthority, authoritySize } from './authority.server'
import { createNativeImportTarget } from './target.server'
import { nativeSource, mappingVersion } from './storage.server'
import { prepareNativePlan } from './storage-plan.server'
import { preflightUpload } from './upload-plan.server'
import { prepareReviewRetention } from './review-retention'
import { importReversalReport, completeImportUndoReport } from './undo-report.server'
import { authorizeUndoReport } from './undo-privacy.server'
import { buildReceipt, isAttachmentColumn } from './receipt'
import { attachmentManifestCsv, parseApiAttachmentValue, parseCsvAttachmentCell } from './attachment-manifest'
import { prepareCsvSource } from './source'
import { nonempty } from './format'
import type { BasePreview, ReviewAcknowledgment, AdoptAcknowledgment, ImportStatus, PreparedSource, ImportOptions, ImportIdentities } from './contracts'
import { createD1ImportJob, planD1Import, resumeD1Import, undoD1Import, rollbackD1Import, readD1ImportJob, readD1ImportOriginals, readD1PersistedImport, sha256, canonicalJson } from '../../../../vendor/base/modules/import-kit/src/d1/index'
import { requestContext } from '../../../../vendor/base/modules/import-kit/src/d1/budget'
import { stored } from '../../../../vendor/base/modules/import-kit/src/d1/jobs'
import type { D1ImportContext } from '../../../../vendor/base/modules/import-kit/src/d1/types'
import type { ImportJob, Reconciliation } from '../../../../vendor/base/modules/import-kit/src/types'
import {progressAttemptStatements,settleProgressAttempt,deliverOwedProgress} from '../../channels/progress-owed.server'

export type PreviewBuilder=(source:PreparedSource,options:ImportOptions,identities:ImportIdentities)=>BasePreview|Promise<BasePreview>
export function createBaseImportService(db:D1Database,policy:PolicyPort,registry:DescriptorRegistry,manual:ReturnType<typeof createManualSchemas>,buildPreview:PreviewBuilder){
 async function preview(source:PreparedSource,options:ImportOptions,identities:ImportIdentities){return buildPreview(source,options,identities)}
 async function uploadPreview(ctx:RequestContext,source:PreparedSource,options:ImportOptions,identities:ImportIdentities){try{assertSourceSize(source.bundle)}catch(error){importCapacityError(error)}const result=await buildPreview(source,options,identities);return preflightUpload(db,policy,registry,ctx,result)}
 async function review(ctx:RequestContext,input:BasePreview,ack:ReviewAcknowledgment){
  const checked=await uploadPreview(ctx,input.source,input.options,input.identities)
  requireCsvCapacityAcceptance(checked)
  if(checked.fingerprint!==input.fingerprint||ack.fingerprint!==checked.fingerprint)throw new AdmissionError('version_conflict','Mapping changed. Review the current import again.')
  if(checked.acknowledgmentRequired&&!ack.acceptLoss)throw new AdmissionError('validation','Acknowledge semantic losses, converted or rejected values and unresolved or ambiguous links before schema review.')
  if(await db.prepare('SELECT 1 FROM manual_record_bases WHERE id=?').bind(checked.identities.appId).first())throw new AdmissionError('validation','A base import creates a new base only.')
  const retained=prepareReviewRetention(checked)
  const schemaImpact=await manual.preview(ctx,checked.schemaDraft,(checked.portableViews??[]).map(raw=>{const {tableId,...view}=raw as unknown as import('./json-format').PortableBase['base']['views'][number];return {id:view.id,visibility:view.visibility,definition_json:JSON.stringify({...view,appId:checked.identities.appId,entityId:tableId})}})),id=createUlid(),permit=await manualAuthority(db,policy,ctx,checked.identities.appId,'0'.repeat(64))
  const row={id,app_id:checked.identities.appId,principal_id:ctx.principal.id,fingerprint:checked.fingerprint,schema_preview_id:schemaImpact.id,created_at:ctx.now}
  const physical=await prepareNativePlan(db,policy,registry,ctx,row,checked)
  await retainReview(db,{...row,physical_fingerprint:physical.plan.fingerprint,schema_fingerprint:physical.schemaFingerprint},retained,permit.guards)
  return {reviewId:id,fingerprint:checked.fingerprint,physicalFingerprint:physical.plan.fingerprint,plannedAt:ctx.now,planSize:physical.planSize,schemaImpact}
 }
 const readReview=(ctx:RequestContext,id:string)=>loadReview(db,id,ctx.principal.id)
 async function context(ctx:RequestContext,appId:string,namespace:string):Promise<D1ImportContext>{const current=await loadDescriptorRegistry(db,registry.list()),authority=await importAuthority(db,createPolicyPort(db,createApplicationEntityRegistry(current)),ctx,appId);return {destination:appId,namespace,mappingVersion,storage:{database:db,targets:createNativeImportTarget(current)},authorization:{principalId:ctx.principal.id,predicate:()=>authority},batchSize:20,maxBatches:1}}
 async function adopt(ctx:RequestContext,reviewId:string,ack:AdoptAcknowledgment){
  const {row,detail}=await readReview(ctx,reviewId)
  requireCsvCapacityAcceptance(detail)
  if(ack.fingerprint!==row.fingerprint||detail.acknowledgmentRequired&&!ack.acceptLoss)throw new AdmissionError('version_conflict','Current mapping acknowledgment is required.')
  if(ack.physicalFingerprint!==row.physical_fingerprint)throw new AdmissionError('version_conflict','Current physical plan acknowledgment is required.')
  // A lost creation response must recover the durable job, even if a later
  // schema review changed the live descriptors. Never remap committed custody.
  const prior=await db.prepare('SELECT id,fingerprint FROM ik_jobs WHERE destination=? AND principal_id=? AND operation_key=?').bind(row.app_id,ctx.principal.id,reviewId).first<{id:string;fingerprint:string}>()
  if(prior){
   if(prior.fingerprint!==row.physical_fingerprint)throw new AdmissionError('version_conflict','The stored job does not match this reviewed import plan.')
   const c={...await context(ctx,row.app_id,detail.source.namespace),reviewedFingerprint:row.physical_fingerprint}
   await readD1ImportOriginals(prior.id,c)
   return readD1ImportJob(prior.id,c)
  }
  const prepared=await prepareNativePlan(db,policy,registry,ctx,row,detail)
  if(prepared.plan.fingerprint!==row.physical_fingerprint||prepared.schemaFingerprint!==row.schema_fingerprint)throw new AdmissionError('version_conflict','The physical plan or reviewed schema changed. Review this import again before adoption.')
  await manual.adopt(ctx,reviewId,row.schema_preview_id)
  const current=await loadDescriptorRegistry(db,registry.list()),c=await context(ctx,row.app_id,detail.source.namespace),native=nativeSource(detail,current,row.created_at,ctx.principal.id)
  const plan=await planD1Import(native.source,native.mapping,c)
  const actualAuthority=authoritySize(c.authorization.predicate('create',row.app_id))
  if(actualAuthority.sqlBytes>prepared.authorityReservation.sqlBytes||actualAuthority.boundBytes>prepared.authorityReservation.boundBytes||actualAuthority.parameters>prepared.authorityReservation.parameters)throw new AdmissionError('capacity_limit','Current authority exceeds its reviewed import capacity reservation.')
  if(plan.fingerprint!==row.physical_fingerprint)throw new AdmissionError('version_conflict','Reviewed physical import plan changed during schema adoption.')
  return createD1ImportJob(plan,{...c,reversalPolicy:'preserve-conflicts',reviewedFingerprint:row.physical_fingerprint,operationKey:reviewId})
 }
 async function jobBinding(ctx:RequestContext,id:string){
  const binding=await db.prepare('SELECT destination,namespace,principal_id,cradle_restore_hold FROM ik_jobs WHERE id=?').bind(id).first<{destination:string;namespace:string;principal_id:string;cradle_restore_hold:number}>()
  if(!binding){
   const retired=await db.prepare("SELECT destination,receipt_id FROM ik_d1_retirements WHERE id=? AND kind='job'").bind(id).first<{destination:string;receipt_id:string}>()
   if(retired){await importAuthority(db,policy,ctx,retired.destination);throw new AuthorityError('version_conflict','Import custody was permanently retired by person erasure.',409,{retirementReceiptId:retired.receipt_id})}
   throw new AdmissionError('not_found','Import job not found.')
  }
  if(binding.principal_id!==ctx.principal.id)await restoredJobAuthority(db,ctx,id,binding.principal_id)
  return binding
 }
 async function jobContext(ctx:RequestContext,id:string){
  const binding=await jobBinding(ctx,id),current=await context(ctx,binding.destination,binding.namespace)
  // Original custody IDs remain immutable; authorization predicates use the current owner.
  return {...current,authorization:{...current.authorization,principalId:binding.principal_id}}
 }
 /** Reads the retained job once; status, report.json and the move-in receipt all use this. */
 async function inspect(ctx:RequestContext,id:string){
  const c=requestContext(await jobContext(ctx,id)),job=await readD1ImportJob(id,c),{plan}=await stored(id,c),readback=await readD1PersistedImport(c)
  const row=await db.prepare('SELECT r.* FROM record_import_reviews r JOIN ik_jobs j ON j.operation_key=r.id AND j.destination=r.app_id WHERE j.id=? AND r.principal_id=j.principal_id').bind(job.id).first<StoredReview>();if(!row)throw new AdmissionError('version_conflict','The retained import report was withdrawn by privacy erasure. Remaining job effects can still resume or undo.');const {detail}=await loadReview(db,row.id,row.principal_id)
  const reconciliation:Reconciliation={ok:false,missing:[],duplicate:[],extra:[],mismatched:[]},expected=new Map<string,{hash:string;revision:string}>()
  // Active provenance is independently read by the kit under exact native/set guards.
  for(const p of readback.provenance.filter(p=>p.jobId===id&&!p.reversed)){const key=p.targetKind+':'+p.targetId;if(expected.has(key))reconciliation.duplicate.push(key);expected.set(key,{hash:p.valueHash,revision:p.appliedRevision})}
  const jobTargets=new Set(plan.entries.flatMap(entry=>entry.effects.map(effect=>effect.targetKind+':'+effect.targetId))),seen=new Set<string>()
  for(const native of readback.rows){const key=native.targetKind+':'+native.targetId;if(!jobTargets.has(key)&&!expected.has(key))continue;if(seen.has(key))reconciliation.duplicate.push(key);seen.add(key);const exp=expected.get(key);if(!exp)reconciliation.extra.push(key);else if(exp.hash!==sha256(canonicalJson(native.value))||exp.revision!==native.revision)reconciliation.mismatched.push(key)}
  for(const key of expected.keys())if(!seen.has(key))reconciliation.missing.push(key)
  if(job.state==='completed')for(const entry of plan.entries)for(const effect of entry.effects){const key=effect.targetKind+':'+effect.targetId;if(!expected.has(key))reconciliation.missing.push('provenance:'+key);else if(expected.get(key)!.hash!==sha256(canonicalJson(effect.value)))reconciliation.mismatched.push('plan:'+key)}
  reconciliation.ok=Object.values(reconciliation).filter(Array.isArray).every(a=>a.length===0)
  const current=await loadDescriptorRegistry(db,registry.list()),reversal=await authorizeUndoReport(db,createPolicyPort(db,createApplicationEntityRegistry(current)),ctx,current,job.destination,importReversalReport(await completeImportUndoReport(id,c),expected.size))
  const status:ImportStatus={job,restoreHeld:Boolean((await jobBinding(ctx,id)).cradle_restore_hold),report:{...detail.report,...(reversal?{undo:reversal}:{})},...(reversal?{reversal}:{}),progress:{appliedRecords:readback.rows.filter(r=>r.targetKind.startsWith('record:')&&expected.has(r.targetKind+':'+r.targetId)).length,plannedRecords:detail.records.length,appliedLinkCells:readback.rows.filter(r=>r.targetKind.startsWith('link:')&&expected.has(r.targetKind+':'+r.targetId)).length,plannedLinkCells:plan.entries.flatMap(e=>e.effects).filter(e=>e.targetKind.startsWith('link:')).length},reconciliation,schemaRetainedAfterUndo:true}
  return {status,detail,row,plan,expected,context:c}
 }
 async function status(ctx:RequestContext,id:string):Promise<ImportStatus>{return (await inspect(ctx,id)).status}
 async function receipt(ctx:RequestContext,id:string){
  const {status,detail,row,plan,expected,context:c}=await inspect(ctx,id),originals=await readD1ImportOriginals(id,c),pendingByEntity=new Map<string,{records:number;linkCells:number}>()
  if(['queued','applying','failed'].includes(status.job.state))for(const effect of plan.entries.flatMap(e=>e.effects)){
   if(expected.has(effect.targetKind+':'+effect.targetId))continue
   const [kind,entityId]=effect.targetKind.split(':'),counts=pendingByEntity.get(entityId!)??{records:0,linkCells:0}
   if(kind==='record')counts.records++;else if(kind==='link')counts.linkCells++;pendingByEntity.set(entityId!,counts)
  }
  return buildReceipt({status,source:detail.source,records:detail.records,identities:detail.identities,baseName:detail.schemaDraft.name,reviewedAt:row.created_at,generatedAt:new Date().toISOString(),
   files:originals.map(o=>({name:o.name,size:o.size,sha256:o.sha256})),pendingByEntity})
 }
 /** One line per nonempty cell of a skipped attachment column, from the retained original bytes. */
 async function attachmentManifest(ctx:RequestContext,id:string,tableKey:string,columnKey:string){
  const {status,detail,context:c}=await inspect(ctx,id),table=status.report.tables.find(t=>t.tableKey===tableKey),column=table?.columns.find(k=>k.columnKey===columnKey)
  if(!table||!column||!isAttachmentColumn(column))throw new AdmissionError('not_found','No skipped attachment column has that name in this import.')
  const retained=detail.source.tables.find(t=>t.key===tableKey)!,primary=retained.primaryColumnKey??table.primaryColumnKey
  const csv=detail.source.format==='csv-set'
  // CSV cells are read again from the exact retained files; recorded API values are the retained page values.
  const rows=csv?prepareCsvSource((await readD1ImportOriginals(id,c)).filter(o=>'base64' in o.original&&detail.source.tables.some(t=>t.key===o.name)).map(o=>({filename:o.name,bytes:Buffer.from((o.original as {base64:string}).base64,'base64')}))).tables.find(t=>t.key===tableKey)!.rows:retained.rows
  const lines=rows.filter(r=>nonempty(r.values[columnKey])).map(r=>({sourceFile:r.location.artifact,rowOrdinal:Number(r.key.replace(/^row-/,''))||rows.indexOf(r)+1,...(csv?{sourceLine:r.location.row}:{}),
   primary:typeof r.values[primary]==='string'?r.values[primary] as string:JSON.stringify(r.values[primary]??''),column:column.label,
   raw:typeof r.values[columnKey]==='string'?r.values[columnKey] as string:JSON.stringify(r.values[columnKey]),
   attachments:csv?parseCsvAttachmentCell(String(r.values[columnKey])):parseApiAttachmentValue(r.values[columnKey]!)}))
  return {filename:`${table.label}-${column.label}-attachments.csv`,lines,csv:attachmentManifestCsv(lines)}
 }
 async function act(ctx:RequestContext,id:string,operation:'resume'|'undo'|'rollback'):Promise<ImportJob>{
  const c=await jobContext(ctx,id),authority=c.authorization.predicate(operation==='resume'?'apply':operation,c.destination)
  await db.prepare(`UPDATE ik_jobs SET cradle_restore_hold=0 WHERE id=? AND cradle_restore_hold=1 AND (${authority.sql})`).bind(id,...(authority.params??[])).run()
  if((await jobBinding(ctx,id)).cradle_restore_hold)throw new AdmissionError('forbidden','Current base owner authority is required to continue this restored import.')
  if(operation!=='resume')return operation==='undo'?undoD1Import(id,c):rollbackD1Import(id,c)
  const before=await readD1ImportJob(id,c),starterId=before.principalId
  if(['undone','rolling_back','rolled_back','undoing'].includes(before.state))return resumeD1Import(id,c)
  const eventId=`base-import:${id}:failed`,token=crypto.randomUUID(),liveUntil=new Date(Date.now()+300000).toISOString()
  const notify=(outcome:'completed'|'failed')=>deliverOwedProgress(db,ctx.ingress,`base-import:${id}:${outcome}`)
  if(before.state==='completed'){const job=await resumeD1Import(id,c);await notify('completed');return job}
  // A failed write-ahead batch refuses the attempt before the kit applies work.
  await db.batch(await progressAttemptStatements(db,{subjectType:'base-import',subjectId:id,starterId,eventId,outcome:'failed'},token,liveUntil))
  // The same live token fences every native apply batch, so a request whose
  // journal lease expired cannot apply records after recovery published failure.
  const attemptContext={...c,authorization:{...c.authorization,predicate:(action:Parameters<typeof c.authorization.predicate>[0],destination:string)=>{
   const authority=c.authorization.predicate(action,destination)
   return {sql:`(${authority.sql}) AND EXISTS(SELECT 1 FROM channel_progress_attempts WHERE event_id=? AND token=? AND live_until>strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,params:[...(authority.params??[]),eventId,token]}
  }}}
  let job:ImportJob
  try{job=await resumeD1Import(id,attemptContext)}catch(error){
   try{await settleProgressAttempt(db,eventId,token,true)}catch(journal){if(error instanceof Error)Object.defineProperty(error,'cause',{value:journal,configurable:true})}
   // Publication may fail only after the failure fact is durable. The original
   // import error remains the response cause; the tick recovers the journal.
   try{await notify('failed')}catch{}
   throw error
  }
  await settleProgressAttempt(db,eventId,token,job.state==='failed')
  if(job.state==='completed')await notify('completed')
  else if(job.state==='failed')await notify('failed')
  return job
 }
 return {preview,uploadPreview,review,adopt,status,receipt,attachmentManifest,resume:(ctx:RequestContext,id:string)=>act(ctx,id,'resume'),undo:(ctx:RequestContext,id:string)=>act(ctx,id,'undo'),rollback:(ctx:RequestContext,id:string)=>act(ctx,id,'rollback'),originals:async(ctx:RequestContext,id:string)=>readD1ImportOriginals(id,await jobContext(ctx,id))}
}
