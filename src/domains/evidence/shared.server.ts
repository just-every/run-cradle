import { createUlid } from '../../core/shared/ids';
import { registerTable, eq, and } from '../admission/sql.server';
import type { TableHandle, SqlMutation } from '../admission/ports';
export { createUlid, eq, and };
export class EvidenceError extends Error{constructor(readonly code:string,message:string,readonly status=400){super(message);}}
export async function hash(value:string|Uint8Array){const input=typeof value==='string'?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',input as BufferSource)),v=>v.toString(16).padStart(2,'0')).join('');}
export function parse<T>(value:string):T{return JSON.parse(value) as T;}
export const sources=registerTable('evidence_sources',['id','app_id','entity_id','record_id','field_ids','kind','connection_id','external_id','current_version','created_at','erased_at']);
export const versions=registerTable('evidence_source_versions',['id','source_id','version','sha256','content','file_ids','effective_at','known_at','source_release_id']);
export const nodes=registerTable('evidence_nodes',['id','app_id','kind','object_id','object_version','created_at','invalidated_at','erased_at']);
export const edges=registerTable('evidence_dependencies',['id','parent_id','child_id']);
export const files=registerTable('evidence_files',['id','app_id','entity_id','record_id','field_ids','filename','media_type','bytes','sha256','object_key','state','source_id','rejection','version','created_at','updated_at']);
export const contexts=registerTable('evidence_contexts',['id','app_id','principal_id','purpose','destination','profile_id','field_ids','source_refs','content','sha256','expires_at','created_at','erased_at','historical_cutoff','record_refs']);
export const claims=registerTable('evidence_claims',['id','app_id','version','subject_json','field_id','value_json','evidence_json','model_call_id','state','supersedes_id','created_at','updated_at']);
export const proposals=registerTable('evidence_proposals',['id','app_id','version','action','subject_json','input_json','evidence_json','reason','expires_at','state','created_at','updated_at']);
export const comments=registerTable('evidence_comments',['id','app_id','entity_id','record_id','author_id','author_kind','body','mentions_json','version','created_at','updated_at','deleted_at','author_label']);
export const insert=(table:TableHandle,row:Record<string,string|number|null>):SqlMutation=>({kind:'insert',table,row});
export function node(appId:string,kind:string,objectId:string,version:number,now:string){const id=createUlid();return{id,mutation:insert(nodes,{id,app_id:appId,kind,object_id:objectId,object_version:version,created_at:now,invalidated_at:null,erased_at:null})};}
