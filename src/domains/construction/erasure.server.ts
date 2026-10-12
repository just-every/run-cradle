import type { RequestContext,PolicyPort } from '../authority/ports';
import type { SqlMutation,SqlPredicate } from '../admission/ports';
import { registerTable,trustedPredicate } from '../admission/sql.server';
import { datasetTable,evaluationProofTable } from './datasets.server';
import type { RunnerClient } from './runner-client.server';
import { stableId,digest } from './source';
const erasures=registerTable('construction_runner_erasures',['id','source_id','app_id','artifact_hash','state','created_at','completed_at']);
/** Aggregate erasure admits redaction and remote cleanup intents in one transaction. */
export class ConstructionErasure {
 constructor(readonly db:D1Database,readonly policy:PolicyPort,readonly runner:RunnerClient){}
 async prepare(ctx:RequestContext,sourceIds:string[]):Promise<{guards:SqlPredicate[];mutations:SqlMutation[];objectKeys:string[]}>{
  const guards:SqlPredicate[]=[],mutations:SqlMutation[]=[],seen=new Set<string>(),queued=new Set<string>();
  for(const sourceId of sourceIds){const rows=(await this.db.prepare("SELECT DISTINCT d.id,d.app_id,d.input_hash,d.state FROM construction_datasets d,json_each(d.source_versions_json) s WHERE json_extract(s.value,'$.id')=?").bind(sourceId).all<{id:string;app_id:string;input_hash:string;state:string}>()).results;
   for(const row of rows){if(seen.has(row.id)||row.state==='erased')continue;seen.add(row.id);const hashes=new Set([row.input_hash]);const proofs=(await this.db.prepare('SELECT evaluation_id,attestations_json FROM construction_evaluation_proofs WHERE dataset_id=?').bind(row.id).all<{evaluation_id:string;attestations_json:string}>()).results;
    for(const proof of proofs){for(const raw of JSON.parse(proof.attestations_json) as string[]){const signed=JSON.parse(raw) as {payload:{inputHash?:string;artifacts?:{sha256:string}[]}};if(signed.payload.inputHash)hashes.add(signed.payload.inputHash);for(const artifact of signed.payload.artifacts??[])hashes.add(artifact.sha256);}mutations.push({kind:'update',table:evaluationProofTable,set:{attestations_json:'[]'},where:trustedPredicate('evaluation_id=? AND attestations_json=?',[proof.evaluation_id,proof.attestations_json]),expectedRows:1});}
    guards.push(trustedPredicate('EXISTS(SELECT 1 FROM construction_datasets WHERE id=? AND state=? AND input_hash=?)',[row.id,row.state,row.input_hash]));mutations.push({kind:'update',table:datasetTable,set:{state:'erased',inputs_json:null,expected_json:null},where:trustedPredicate('id=? AND state=?',[row.id,row.state]),expectedRows:1});
    for(const hash of hashes){const id=await stableId({sourceId,hash,kind:'runner-erasure'});if(queued.has(id))continue;queued.add(id);if(!await this.db.prepare('SELECT id FROM construction_runner_erasures WHERE id=?').bind(id).first())mutations.push({kind:'insert',table:erasures,row:{id,source_id:sourceId,app_id:row.app_id,artifact_hash:hash,state:'pending',created_at:ctx.now,completed_at:null}});}
   }
  }
  return{guards,mutations,objectKeys:[]};
 }
 async advance(ctx:RequestContext,sourceIds:string[]){for(const sourceId of sourceIds){const rows=(await this.db.prepare("SELECT id,app_id,artifact_hash FROM construction_runner_erasures WHERE source_id=? AND state='pending'").bind(sourceId).all<{id:string;app_id:string;artifact_hash:string}>()).results;for(const row of rows){await this.policy.authorize(ctx,{appId:row.app_id,action:'privacy.erase',expected:[],cost:[],inputHash:await digest(sourceId)});const result=await this.runner.request<{sha256:string;erased:boolean}>('POST',`/artifacts/${row.artifact_hash}/erase`,{},true);if(!result.payload.erased||result.payload.sha256!==row.artifact_hash)throw new Error('runner_erasure_unverified');await this.db.prepare("UPDATE construction_runner_erasures SET state='complete',completed_at=? WHERE id=? AND state='pending'").bind(ctx.now,row.id).run();}}}
 async verify(sourceIds:string[]){const unsupportedCopies:string[]=[];for(const sourceId of sourceIds){const remaining=await this.db.prepare("SELECT COUNT(*) n FROM construction_datasets d,json_each(d.source_versions_json) s WHERE json_extract(s.value,'$.id')=? AND (d.inputs_json IS NOT NULL OR d.expected_json IS NOT NULL)").bind(sourceId).first<{n:number}>();if(remaining?.n)unsupportedCopies.push('construction:dataset-content');const rows=(await this.db.prepare("SELECT artifact_hash FROM construction_runner_erasures WHERE source_id=? AND state<>'complete'").bind(sourceId).all<{artifact_hash:string}>()).results;unsupportedCopies.push(...rows.map(r=>'runner:'+r.artifact_hash));}return{complete:unsupportedCopies.length===0,unsupportedCopies};}
}
