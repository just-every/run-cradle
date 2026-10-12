import type { RequestContext } from '../authority/ports';
import type { CandidateDetail } from '../construction/contracts';
import type { RecoveryPlan,Release } from './contracts';
import type { RecoveryVerifierPort } from './rehearsal.server';
import type { SqlMutation,SqlPredicate,SqlScalar } from '../admission/ports';
import { schemaTable } from '../records/change.server';
import { compileSchema } from '../records/descriptors.server';
import type { EntitySchema } from '../records/contracts';
import { identifier,trustedPredicate } from '../admission/sql.server';
import { canonical,digest } from '../construction/source';
type Row=Record<string,SqlScalar>;
type Evidence={before:Row[];after:Row[];tables:{name:string;rows:Row[]}[];sourceHash:string;candidateId:string;targetReleaseId:string|null;artifacts:string[]};
export type SnapshotAuthorization=(ctx:RequestContext,candidate:CandidateDetail,fields:{appId:string;entityId:string;fieldIds:string[]}[])=>Promise<void>;
/** Retained tables make rollback reversible. Any intervening data change requires a separately evaluated forward repair. */
export class RetainedTableRecovery implements RecoveryVerifierPort {
 constructor(readonly live:D1Database,readonly authorizeSnapshot:SnapshotAuthorization){}
 private operations(e:Evidence):{guards:SqlPredicate[];mutations:SqlMutation[]}{
  const guards:SqlPredicate[]=[],mutations:SqlMutation[]=[];
  if(e.targetReleaseId===null)return{guards,mutations};
  for(const table of e.tables){guards.push(trustedPredicate(`(SELECT COUNT(*) FROM ${identifier(table.name)})=?`,[table.rows.length]));for(const row of table.rows)guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(table.name)} WHERE ${Object.keys(row).map(k=>`${identifier(k)} IS ?`).join(' AND ')})`,Object.values(row)));}
  for(const next of e.after){const old=e.before.find(r=>r.id===next.id),where=trustedPredicate('id=? AND version=? AND physical_revision=?',[next.id!,next.version!,next.physical_revision!]);guards.push(trustedPredicate('EXISTS(SELECT 1 FROM record_schemas WHERE id=? AND version=? AND physical_revision=?)',[next.id!,next.version!,next.physical_revision!]));if(old)mutations.push({kind:'update',table:schemaTable,set:old,where,expectedRows:1});else mutations.push({kind:'delete',table:schemaTable,where,expectedRows:1});}
  return{guards,mutations};
 }
 async rehearse(ctx:RequestContext,input:{candidate:CandidateDetail;database:D1Database;candidateDataHash:string;artifacts:string[]}):Promise<RecoveryPlan>{
  const candidate=input.candidate,appId=candidate.candidate.appId!,id=candidate.candidate.recoveryPlanId;if(!id)throw new Error('recovery_plan_identity_required');
  const before=(await this.live.prepare('SELECT * FROM record_schemas WHERE app_id=? ORDER BY id').bind(appId).all<Row>()).results,after=(await input.database.prepare('SELECT * FROM record_schemas WHERE app_id=? ORDER BY id').bind(appId).all<Row>()).results;
  const tables:Evidence['tables']=[];
  const physical=(await input.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('record_schemas','release_recovery_evidence') ORDER BY name").all<{name:string}>()).results;
  for(const {name}of physical)tables.push({name,rows:(await input.database.prepare(`SELECT * FROM ${identifier(name)} ORDER BY 1`).all<Row>()).results});
  const evidence:Evidence={before,after,tables,sourceHash:candidate.source.sha256,candidateId:candidate.candidate.id,targetReleaseId:candidate.candidate.parentReleaseId,artifacts:[...input.artifacts]};
  const operations=this.operations(evidence);
  // Actually switch metadata back inside the isolated database, then verify exact prior routing.
  for(const mutation of operations.mutations){if(mutation.kind==='update'){const cols=Object.keys(mutation.set);await input.database.prepare(`UPDATE record_schemas SET ${cols.map(c=>`${identifier(c)}=?`).join(',')} WHERE ${mutation.where.sql}`).bind(...Object.values(mutation.set),...mutation.where.values).run();}else if(mutation.kind==='delete')await input.database.prepare(`DELETE FROM record_schemas WHERE ${mutation.where.sql}`).bind(...mutation.where.values).run();}
  const restored=(await input.database.prepare('SELECT * FROM record_schemas WHERE app_id=? ORDER BY id').bind(appId).all<Row>()).results;if(canonical(restored)!==canonical(evidence.targetReleaseId?before:after))throw new Error('recovery_routing_rehearsal_failed');
  for(const table of tables){const current=(await input.database.prepare(`SELECT * FROM ${identifier(table.name)} ORDER BY 1`).all<Row>()).results;if(canonical(current)!==canonical(table.rows))throw new Error('recovery_changed_records');}
  const text=canonical(evidence),hash=await digest(text);await this.live.prepare('INSERT INTO release_recovery_evidence(id,app_id,source_hash,evidence_hash,evidence_json,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,appId,candidate.source.sha256,hash,text,ctx.now).run();const saved=await this.live.prepare('SELECT evidence_hash FROM release_recovery_evidence WHERE id=?').bind(id).first<{evidence_hash:string}>();if(saved?.evidence_hash!==hash)throw new Error('recovery_evidence_conflict');
  return{id,candidateId:candidate.candidate.id,sourceHash:candidate.source.sha256,kind:evidence.targetReleaseId?'compatible_rollback':'stop_preserving_data',targetReleaseId:evidence.targetReleaseId,rehearsed:true,rehearsalArtifactHash:await digest(canonical(input.artifacts)),preservesAppliedHistory:true,inFlight:'revalidate',externalCompensation:'separate_authority',compatibleSchemaRevisions:[candidate.generated.schemaRevision]};
 }
 async recovery(_ctx:RequestContext,release:Release,plan:RecoveryPlan){const row=await this.live.prepare('SELECT evidence_hash,evidence_json FROM release_recovery_evidence WHERE id=? AND app_id=? AND source_hash=?').bind(plan.id,release.appId,release.sourceHash).first<{evidence_hash:string;evidence_json:string}>();if(!row||await digest(row.evidence_json)!==row.evidence_hash)throw new Error('recovery_evidence_missing');const evidence=JSON.parse(row.evidence_json) as Evidence;if(evidence.candidateId!==release.candidateId||evidence.targetReleaseId!==plan.targetReleaseId)throw new Error('recovery_evidence_mismatch');return this.operations(evidence);}
}
