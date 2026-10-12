import type { RunnerClient } from '../construction/runner-client.server';
import { bundle,digest } from '../construction/source';
import { sqliteRehearsalProgram } from './sqlite-program';
import { createUlid } from '../../core/shared/ids';
type Statement={sql:string;values:unknown[];kind:'run'|'first'|'all'};
/** An ephemeral, credential-free D1-compatible rehearsal client. State is hashed runner output, never a production binding. */
export class IsolatedSqlite {
 private database='';private source:{id:string;sha256:string;downloadUrl:string}|null=null;
 readonly artifacts:string[]=[];
 constructor(readonly runner:RunnerClient){}
 async execute(statements:Statement[]):Promise<unknown[]>{
  if(!this.source){const source=bundle([{path:'cradle-build.json',content:JSON.stringify({commands:{evaluate:['node','rehearse.mjs']}})},{path:'rehearse.mjs',content:sqliteRehearsalProgram}]);this.source=await this.runner.upload(new TextEncoder().encode(source));}
  const bytes=new TextEncoder().encode(JSON.stringify({database:this.database,statements})),input=await this.runner.upload(bytes);
  const result=await this.runner.execute({jobId:`migration-${createUlid()}`,kind:'evaluate',sourceArtifact:this.source,inputArtifact:input,networkAllowlist:[],limits:{cpuSeconds:30,memoryBytes:268435456,wallSeconds:30},outputSchemaHash:await digest('cradle.sqlite-rehearsal.v1')});
  const artifact=result.payload.artifacts[0];if(!artifact)throw new Error('rehearsal_artifact_missing');
  const output=JSON.parse(new TextDecoder().decode(await this.runner.artifact(artifact.sha256))) as {files:{path:string;content:string}[]};
  const database=output.files.find(f=>f.path==='database.sqlite'),report=output.files.find(f=>f.path==='result.json');if(!database||!report)throw new Error('rehearsal_output_missing');
  const checks=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(report.content),c=>c.charCodeAt(0)))) as {results:unknown[];integrity:string;foreignKeysValid:boolean};
  if(checks.integrity!=='ok'||checks.foreignKeysValid!==true)throw new Error('rehearsal_integrity_failed');this.database=database.content;this.artifacts.push(artifact.sha256);return checks.results;
 }
 binding():D1Database{
  const owner=this;
  const prepare=(sql:string,values:unknown[]=[]):D1PreparedStatement=>({
   bind(...next:unknown[]){return prepare(sql,next);},
   async first<T>(column?:string){const row=(await owner.execute([{sql,values,kind:'first'}]))[0] as Record<string,unknown>|null;return (column?row?.[column]??null:row) as T|null;},
   async all<T>(){return{results:(await owner.execute([{sql,values,kind:'all'}]))[0] as T[],success:true,get meta():D1Meta & Record<string,unknown>{throw new Error('isolated_sqlite_d1_metadata_unavailable');}} as D1Result<T>;},
   async run<T>(){const result=(await owner.execute([{sql,values,kind:'run'}]))[0] as {changes:number};return{results:[],success:true,get meta():D1Meta & Record<string,unknown>{throw new Error('isolated_sqlite_d1_metadata_unavailable');}} as D1Result<T>;},
   async raw<T>(){const rows=(await owner.execute([{sql,values,kind:'all'}]))[0] as Record<string,unknown>[];return rows.map(r=>Object.values(r)) as T[];},
  } as D1PreparedStatement);
  return{prepare} as D1Database;
 }
 async identity(){return digest(this.database);}
 async close(){this.database='';this.source=null;}
}
