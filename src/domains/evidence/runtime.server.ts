import type {Ref} from '../../contracts/primitives';
import type {RequestContext} from '../authority/ports';
import type {DescriptorRegistry,EntityDescriptor} from '../records/descriptors.server';
import type {createRecordReader} from '../records/query.server';
import type {createRecordWriter} from '../records/change.server';
import type {ModelPort} from '../execution/model-ports';
import type {ArchivePolicy} from '../portability/archive-schema.server';
import type {ImportAdapter} from '../portability/import.server';
import type {EvidenceDependencies,ProposalActionPort} from './ports';
import {createSourceService} from './source.server';
import {createFileService} from './files.server';
import {createLineageService} from './lineage.server';
import {createRecordContextService} from './record-context.server';
import {createSourceStaging,STAGING_FILES,STAGING_TEXT,STAGING_ENTITY} from './staging.server';
import {createClaimService} from './claims.server';
import {createProposalService} from './proposals.server';
import {createExtractionService,type ExtractionEvaluation} from './extraction.server';
import {createCommentService,type MentionPort} from './comments.server';
import {createEvidenceReader} from './read.server';
import {createEvidencePort} from './service.server';
import {createEvidenceDetail} from './detail.server';
import {createEvidenceAttachmentPort} from './attachments.server';
import {createErasureService,type ErasurePort} from './erasure.server';
import {createErasureMaintenance,type ErasureCleanupCapability,type CleanupScope} from './cleanup.server';
import {createEvidenceHttp,type EvidenceHttpDependencies} from './http.server';
import {createEvidenceHistoryHttp} from './history-http.server';
import {createImportService} from '../portability/import.server';
import {createRecordImportAdapter} from '../portability/record-import.server';
import {createImportDeletion} from '../portability/delete-import.server';
import {createArchiveService} from '../portability/archive.server';
import {createPortabilityHttp} from '../portability/http.server';
export type EvidenceRuntimePorts={
 cursorSecret:string;registry:DescriptorRegistry;records:{reader:ReturnType<typeof createRecordReader>;writer:ReturnType<typeof createRecordWriter>};
 authenticate:EvidenceHttpDependencies['authenticate'];resolveBusinessCapture:EvidenceHttpDependencies['resolveCapture'];
 model:ModelPort;evaluations(profileId:string,fieldIds:string[]):Promise<ExtractionEvaluation[]>;proposals:ProposalActionPort;mentions:MentionPort;
 erasure:ErasurePort;cleanupPorts(capability:ErasureCleanupCapability):ErasurePort;cleanupScopes(jobId:string):Promise<CleanupScope[]>;
 activeCases(ctx:RequestContext,ref:Ref):Promise<string[]>;casesForPlans(planIds:string[]):Promise<string[]>;
 legacyImportAdapter(ctx:RequestContext,descriptor:EntityDescriptor):Promise<ImportAdapter>;
 archivePolicy(ctx:RequestContext):ArchivePolicy;
 audit:Parameters<typeof createEvidenceHistoryHttp>[0]['audit'];
};
/** Owns E's service graph; external capabilities remain explicit actual domain ports. */
export function createEvidenceRuntime(deps:EvidenceDependencies,ports:EvidenceRuntimePorts){
 const sources=createSourceService(deps),files=createFileService(deps),lineage=createLineageService(deps),recordContexts=createRecordContextService(deps,ports.registry),staging=createSourceStaging(deps),claims=createClaimService(deps),proposals=createProposalService(deps,ports.proposals),extraction=createExtractionService(deps,ports.model,ports.evaluations),comments=createCommentService(deps,ports.mentions),reader=createEvidenceReader(deps,ports.cursorSecret),evidence=createEvidencePort(deps,ports.casesForPlans),detail=createEvidenceDetail(deps,ports.activeCases),attachments=createEvidenceAttachmentPort(deps),erasure=createErasureService(deps,ports.erasure),maintain=createErasureMaintenance(deps,ports.cleanupPorts,ports.cleanupScopes),deleteImport=createImportDeletion(deps,erasure);
 async function imports(ctx:RequestContext,appId:string,entityId:string,mergeFieldIds:string[]){const descriptor=ports.registry.get(appId,entityId),adapter=descriptor.legacy?await ports.legacyImportAdapter(ctx,descriptor):createRecordImportAdapter(deps.db,descriptor,deps.policy,ports.records.writer,mergeFieldIds,ports.records.reader);return createImportService(deps.db,deps.policy,deps.admission,adapter);}
 async function importByPreview(ctx:RequestContext,id:string){const p=await deps.db.prepare('SELECT app_id,entity_id,preview_json FROM portability_previews WHERE id=? AND actor_id=?').bind(id,ctx.principal.id).first<{app_id:string;entity_id:string;preview_json:string}>();if(!p)throw new Error('Preview not found');return imports(ctx,p.app_id,p.entity_id,JSON.parse(p.preview_json).mergeFieldIds??[]);}
 const archive=(ctx:RequestContext)=>createArchiveService(deps.db,deps.bucket,ports.archivePolicy(ctx),{policy:deps.policy,admission:deps.admission});
 const resolveCapture:EvidenceHttpDependencies['resolveCapture']=async(ctx,appId,subject,kind)=>{if(subject?.entityId===STAGING_ENTITY){if(subject.appId!==appId)throw new Error('Staging app differs');const fieldIds=kind==='file'?[STAGING_FILES]:[STAGING_FILES,STAGING_TEXT];await deps.access.prepareWrite(ctx,subject,fieldIds,kind==='file'?'upload':'capture');return{subject,fieldIds};}return ports.resolveBusinessCapture(ctx,appId,subject,kind);};
 const http=createEvidenceHttp({...deps,cursorSecret:ports.cursorSecret,authenticate:ports.authenticate,resolveCapture}),historyHttp=createEvidenceHistoryHttp({...deps,authenticate:ports.authenticate,audit:ports.audit,cursorSecret:ports.cursorSecret}),portabilityHttp=createPortabilityHttp({authenticate:ports.authenticate,archive,files,imports,importByPreview,deleteImport,preview:async(ctx,id)=>(await importByPreview(ctx,id)).readPreview(ctx,id)});
 return{sources,files,lineage,recordContexts,staging,claims,proposals,extraction,comments,reader,evidence,detail,attachments,erasure,maintain,deleteImport,imports,importByPreview,archive,http,historyHttp,portabilityHttp};
}
