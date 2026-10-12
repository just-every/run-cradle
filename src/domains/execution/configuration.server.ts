import { z } from 'zod';
import type { RequestContext,PolicyPort } from '../authority/ports';
import type { SqlMutation } from '../admission/ports';
import { registerTable,and,eq } from '../admission/sql.server';
import { canonical,sha256 } from '../../adapters/crypto.server';
import { ApiError } from '../../core/registry/errors';
import type { ConfiguredModelProfile } from './model.server';
import type { ModelProfile } from './contracts';
const bindings=registerTable('execution_model_bindings',['profile_id','principal_id','connection_id','grant_id','grant_version','custodian_id','max_output_tokens','version','created_at','updated_at']);
type Binding={profile_id:string;principal_id:string;connection_id:string;grant_id:string;grant_version:number;custodian_id:string;max_output_tokens:number;version:number};
export type ModelConfigurationDependencies={db:D1Database;policy:PolicyPort;currentRelease(ctx:RequestContext,appId:string):Promise<{releaseId:string}>};
export function createModelConfiguration(d:ModelConfigurationDependencies){
 async function profile(ctx:RequestContext,id:string):Promise<ConfiguredModelProfile>{
  const row=await d.db.prepare('SELECT app_id,profile_json,version FROM execution_model_profiles WHERE id=?').bind(id).first<{app_id:string;profile_json:string;version:number}>();if(!row)throw new ApiError('unconfigured','Model profile is not configured.');const p=JSON.parse(row.profile_json) as ModelProfile;
  await d.policy.authorize(ctx,{appId:row.app_id,action:'model.read',expected:[],cost:[],inputHash:await sha256(id)});
  const binding=await d.db.prepare('SELECT * FROM execution_model_bindings WHERE profile_id=? AND principal_id=?').bind(id,ctx.principal.id).first<Binding>();if(!binding)throw new ApiError('unconfigured','Select an explicit connection and bounded grant for this model caller.');
  const connection=await d.db.prepare('SELECT version,adapter_id,state,credential_ref,revoked_at,scopes_json FROM provider_connections WHERE id=? AND app_id=?').bind(binding.connection_id,row.app_id).first<{version:number;adapter_id:string;state:string;credential_ref:string|null;revoked_at:string|null;scopes_json:string}>();
  if(!connection||connection.adapter_id!=='openai'||connection.state!=='connected'||connection.revoked_at||connection.credential_ref!==p.credentialRef)throw new ApiError('unconfigured','Selected model connection is not configured for this profile.');
  const scopes=JSON.parse(connection.scopes_json) as {resource:string;readFields:string[];actions:string[]}[];if(!scopes.some(s=>s.resource===p.model&&s.actions.includes('model.generate')&&p.allowedFieldIds.every(f=>s.readFields.includes(f))))throw new ApiError('forbidden','Model connection egress scope does not cover this profile.');
  const grant=await d.db.prepare("SELECT 1 FROM authority_grants WHERE id=? AND delegate_id=? AND app_id=? AND version=? AND state='active' AND restore_hold=0 AND revoked_at IS NULL AND starts_at<=? AND expires_at>?").bind(binding.grant_id,ctx.principal.id,row.app_id,binding.grant_version,Date.now(),Date.now()).first();if(!grant)throw new ApiError('grant_revoked','Selected model grant is no longer current.');
  return {profile:p,appId:row.app_id,connectionId:binding.connection_id,connectionVersion:connection.version,...await d.currentRelease(ctx,row.app_id),schemaVersion:p.version,controlEpoch:p.version,grantId:binding.grant_id,grantVersion:binding.grant_version,custodianId:binding.custodian_id,maxOutputTokens:binding.max_output_tokens};
 }
 async function prepareBinding(ctx:RequestContext,commandId:string,raw:unknown){if(ctx.principal.kind!=='human')throw new ApiError('forbidden','Model authority configuration requires an administrator.');const id=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),input=z.object({profileId:id,principalId:id,connectionId:id,grantId:id,grantVersion:z.number().int().positive(),custodianId:id,maxOutputTokens:z.number().int().min(1).max(32000),expectedVersion:z.number().int().nonnegative()}).strict().parse(raw);
  const row=await d.db.prepare('SELECT app_id FROM execution_model_profiles WHERE id=?').bind(input.profileId).first<{app_id:string}>();if(!row)throw new ApiError('not_found','Model profile not found.');
  const grant=await d.db.prepare("SELECT 1 FROM authority_grants WHERE id=? AND delegate_id=? AND app_id=? AND version=? AND state='active'").bind(input.grantId,input.principalId,row.app_id,input.grantVersion).first();if(!grant)throw new ApiError('forbidden','Select a persisted current grant for this caller.');
  const hash=await sha256(canonical(input)),permit=await d.policy.authorize(ctx,{appId:row.app_id,action:'model.configure',expected:[],cost:[],inputHash:hash,commandId}),now=new Date().toISOString(),values={connection_id:input.connectionId,grant_id:input.grantId,grant_version:input.grantVersion,custodian_id:input.custodianId,max_output_tokens:input.maxOutputTokens,version:input.expectedVersion+1,updated_at:now};
  const mutation:SqlMutation=input.expectedVersion?{kind:'update',table:bindings,set:values,where:and(eq(bindings,'profile_id',input.profileId),eq(bindings,'principal_id',input.principalId),eq(bindings,'version',input.expectedVersion)),expectedRows:1}:{kind:'insert',table:bindings,row:{...values,profile_id:input.profileId,principal_id:input.principalId,created_at:now}};
  return {commandId,action:permit.action,appId:row.app_id,canonicalInputHash:hash,permit,guards:[],mutations:[mutation],audit:[{action:'model.configure',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{profileId:input.profileId,principalId:input.principalId,version:values.version}};
 }
 return {profile,prepareBinding};
}
