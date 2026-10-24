import type {RequestContext} from '../authority/ports';
import type {EvidenceDependencies} from '../evidence/ports';
import type {createErasureService} from '../evidence/erasure.server';
import {hash,parse} from '../evidence/shared.server';
import {exists,registerTable,eq,and} from '../admission/sql.server';
const previews=registerTable('portability_previews',['id','app_id','entity_id','file_id']);
/** Deletes the retained import artifact, preserving the records that import admitted. */
export function createImportDeletion(deps:EvidenceDependencies,erasure:ReturnType<typeof createErasureService>){return async(ctx:RequestContext,input:{commandId:string;previewId:string})=>{
 const p=await deps.db.prepare('SELECT p.app_id,p.entity_id,p.file_id,f.entity_id file_entity_id,f.record_id,f.field_ids FROM portability_previews p JOIN evidence_files f ON f.id=p.file_id WHERE p.id=?').bind(input.previewId).first<{app_id:string;entity_id:string;file_id:string;file_entity_id:string;record_id:string;field_ids:string}>();if(!p)throw new Error('Import not found');
 const subject={appId:p.app_id,entityId:p.file_entity_id,recordId:p.record_id};await deps.access.checkReference(ctx,subject,parse(p.field_ids),'read');
 const inputHash=await hash(JSON.stringify(input)),permit=await deps.policy.authorize(ctx,{appId:p.app_id,targetEntityId:p.entity_id,action:'import.delete',expected:[],cost:[],inputHash,commandId:input.commandId}),effects=await erasure.prepareEffects(ctx,subject);
 return deps.admission.commit(ctx,{commandId:input.commandId,appId:p.app_id,action:'import.delete',canonicalInputHash:inputHash,permit,guards:[...effects.guards,exists(previews,and(eq(previews,'id',input.previewId),eq(previews,'file_id',p.file_id)))],mutations:effects.mutations,audit:[{action:'import.delete',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[{name:'privacy.erasure-requested',version:1,subject:null,payload:{erasureId:effects.erasureJobId},causeRunIds:[]}],outbox:[],committedResult:{id:input.previewId,erasureJobId:effects.erasureJobId,state:'erasing'}});
};}
