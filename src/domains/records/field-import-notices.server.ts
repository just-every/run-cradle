import type {RequestContext} from '../authority/ports';
import type {BasePreview} from './base-transfer/contracts';
import type {RecordNoticeEffects} from './effects.server';
import type {createRecordServices} from './service.server';
import type {AdmissionPort} from '../admission/ports';
import {canonicalHash} from '../admission/canonical';
import {createUlid} from '../../core/shared/ids';

/** Completed imports publish idempotent assignment facts only after explicit choice. */
export function createImportAssignmentNotices(db:D1Database,services:ReturnType<typeof createRecordServices>,admission:AdmissionPort,notices:RecordNoticeEffects){
 return async(ctx:RequestContext,preview:BasePreview)=>{
  if(preview.options.notifications!==true)return;
  for(const imported of preview.records){
   const ref={appId:preview.identities.appId,entityId:imported.entityId,recordId:imported.recordId},descriptor=services.descriptors.get(ref.appId,ref.entityId);
   if(!descriptor.schema.fields.some(f=>f.type==='person'&&f.notifyOnAdd!==false))continue;
   const marker=`import-assignment:${ref.recordId}`;
   if(await db.prepare('SELECT 1 FROM record_import_notice_receipts WHERE record_id=?').bind(ref.recordId).first())continue;
   const scope=await services.policy.scope(ctx,{appId:ref.appId,entityId:ref.entityId,purpose:'read'}),raw=await services.reader.raw(ctx,scope,ref);
   if(!raw||Number(raw[descriptor.versionColumn])!==1)continue;
   const record=await services.reader.record(ctx,scope,ref),effect=await notices(ctx,{before:null,after:record,row:raw as Record<string,import('../admission/ports').SqlScalar>}),commandId=createUlid(),hash=await canonicalHash({marker}),permit=await services.policy.authorize(ctx,{appId:ref.appId,action:'import.commit',expected:[],cost:[],inputHash:hash,commandId});
   const {registerTable,trustedPredicate}=await import('../admission/sql.server');
   const receipts=registerTable('record_import_notice_receipts',['record_id','app_id','created_at']);
   await admission.commit(ctx,{commandId,action:'import.commit',appId:ref.appId,canonicalInputHash:hash,permit,guards:[...scope.currentAuthorityGuards,...effect.guards,trustedPredicate('NOT EXISTS(SELECT 1 FROM record_import_notice_receipts WHERE record_id=?)',[ref.recordId])],mutations:[...effect.mutations,{kind:'insert',table:receipts,row:{record_id:ref.recordId,app_id:ref.appId,created_at:ctx.now}}],audit:[],events:[],outbox:[],committedResult:{recordId:ref.recordId}});
  }
 };
}
