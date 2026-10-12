import { createBaseExport } from '../../../domains/records/base-transfer/export-json.server'
import { baseExportHttp } from '../../../domains/records/base-transfer/export-http.server'
import { prepareJsonSource } from '../../../domains/records/base-transfer/source-json'
import { previewJsonImport } from '../../../domains/records/base-transfer/plan-json'
import { createJsonIdentityPreflight } from '../../../domains/records/base-transfer/json-identities.server'
import { createBaseImportService } from '../../../domains/records/base-transfer/service.server'
import { baseImportHttp } from '../../../domains/records/base-transfer/http.server'
import { createImportPreviewAuthentication } from '../../../domains/records/base-transfer/authority-preview.server'
import { prepareCsvSource, allocateImportIdentities } from '../../../domains/records/base-transfer/source'
import { previewBaseImport } from '../../../domains/records/base-transfer/plan'
import { createRecordsCsv } from '../../../domains/records/csv.server'
import { recordsCsvHttp } from '../../../domains/records/csv-http.server'
import { createManualSchemas } from '../../../domains/records/manual/service.server'
import { manualSchemaHttp } from '../../../domains/records/manual/http.server'
import { registerRecordActions, createAuthorizedRecordCreatePreparer } from '../../../domains/records/actions.server'
import { registerRecordFormActions } from '../../../domains/records/form-actions.server'
import type { Platform } from '../../platform'
import type { ServerFoundation } from '../foundation.server'
import { ApiError } from '../../registry/errors'
import { createReferenceAccess } from '../../../domains/authority/reference.server'
import { createModelConfiguration } from '../../../domains/execution/configuration.server'
import { createModelEgress } from '../../../domains/execution/egress.server'
import { createEvidenceWriteAccess } from '../../../domains/evidence/write-access.server'
import { createSourceService } from '../../../domains/evidence/source.server'
import { createEvidenceDetail } from '../../../domains/evidence/detail.server'
import { createEvidenceAttachmentPort } from '../../../domains/evidence/attachments.server'
import { prepareCanonicalInvalidation } from '../../../domains/evidence/canonical-invalidation.server'
import { createCaseReferenceReader } from '../../../domains/operations/references.server'
import { createRecordServices } from '../../../domains/records/service.server'
import { createRecordHttp } from '../../../domains/records/routes.server'
import { createEvidenceHttp } from '../../../domains/evidence/http.server'
import { createEvidenceHistoryHttp } from '../../../domains/evidence/history-http.server'
import { createAuditReader } from '../../../domains/admission/audit.server'
import type { EvidenceDependencies } from '../../../domains/evidence/ports'
import { REPAIRS_APP_ID } from '../../../apps/repairs/model'
import { resolveRepairCapture } from '../../../apps/repairs/capture.server'

export function createRecordsComposition(platform: Platform, foundation: ServerFoundation) {
  const db=platform.bindings.DB, {policy,descriptors,entities,admission}=foundation
  const modelConfiguration=createModelConfiguration({db,policy,async currentRelease(_ctx,appId){
    const live=await db.prepare("SELECT l.release_id FROM live_app_releases l JOIN app_releases r ON r.id=l.release_id WHERE l.app_id=? AND r.state='live' AND r.source_hash=l.source_hash").bind(appId).first<{release_id:string}>()
    if(!live)throw new ApiError('unconfigured','This application has no adopted model runtime release.')
    return {releaseId:live.release_id}
  }})
  const deps:EvidenceDependencies={db,bucket:platform.bindings.FILES,policy,admission,access:{
    checkReference:async(ctx,ref,fields,purpose)=>{await createReferenceAccess(db,policy,entities)(ctx,ref,fields,purpose)},
    prepareWrite:createEvidenceWriteAccess(db,policy,descriptors),
    egress:createModelEgress({db,policy,profile:modelConfiguration.profile}),
  }}
  const sources=createSourceService(deps)
  const activeCases=createCaseReferenceReader({db,policy,descriptors,evidence:sources})
  const services=createRecordServices(db,descriptors,policy,platform.auth.configuration.sessionSecret,
    createEvidenceDetail(deps,activeCases),createEvidenceAttachmentPort(deps),
    (ctx,change)=>prepareCanonicalInvalidation(db,ctx,change.before))
  registerRecordActions(foundation.commands,{...services,async deleteEffects(){throw new ApiError('unconfigured','Record deletion requires complete evidence erasure and recovery support. No record was deleted.')}})
  registerRecordFormActions(foundation.commands,{metadata:services.metadata,policy,prepareCreate:createAuthorizedRecordCreatePreparer(services)})
  const manual=createManualSchemas(db,policy,admission,descriptors)
  const importManual=createManualSchemas(db,policy,foundation.inertAdmission,descriptors)
  const jsonIdentities=createJsonIdentityPreflight(db,descriptors)
  const baseImport=createBaseImportService(db,policy,descriptors,importManual,(source,options,ids)=>source.format==='cradle-base-v1'?previewJsonImport(source,options,ids):previewBaseImport(source,options,ids))
  const audit=createAuditReader(db,policy,(ctx,ref)=>deps.access.checkReference(ctx,ref,[],'read'),{
    cursorSecret:platform.auth.configuration.sessionSecret,
    projectCell:services.reader.projectCell,
    async projectSourceIds(ctx,ids){const allowed:string[]=[];for(const id of ids){try{await sources.source(ctx,id);allowed.push(id)}catch(error){if(!(error instanceof Error)||!('code' in error)||!['forbidden','not_found'].includes(String(error.code)))throw error}}return allowed},
  })
  const authenticate=(request:Request,requestId:string)=>foundation.authenticate(request,'http',requestId)
  const evidenceHttp=createEvidenceHttp({...deps,authenticate,cursorSecret:platform.auth.configuration.sessionSecret,
    async resolveCapture(ctx,appId,subject,kind){
      if(appId===REPAIRS_APP_ID)return resolveRepairCapture({db,policy})(ctx,appId,subject,kind)
      if(!subject||subject.appId!==appId)throw new ApiError('validation','Capture requires the current record or intake subject.')
      const descriptor=descriptors.get(appId,subject.entityId),scope=await policy.scope(ctx,{appId,entityId:subject.entityId,purpose:'read'})
      const fieldIds=descriptor.schema.fields.filter(field=>!field.readOnly&&scope.writableFieldIds.includes(field.id)&&scope.readableFieldIds.includes(field.id)&&(kind==='file'?field.type==='attachment':['text','attachment'].includes(field.type))).map(field=>field.id)
      if(!fieldIds.length)throw new ApiError('forbidden','This record has no writable source fields.')
      await deps.access.prepareWrite(ctx,subject,fieldIds,kind==='file'?'upload':'capture')
      return {subject,fieldIds}
    },
  })
  return {deps,sources,services,audit,modelConfiguration,evidenceHttp,baseExportHttp:baseExportHttp(createBaseExport(db,services),foundation.authenticate),baseImportHttp:baseImportHttp(baseImport,{prepare:artifacts=>artifacts.length===1&&artifacts[0]!.filename.toLowerCase().endsWith('.json')?prepareJsonSource(artifacts[0]!):prepareCsvSource(artifacts),identities:source=>source.format==='cradle-base-v1'?jsonIdentities.allocate(source):allocateImportIdentities(source),validateIdentities:(source,ids)=>source.format==='cradle-base-v1'?jsonIdentities.validate(source,ids):undefined},foundation.authenticate,createImportPreviewAuthentication(db,platform.auth.configuration)),csvHttp:recordsCsvHttp(createRecordsCsv(db,services,admission),foundation.authenticate),manualHttp:manualSchemaHttp(manual,foundation.authenticate),
    http:createRecordHttp({...services,authenticate:foundation.authenticate}),
    historyHttp:createEvidenceHistoryHttp({...deps,authenticate,audit,cursorSecret:platform.auth.configuration.sessionSecret}),
  }
}
