import type { RequestContext,PolicyPort } from '../authority/ports';
import type { AdmissionPort } from '../admission/ports';
import type { EvidencePort } from '../evidence/ports';
import { registerTable,trustedPredicate } from '../admission/sql.server';
import type { ConstructionSourcesPort } from './ports';
import { sourceEntityId } from './contracts';
import type { SourceSnapshot } from './contracts';
import { createUlid } from '../../core/shared/ids';
import { bundle,canonical,digest,validateFiles } from './source';
export const sourceTable=registerTable('construction_source_snapshots',['id','app_id','source_hash','parent_id','producer_id','detail_json','created_at']);
export const sourceHeadTable=registerTable('app_source_heads',['app_id','snapshot_id','source_hash','version']);
export class ConstructionSources implements ConstructionSourcesPort {
 constructor(readonly db:D1Database,readonly policy:PolicyPort,readonly admission:AdmissionPort,readonly evidence:EvidencePort,readonly contextConfig:{profileId:string;fieldIds:string[]}){}
 async context(ctx:RequestContext,appId:string,sourceIds:string[],purpose:string){const refs=[];for(const id of sourceIds)refs.push((await this.evidence.source(ctx,id)).ref);const artifact=await this.evidence.buildContext(ctx,{appId,purpose,refs,fieldIds:this.contextConfig.fieldIds,profileId:this.contextConfig.profileId});return{modelContext:artifact,artifactId:artifact.id,sha256:artifact.sha256,sourceIds:refs.map(r=>r.id),sourceVersions:refs.map(r=>({id:r.id,version:r.version})),contextPurpose:artifact.purpose,permittedFieldIds:artifact.fieldIds};}
 async snapshot(ctx:RequestContext,id:string):Promise<SourceSnapshot>{const row=await this.db.prepare('SELECT app_id,detail_json FROM construction_source_snapshots WHERE id=?').bind(id).first<{app_id:string;detail_json:string}>();if(!row)throw new Error('source_not_found');await this.policy.authorize(ctx,{appId:row.app_id,action:'source.read',expected:[{ref:{appId:row.app_id,entityId:sourceEntityId,recordId:id},version:1}],cost:[],inputHash:await digest(id)});const value:SourceSnapshot=JSON.parse(row.detail_json);if(await digest(bundle(value.files))!==value.sha256)throw new Error('source_snapshot_corrupt');return value;}
 async persist(ctx:RequestContext,snapshot:SourceSnapshot){validateFiles(snapshot.files);if(await digest(bundle(snapshot.files))!==snapshot.sha256)throw new Error('source_snapshot_corrupt');const action='source.prepare',commandId=snapshot.id,inputHash=await digest(canonical(snapshot)),permit=await this.policy.authorize(ctx,{appId:snapshot.appId,action,expected:[],targetEntityId:sourceEntityId,cost:[],inputHash,commandId});await this.admission.commit(ctx,{commandId,action,appId:snapshot.appId,canonicalInputHash:inputHash,permit,guards:[],mutations:[{kind:'insert',table:sourceTable,row:{id:snapshot.id,app_id:snapshot.appId,source_hash:snapshot.sha256,parent_id:snapshot.parentId,producer_id:snapshot.producerId,detail_json:canonical(snapshot),created_at:snapshot.createdAt}}],audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[snapshot.id]}],events:[],outbox:[],committedResult:{id:snapshot.id,sha256:snapshot.sha256}});}
 async current(ctx:RequestContext,appId:string){const row=await this.db.prepare('SELECT snapshot_id FROM app_source_heads WHERE app_id=?').bind(appId).first<{snapshot_id:string}>();return row?this.snapshot(ctx,row.snapshot_id):null;}
 async edit(ctx:RequestContext,commandId:string,input:{appId:string;expectedSnapshotId:string;files:SourceSnapshot['files']}){
  const prior=await this.current(ctx,input.appId);if(!prior||prior.id!==input.expectedSnapshotId)throw new Error('source_custody_conflict');
  const snapshot:SourceSnapshot={id:createUlid(),appId:input.appId,sha256:await digest(bundle(input.files)),files:input.files,parentId:prior.id,producerId:ctx.principal.id,createdAt:ctx.now};await this.persist(ctx,snapshot);
  const action='source.edit',inputHash=await digest(canonical(input)),permit=await this.policy.authorize(ctx,{appId:input.appId,action,expected:[{ref:{appId:input.appId,entityId:sourceEntityId,recordId:prior.id},version:1}],cost:[],inputHash,commandId});
  await this.admission.commit(ctx,{commandId,action,appId:input.appId,canonicalInputHash:inputHash,permit,guards:[],mutations:[{kind:'update',table:sourceHeadTable,set:{snapshot_id:snapshot.id,source_hash:snapshot.sha256,version:Date.now()},where:trustedPredicate('app_id=? AND snapshot_id=?',[input.appId,prior.id]),expectedRows:1}],audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[snapshot.id]}],events:[],outbox:[],committedResult:snapshot});return snapshot;
 }
}
