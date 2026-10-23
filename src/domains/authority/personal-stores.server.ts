import type { AuthorityPermit, AuthorizationRequest, PolicyPort, RequestContext } from './ports';
import type { EntityRegistry } from './scope.server';
import { principalGuards } from './guards.server';
import { denied } from './errors';
import { trustedPredicate,identifier } from '../admission/sql.server';
import { fileStoreProviders, oauthScopes } from '../connections/oauth.server';
import { sharedPreviewGuards } from './store-preview.server';
import type { EntitySchema } from '../records/contracts';
import type { SqlPredicate } from '../admission/ports';
export const isPersonalStore = (provider: string) => (fileStoreProviders as readonly string[]).includes(provider);
export type StoreOperation = { op: 'browse' | 'thumbnail'; entityId: string; fieldId: string; recordId?: string; itemId?: string };
export async function installationStoreOwner(db:D1Database,ctx:RequestContext) {
 const guards=[...principalGuards(ctx),trustedPredicate("EXISTS(SELECT 1 FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.state='active' AND o.role='owner' AND o.status='active')",[ctx.principal.id])];
 if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||ctx.principal.credentialId)return denied('A current installation owner session is required.');
 for(const guard of guards)if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())return denied('A current installation owner session is required.');
 return guards;
}
/** Personal stores use attachment policy; they never inherit another person's connection or grant. */
export async function personalStorePermit(db:D1Database,policy:PolicyPort,registry:EntityRegistry|undefined,ctx:RequestContext,request:AuthorizationRequest,configureProvider?:string,operation?:StoreOperation):Promise<AuthorityPermit|null>{
 if(!request.action.startsWith('connection.'))return null;
 const row=request.connectionId?await db.prepare('SELECT adapter_id,owner_id,state,revoked_at,consent_scopes_json FROM provider_connections WHERE id=? AND app_id=?').bind(request.connectionId,request.appId).first<{adapter_id:string;owner_id:string|null;state:string;revoked_at:string|null;consent_scopes_json:string}>():null;
 const provider=configureProvider??row?.adapter_id;
 if(!provider||!isPersonalStore(provider))return null;
 if(!['connection.configure','connection.begin-consent','connection.read','connection.check','connection.sync','connection.revoke'].includes(request.action))return denied();
 if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||ctx.principal.credentialId||request.cost.length)return denied('Personal file stores require a current person session.');
 const guards:SqlPredicate[]=[...principalGuards(ctx)];
 const permit=():AuthorityPermit=>({actor:{id:ctx.principal.id,kind:'human'},action:request.action,appId:request.appId,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]});
 if(request.action==='connection.revoke'){
  if(row?.owner_id!==ctx.principal.id)guards.push(...await installationStoreOwner(db,ctx));
  else guards.push(trustedPredicate('EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND owner_id=?)',[request.connectionId!,ctx.principal.id]));
  return permit();
 }
 const settings=await db.prepare('SELECT enabled,connect_role,version FROM file_store_policies WHERE provider=?').bind(provider).first<{enabled:number;connect_role:string;version:number}>();
 if(!settings||!settings.enabled)return denied('This file store is disabled by the installation owner.');
 guards.push(trustedPredicate('EXISTS(SELECT 1 FROM file_store_policies WHERE provider=? AND enabled=1 AND version=?)',[provider,settings.version]));
 if(['connection.configure','connection.begin-consent'].includes(request.action)){
  if(settings.connect_role==='installation-owner')guards.push(...await installationStoreOwner(db,ctx));
  if(settings.connect_role==='base-authors'){
   const guard=trustedPredicate("EXISTS(SELECT 1 FROM manual_record_bases b LEFT JOIN manual_base_roles r ON r.app_id=b.id AND r.principal_id=? JOIN authority_memberships m ON m.app_id=b.id AND m.principal_id=? AND m.state='active' WHERE b.id=? AND (b.owner_id=? OR (r.role IN ('owner','creator') AND r.policy_id=m.policy_id)))",[ctx.principal.id,ctx.principal.id,request.appId,ctx.principal.id]);
   if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())return denied('Only base owners and creators may connect this store.');guards.push(guard);
  }
 }
 const saved=operation??(request.connectionId?await db.prepare('SELECT request_json FROM file_store_requests WHERE job_id=? AND connection_id=? AND actor_id=?').bind(ctx.requestId,request.connectionId,ctx.principal.id).first<{request_json:string}>().then(r=>r?JSON.parse(r.request_json) as StoreOperation:undefined):undefined);
 if(row?.owner_id!==ctx.principal.id&&request.action!=='connection.configure'){
  if(request.action!=='connection.sync'||saved?.op!=='thumbnail'||!registry||!request.connectionId)return denied('Choose your own file store connection.');
  guards.push(...await sharedPreviewGuards(db,policy,registry,ctx,request.appId,request.connectionId,saved));
 }else{
  if(row)guards.push(trustedPredicate('EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND owner_id=?)',[request.connectionId!,ctx.principal.id]));
  const schemas=(await db.prepare('SELECT schema_json FROM record_schemas WHERE app_id=?').bind(request.appId).all<{schema_json:string}>()).results.map(r=>JSON.parse(r.schema_json) as EntitySchema);
  let allowed=false;
  for(const schema of schemas){
   const fields=schema.fields.filter(f=>f.type==='attachment'&&(!saved||schema.id===saved.entityId&&f.id===saved.fieldId));if(!fields.length)continue;
   let scope;try{scope=await policy.scope(ctx,{appId:request.appId,entityId:schema.id,purpose:'read'});}catch{continue;}
   if(fields.some(f=>(saved?.op==='browse'?scope.writableFieldIds:scope.readableFieldIds).includes(f.id))){guards.push(...scope.currentAuthorityGuards);if(saved?.op==='thumbnail'&&registry){const entity=registry.get(request.appId,schema.id);if(!entity||!saved.recordId||!saved.itemId)return denied();guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${scope.rowPredicate.sql}))`,[saved.recordId,...scope.rowPredicate.values]),trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table+'_f_'+saved.fieldId.toLowerCase())} WHERE record_id=? AND json_extract(CASE WHEN json_valid(value) THEN value ELSE '{}' END,'$.itemId')=?)`,[saved.recordId,saved.itemId]));}allowed=true;break;}
  }
  if(!allowed)return denied('Current attachment field authority is required.');
 }
 if(request.action==='connection.sync'){
  if(!row||row.state!=='connected'||row.revoked_at||oauthScopes(provider as Parameters<typeof oauthScopes>[0]).filter(s=>s!=='offline_access').some(s=>!(JSON.parse(row.consent_scopes_json) as string[]).includes(s)))return denied('A current read-only store connection is required.');
  guards.push(trustedPredicate("EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND state='connected' AND revoked_at IS NULL)",[request.connectionId!]));
 }
 for(const guard of guards)if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())return denied();
 return permit();
}
