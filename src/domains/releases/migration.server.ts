import type { RequestContext } from '../authority/ports';
import type { CandidateDetail } from '../construction/contracts';
import type { EntitySchema } from '../records/contracts';
import type { DescriptorRegistry } from '../records/descriptors.server';
import { compileSchemaSet,stageSchemaSet,prepareSchemaSetActivation,rehearseSchema } from '../records/migration.server';
import type { ReleaseMigrationPort,MigrationPhaseProof } from './ports';
import type { RecoveryPlan,Release } from './contracts';
import type { CellValue } from '../../contracts/primitives';
import type { SqlPredicate,SqlMutation } from '../admission/ports';
export interface MigrationRehearsalPort {
 isolated(ctx:RequestContext,candidate:CandidateDetail):Promise<{db:D1Database;priorDataHash:string;guards:SqlPredicate[];close():Promise<void>}>;
 verify(ctx:RequestContext,input:{candidate:CandidateDetail;db:D1Database;artifacts:string[];mutations:SqlMutation[];guards:SqlPredicate[]}):Promise<{candidateDataHash:string;rehearsalArtifactHash:string;recovery:RecoveryPlan;phaseProof:MigrationPhaseProof}>;
 recovery(ctx:RequestContext,release:Release,plan:RecoveryPlan):Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}>;
}
/** Physical source uses R's compiler; arbitrary application code stays ordinary source. */
export class PhysicalReleaseMigration implements ReleaseMigrationPort {
 constructor(readonly db:D1Database,readonly registry:DescriptorRegistry,readonly rehearsal:MigrationRehearsalPort){}
 async prepare(ctx:RequestContext,candidate:CandidateDetail){
  const file=candidate.source.files.find(f=>f.path==='cradle-schema.json');if(!file)throw new Error('source_schema_manifest_missing');
  const manifest=JSON.parse(file.content) as {entities:EntitySchema[];backfill:Record<string,Record<string,CellValue>>};
  if(!Array.isArray(manifest.entities)||manifest.entities.length>100)throw new Error('invalid_schema_manifest');
  const isolated=await this.rehearsal.isolated(ctx,candidate);if(isolated.db===this.db)throw new Error('rehearsal_must_be_isolated');
  const guards:SqlPredicate[]=[...isolated.guards],mutations:SqlMutation[]=[],artifacts:string[]=[];
  try{
   if(manifest.entities.some(schema=>schema.appId!==candidate.candidate.appId))throw new Error('schema_app_scope_mismatch');
   const compiled=await compileSchemaSet(manifest.entities,this.registry);
   for(const artifact of compiled.artifacts)await rehearseSchema(artifact,isolated.db);
   await stageSchemaSet(compiled,this.db,this.registry);
   const plan=await prepareSchemaSetActivation(this.db,compiled,this.registry,manifest.backfill);
   guards.push(...plan.guards);mutations.push(...plan.mutations);artifacts.push(...compiled.artifacts.map(a=>a.sha256));
   const proof=await this.rehearsal.verify(ctx,{candidate,db:isolated.db,artifacts,mutations,guards});
   if(!proof.recovery.rehearsed||!proof.recovery.preservesAppliedHistory||!proof.candidateDataHash||!proof.rehearsalArtifactHash)throw new Error('migration_proof_incomplete');
   return{migrationIds:artifacts,guards,mutations,rehearsalArtifactHash:proof.rehearsalArtifactHash,recovery:proof.recovery,phaseProof:proof.phaseProof,priorDataHash:isolated.priorDataHash,candidateDataHash:proof.candidateDataHash};
  }finally{await isolated.close();}
 }
 recover(ctx:RequestContext,release:Release,plan:RecoveryPlan){return this.rehearsal.recovery(ctx,release,plan);}
}
