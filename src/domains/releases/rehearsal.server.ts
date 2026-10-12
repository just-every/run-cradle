import type { RequestContext,PolicyPort } from '../authority/ports';
import type { DescriptorRegistry } from '../records/descriptors.server';
import type { CandidateDetail } from '../construction/contracts';
import type { RunnerClient } from '../construction/runner-client.server';
import type { MigrationRehearsalPort } from './migration.server';
import type { Release,RecoveryPlan } from './contracts';
import type { SqlMutation,SqlPredicate,SqlScalar } from '../admission/ports';
import { identifier,validateMutation,assertPredicate,trustedPredicate,textReplacement } from '../admission/sql.server';
import { IsolatedSqlite } from './isolated-db.server';
import { canonical,digest } from '../construction/source';
export interface RecoveryVerifierPort {
 authorizeSnapshot(ctx:RequestContext,candidate:CandidateDetail,fields:{appId:string;entityId:string;fieldIds:string[]}[]):Promise<void>;
 rehearse(ctx:RequestContext,input:{candidate:CandidateDetail;database:D1Database;candidateDataHash:string;artifacts:string[]}):Promise<RecoveryPlan>;
 recovery(ctx:RequestContext,release:Release,plan:RecoveryPlan):Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}>;
}
function statement(m:SqlMutation){validateMutation(m);const table=identifier(m.table.tableId);if(m.kind==='insert'){const cols=Object.keys(m.row);return{sql:`INSERT INTO ${table}(${cols.map(identifier).join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,values:Object.values(m.row),kind:'run' as const};}if(m.kind==='delete')return{sql:`DELETE FROM ${table} WHERE ${m.where.sql}`,values:[...m.where.values],kind:'run' as const};if(m.kind==='replaceText'){const expression=textReplacement(m.column,m.needles,m.replacement);return {sql:`UPDATE ${table} SET ${identifier(m.column)}=${expression.sql} WHERE ${m.where.sql}`,values:[...expression.values,...m.where.values],kind:'run' as const};}const cols=Object.keys(m.set);return{sql:`UPDATE ${table} SET ${cols.map(c=>`${identifier(c)}=?`).join(',')} WHERE ${m.where.sql}`,values:[...Object.values(m.set),...m.where.values],kind:'run' as const};}
export class RunnerMigrationRehearsal implements MigrationRehearsalPort {
 private sessions=new WeakMap<D1Database,{client:IsolatedSqlite;tables:Map<string,string>}>();
 constructor(readonly live:D1Database,readonly registry:DescriptorRegistry,readonly policy:PolicyPort,readonly runner:RunnerClient,readonly verifier:RecoveryVerifierPort){}
 async isolated(ctx:RequestContext,candidate:CandidateDetail){
  const selected=new Map(this.registry.list(candidate.candidate.appId!).map(d=>[d.schema.id,d]));
  const pending=[...selected.values()];while(pending.length){const d=pending.shift()!;for(const f of d.schema.fields)if(f.relation){const target=this.registry.get(f.relation.ownerAppId,f.relation.entityId);if(!selected.has(target.schema.id)){selected.set(target.schema.id,target);pending.push(target);}}}
  await this.verifier.authorizeSnapshot(ctx,candidate,[...selected.values()].map(d=>({appId:d.schema.appId,entityId:d.schema.id,fieldIds:d.schema.fields.map(f=>f.id)})));
  const names=new Set(['record_schemas']);
  for(const d of selected.values()){
   const scope=await this.policy.scope(ctx,{appId:d.schema.appId,entityId:d.schema.id,purpose:'export'});
   if(d.schema.fields.some(f=>!scope.readableFieldIds.includes(f.id)))throw new Error('migration_snapshot_field_denied');
   const total=await this.live.prepare(`SELECT COUNT(*) AS n FROM ${identifier(d.table.tableId)}`).first<{n:number}>(),allowed=await this.live.prepare(`SELECT COUNT(*) AS n FROM ${identifier(d.table.tableId)} WHERE ${scope.rowPredicate.sql}`).bind(...scope.rowPredicate.values).first<{n:number}>();
   if(total?.n!==allowed?.n)throw new Error('migration_snapshot_rows_denied');names.add(d.table.tableId);if(d.searchTable)names.add(d.searchTable);for(const f of d.fields.values())if(f.join)names.add(f.join.table.tableId);
  }
  const snapshotGuards:SqlPredicate[]=[];const schemaObjects:{type:string;name:string;sql:string}[]=[];
  const client=new IsolatedSqlite(this.runner),statements:{sql:string;values:unknown[];kind:'run'}[]=[],tables=new Map<string,string>();
  for(const name of names){const foreign=(await this.live.prepare(`PRAGMA foreign_key_list(${identifier(name)})`).all<{table:string}>()).results;for(const key of foreign)if(!names.has(key.table))throw new Error('migration_snapshot_unregistered_foreign_table');const schema=await this.live.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").bind(name).first<{sql:string}>();if(!schema?.sql)throw new Error('migration_table_missing');statements.push({sql:schema.sql,values:[],kind:'run'});schemaObjects.push({type:'table',name,sql:schema.sql});}
  for(const name of names){let rows=(await this.live.prepare(`SELECT * FROM ${identifier(name)} ORDER BY 1`).all<Record<string,SqlScalar>>()).results;if(name==='record_schemas')rows=rows.filter(row=>selected.has(String(row.id)));tables.set(name,await digest(canonical(rows)));
   const subset=name==='record_schemas'?` WHERE id IN (${[...selected.keys()].map(()=>'?').join(',')||'NULL'})`:'';
   snapshotGuards.push(trustedPredicate(`(SELECT COUNT(*) FROM ${identifier(name)}${subset})=?`,[...(name==='record_schemas'?[...selected.keys()]:[]),rows.length]));
   for(const row of rows){const columns=Object.keys(row);snapshotGuards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(name)} WHERE ${columns.map(c=>`${identifier(c)} IS ?`).join(' AND ')})`,Object.values(row)));statements.push({sql:`INSERT INTO ${identifier(name)}(${columns.map(identifier).join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,values:Object.values(row),kind:'run'});}}
  for(const name of names){const objects=(await this.live.prepare("SELECT type,name,sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name").bind(name).all<{type:string;name:string;sql:string}>()).results;snapshotGuards.push(trustedPredicate("(SELECT COUNT(*) FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL)=?",[name,objects.length]));for(const object of objects){schemaObjects.push(object);statements.push({sql:object.sql,values:[],kind:'run'});}}
  for(const object of schemaObjects)snapshotGuards.push(trustedPredicate('EXISTS(SELECT 1 FROM sqlite_master WHERE type=? AND name=? AND sql=?)',[object.type,object.name,object.sql]));
  await client.execute(statements);
  // Re-read all source data and DDL after materialization. Normal concurrent writes
  // advance stored versions/timestamps, so a mixed snapshot cannot pass this fence.
  for(const [name,hash]of tables){let rows=(await this.live.prepare(`SELECT * FROM ${identifier(name)} ORDER BY 1`).all<Record<string,SqlScalar>>()).results;if(name==='record_schemas')rows=rows.filter(row=>selected.has(String(row.id)));if(await digest(canonical(rows))!==hash){await client.close();throw new Error('migration_snapshot_changed');}}
  for(const guard of snapshotGuards){if(!await this.live.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.values).first()){await client.close();throw new Error('migration_source_schema_changed');}}
  const db=client.binding();this.sessions.set(db,{client,tables});return{db,guards:snapshotGuards,priorDataHash:await client.identity(),close:async()=>{this.sessions.delete(db);await client.close();}};
 }
 async verify(ctx:RequestContext,input:{candidate:CandidateDetail;db:D1Database;artifacts:string[];mutations:SqlMutation[];guards:SqlPredicate[]}){
  const session=this.sessions.get(input.db);if(!session)throw new Error('unknown_rehearsal_session');
  for(const guard of input.guards){assertPredicate(guard);const result=await input.db.prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.values).first<{ok:number}>();if(result?.ok!==1)throw new Error('migration_snapshot_stale');}
  const results=await session.client.execute(input.mutations.map(statement));
  for(let i=0;i<input.mutations.length;i++){const mutation=input.mutations[i]!,result=results[i] as {changes:number};if(result.changes!==(mutation.kind==='insert'?1:mutation.expectedRows))throw new Error('migration_affected_rows_mismatch');}
  // Old physical tables are retained byte-for-byte; only schema routing metadata changes.
  for(const [name,hash]of session.tables){if(name==='record_schemas')continue;const rows=(await input.db.prepare(`SELECT * FROM ${identifier(name)} ORDER BY 1`).all()).results;if(await digest(canonical(rows))!==hash)throw new Error('migration_changed_prior_records');}
  const candidateDataHash=await session.client.identity(),recovery=await this.verifier.rehearse(ctx,{candidate:input.candidate,database:input.db,candidateDataHash,artifacts:session.client.artifacts});
  if(!recovery.rehearsed||!recovery.preservesAppliedHistory||recovery.sourceHash!==input.candidate.source.sha256)throw new Error('recovery_not_verified');
  return{candidateDataHash,rehearsalArtifactHash:await digest(canonical(session.client.artifacts)),recovery,phaseProof:{expand:true,backfill:true,verify:true,switch:true,contract:'retained_for_recovery' as const}};
 }
 recovery(ctx:RequestContext,release:Release,plan:RecoveryPlan){return this.verifier.recovery(ctx,release,plan);}
}
