import { z } from 'zod';
import type { RequestContext } from '../authority/ports';
import type { ConnectionDependencies } from './service.server';
import { canonical,sha256 } from '../../adapters/crypto.server';
import { seal } from './crypto.server';
import { and,eq } from '../admission/sql.server';
import { connectionsTable,credentialsTable } from './tables.server';
import { ApiError } from '../../core/registry/errors';
export const apiKeyInput=z.object({commandId:z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),expectedVersion:z.number().int().positive(),dispatchSecret:z.string().min(16).max(4096),readbackSecret:z.string().min(16).max(4096).optional()}).strict();
/** Never register raw secrets as generic command inputs or retain them in result/audit. */
export function createApiKeyWriter(d:Pick<ConnectionDependencies,'db'|'policy'|'admission'|'keyring'|'workspaceId'>){return async(ctx:RequestContext,id:string,raw:unknown)=>{
 if(ctx.principal.kind!=='human'||!ctx.principal.sessionId)throw new ApiError('forbidden','Provider credentials require a current human session.');const input=apiKeyInput.parse(raw);
 const row=await d.db.prepare('SELECT app_id,adapter_id,version FROM provider_connections WHERE id=?').bind(id).first<{app_id:string;adapter_id:string;version:number}>();if(!row||!['resend','openai'].includes(row.adapter_id))throw new ApiError('validation','This connection uses provider consent instead of API keys.');
 const hash=await sha256(canonical({connectionId:id,expectedVersion:input.expectedVersion,dispatchHash:await sha256(input.dispatchSecret),readbackHash:input.readbackSecret?await sha256(input.readbackSecret):null}));const replay=await d.admission.replay(ctx,input.commandId,'connection.configure',row.app_id,hash);if(replay)return replay;
 const permit=await d.policy.authorize(ctx,{appId:row.app_id,action:'connection.configure',expected:[],connectionId:id,cost:[],inputHash:hash,commandId:input.commandId});if(row.version!==input.expectedVersion)throw new ApiError('version_conflict','Connection changed before credential submission.');
 const now=new Date().toISOString(),existing=await d.db.prepare('SELECT version FROM connection_credentials WHERE connection_id=?').bind(id).first<{version:number}>();
 const sealed=canonical(await seal(d.keyring,d.workspaceId,id,'api-keys',canonical({dispatch:input.dispatchSecret,readback:input.readbackSecret??(row.adapter_id==='openai'?input.dispatchSecret:null)})));
 return d.admission.commit(ctx,{commandId:input.commandId,action:'connection.configure',appId:row.app_id,canonicalInputHash:hash,permit,guards:[],mutations:[existing?{kind:'update',table:credentialsTable,set:{sealed_json:sealed,expires_at:null,version:existing.version+1,updated_at:now},where:and(eq(credentialsTable,'connection_id',id),eq(credentialsTable,'version',existing.version)),expectedRows:1}:{kind:'insert',table:credentialsTable,row:{connection_id:id,sealed_json:sealed,expires_at:null,version:1,created_at:now,updated_at:now}},{kind:'update',table:connectionsTable,set:{credential_ref:null,state:'connected',revoked_at:null,control_epoch:row.version+1,version:row.version+1,last_checked_at:null,updated_at:now},where:and(eq(connectionsTable,'id',id),eq(connectionsTable,'version',row.version)),expectedRows:1}],audit:[{action:'connection.credentials.configure',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{connectionId:id,version:row.version+1}});
};}
