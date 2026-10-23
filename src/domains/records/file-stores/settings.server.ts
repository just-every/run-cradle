import { z } from 'zod';
import { createUlid } from '../../../core/shared/ids';
import { canonical,sha256 } from '../../../adapters/crypto.server';
import type { ServerFoundation } from '../../../core/app/foundation.server';
import type { RequestContext,AuthorityPermit } from '../../authority/ports';
import { installationStoreOwner } from '../../authority/personal-stores.server';
import { principalGuards } from '../../authority/guards.server';
import { denied } from '../../authority/errors';
import { registerTable,trustedPredicate } from '../../admission/sql.server';
import { connectionsTable } from '../../connections/tables.server';
import { fileStoreProviders } from '../../connections/oauth.server';
import { idSchema } from '../validators';
import type { SqlMutation } from '../../admission/ports';
const policies=registerTable('file_store_policies',['provider','enabled','connect_role','version','created_at','updated_at']);
const update=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('sharing'),appId:idSchema,connectionId:idSchema,enabled:z.boolean()}).strict(),
 z.object({kind:z.literal('policy'),appId:idSchema,provider:z.enum(fileStoreProviders as ['google-drive','onedrive','dropbox','box']),enabled:z.boolean(),connectRole:z.enum(['writers','base-authors','installation-owner'])}).strict(),
]);
export function createFileStoreSettings(db:D1Database,foundation:ServerFoundation){
 async function read(ctx:RequestContext,appId:string){
  let owner=false;try{await installationStoreOwner(db,ctx);owner=true;}catch(error){if((error as {code?:string}).code!=='forbidden')throw error;}
  return {owner,policies:(await db.prepare('SELECT provider,enabled,connect_role AS connectRole FROM file_store_policies ORDER BY provider').all()).results,connections:owner?(await db.prepare("SELECT id,owner_id AS ownerId,adapter_id AS provider,name,state FROM provider_connections WHERE app_id=? AND adapter_id IN ('google-drive','onedrive','dropbox','box') ORDER BY created_at,id").bind(appId).all()).results:[]};
 }
 async function write(ctx:RequestContext,input:unknown){
  const value=update.parse(input),guards=[...principalGuards(ctx)],mutations:SqlMutation[]=[];
  if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||ctx.principal.credentialId)return denied();
  if(value.kind==='sharing'){
   const row=await db.prepare("SELECT version FROM provider_connections WHERE id=? AND app_id=? AND owner_id=? AND adapter_id IN ('google-drive','onedrive','dropbox','box')").bind(value.connectionId,value.appId,ctx.principal.id).first<{version:number}>();if(!row)return denied('Only the connection maker can change preview sharing.');
   guards.push(trustedPredicate('EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND owner_id=? AND version=?)',[value.connectionId,ctx.principal.id,row.version]));
   mutations.push({kind:'update',table:connectionsTable,set:{share_previews:value.enabled?1:0,version:row.version+1,updated_at:ctx.now},where:trustedPredicate('id=? AND version=?',[value.connectionId,row.version]),expectedRows:1});
  }else{
   guards.push(...await installationStoreOwner(db,ctx));const row=await db.prepare('SELECT version FROM file_store_policies WHERE provider=?').bind(value.provider).first<{version:number}>();if(!row)throw new Error('File store policy is missing');
   mutations.push({kind:'update',table:policies,set:{enabled:value.enabled?1:0,connect_role:value.connectRole,version:row.version+1,updated_at:ctx.now},where:trustedPredicate('provider=? AND version=?',[value.provider,row.version]),expectedRows:1});
  }
  const action=value.kind==='sharing'?'connection.preview-sharing':'connection.provider-policy',permit:AuthorityPermit={actor:{id:ctx.principal.id,kind:'human'},action,appId:value.appId,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]};
  const result=await foundation.admission.commit(ctx,{commandId:createUlid(),action,appId:value.appId,canonicalInputHash:await sha256(canonical(value)),permit,guards:[],mutations,audit:[{action:value.kind==='sharing'?`${action}.${value.enabled?'enabled':'disabled'}`:action,subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:value});
  return result.result;
 }
 return {read,write};
}
