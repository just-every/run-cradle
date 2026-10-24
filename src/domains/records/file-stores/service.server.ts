import {createStoreCopy} from './copy.server';
import {readStoreContent} from '../../../adapters/file-stores-content.server';
import type {EvidenceDependencies} from '../../evidence/ports';
import {createStoreResolution} from './resolution.server';
import type {createRecordWriter} from '../change.server';
import {storeCopyOwner,personalStorePermit} from '../../authority/personal-stores.server';
import {fileStoreAdapter} from '../../../adapters/file-stores.server';
import type {FileStoreProvider} from '../../connections/oauth.server';
import {createFileStoreSettings} from './settings.server';
import { createUlid } from '../../../core/shared/ids';
import { ApiError } from '../../../core/registry/errors';
import type { ServerFoundation } from '../../../core/app/foundation.server';
import type { createProvidersComposition } from '../../../core/app/composition/providers.server';
import type { RequestContext } from '../../authority/ports';
import type { StoreBrowse, StoreThumbnail } from '../../../adapters/file-stores.server';
import { fileStoreProviders } from '../../connections/oauth.server';
import { fileStoreRequests, fileStoreRequestSchema } from './operation.server';
import { z } from 'zod';
import { idSchema } from '../validators';
import { isStoreReferenceMember } from '../store-references';
import type { createRecordReader } from '../query.server';

export const fieldAddress = z.object({ appId: idSchema, entityId: idSchema, fieldId: idSchema }).strict();
export type FileStoreConnection = { id: string; provider: string; name: string; state: string; sharePreviews:boolean };
type Reader = ReturnType<typeof createRecordReader>;
/** Browsing and thumbnails read a person's own file store through a connection job, so the credential never leaves custody. */
export function createFileStores(db: D1Database, foundation: ServerFoundation, providers: ReturnType<typeof createProvidersComposition>, reader: Reader,writer:ReturnType<typeof createRecordWriter>,evidence:EvidenceDependencies) {
  /** Only a person who may write this attachment field, through a connection they own, can choose from a store. */
  async function authorize(ctx: RequestContext, address: z.infer<typeof fieldAddress>) {
    if (ctx.principal.kind !== 'human') throw new ApiError('forbidden', 'A person chooses files from their own store.');
    const scope = await foundation.policy.scope(ctx, { appId: address.appId, entityId: address.entityId, purpose: 'read' });
    if (!scope.writableFieldIds.includes(address.fieldId) || foundation.descriptors.get(address.appId, address.entityId).fields.get(address.fieldId)?.field.type !== 'attachment') throw new ApiError('forbidden', 'This attachment field cannot be written.');
    return scope;
  }
  async function ownConnection(ctx: RequestContext, appId: string, connectionId: string) {
    const row = await db.prepare("SELECT adapter_id FROM provider_connections WHERE id=? AND app_id=? AND owner_id=? AND state='connected' AND revoked_at IS NULL").bind(connectionId, appId, ctx.principal.id).first<{ adapter_id: string }>();
    if (!row || !(fileStoreProviders as readonly string[]).includes(row.adapter_id)) throw new ApiError('forbidden', 'Choose one of your own connected file stores.');
  }
  async function run<T>(ctx: RequestContext, connectionId: string, request: z.infer<typeof fileStoreRequestSchema>): Promise<T> {
    const connection=await db.prepare('SELECT app_id,adapter_id FROM provider_connections WHERE id=?').bind(connectionId).first<{app_id:string;adapter_id:FileStoreProvider}>();if(!connection)throw new ApiError('forbidden','Connection unavailable.');
    const permit=await personalStorePermit(db,foundation.policy,foundation.entities,ctx,{appId:connection.app_id,action:'connection.sync',expected:[],cost:[],connectionId,inputHash:''},undefined,request);
    const prepared = await providers.jobs.prepare(ctx, createUlid(), connectionId, 'connection.sync',permit??undefined);
    const plan = { ...prepared, mutations: [...prepared.mutations, { kind: 'insert' as const, table: fileStoreRequests, row: { job_id: prepared.committedResult.jobId, connection_id: connectionId, actor_id: ctx.principal.id, request_json: JSON.stringify(request), created_at: ctx.now } }] };
    const saved = await foundation.admission.commit(ctx, plan);
    if (saved.result.state !== 'committed') throw new ApiError('version_conflict', 'The file store request was not admitted.');
    const jobId = saved.result.value.jobId, outbox = await db.prepare("SELECT id FROM admission_outbox WHERE command_id=? AND action='connection.operation'").bind(plan.commandId).first<{ id: string }>();
    if (!outbox) throw new Error('File store outbox missing');
    try {
      await providers.jobs.dispatch(outbox.id);
      const answer = await db.prepare("SELECT r.result_json FROM file_store_requests r JOIN connection_jobs j ON j.id=r.job_id WHERE r.job_id=? AND r.actor_id=? AND j.state='completed'").bind(jobId, ctx.principal.id).first<{ result_json: string | null }>();
      if (!answer || answer.result_json === null) throw new ApiError('provider_unavailable', 'The file store did not answer. Reconnect it or try again.');
      if(request.op==='thumbnail'||request.op==='content'){
        const jobContext={...ctx,requestId:jobId};
        const credentials=providers.connections(jobContext).credentials;
        const image=request.op==='content'?await readStoreContent(connection.adapter_id,credentials,connectionId,jobId,request.itemId):await fileStoreAdapter(connection.adapter_id,credentials).thumbnail(connectionId,jobId,request.itemId);
        // Authority may have changed while the provider answered. Recheck before handing out bytes.
        await personalStorePermit(db,foundation.policy,foundation.entities,jobContext,{appId:connection.app_id,action:'connection.sync',expected:[],cost:[],connectionId,inputHash:''},undefined,request);
        return image as T;
      }
      return JSON.parse(answer.result_json) as T;
    } finally { await db.prepare('DELETE FROM file_store_requests WHERE job_id=?').bind(jobId).run(); }
  }

  async function connections(ctx: RequestContext, appId: string): Promise<FileStoreConnection[]> {
    const rows = await db.prepare(`SELECT id,adapter_id,name,state,revoked_at,share_previews FROM provider_connections WHERE app_id=? AND owner_id=? AND adapter_id IN (${fileStoreProviders.map(() => '?').join(',')}) ORDER BY created_at,id`).bind(appId, ctx.principal.id, ...fileStoreProviders).all<{ id: string; adapter_id: string; name: string; state: string; revoked_at: string | null;share_previews:number }>();
    return rows.results.map(row => ({ id: row.id, provider: row.adapter_id, name: row.name, state: row.revoked_at ? 'revoked' : row.state,sharePreviews:row.share_previews===1 }));
  }
  async function browse(ctx: RequestContext, input: unknown) {
    const request = fieldAddress.extend({ connectionId: idSchema, query: z.string().trim().min(1).max(200).nullable().default(null), cursor: z.string().min(1).max(2048).nullable().default(null) }).strict().parse(input);
    await authorize(ctx, request); await ownConnection(ctx, request.appId, request.connectionId);
    const connection = (await db.prepare('SELECT adapter_id,account_id FROM provider_connections WHERE id=?').bind(request.connectionId).first<{ adapter_id: string;account_id:string }>())!,provider=connection.adapter_id;
    return { provider, account:['google-drive','onedrive'].includes(provider)?connection.account_id:null,attachedAt:ctx.now,attachedBy: ctx.principal.id, ...await run<StoreBrowse>(ctx, request.connectionId, { entityId:request.entityId,fieldId:request.fieldId,op: 'browse', query: request.query, cursor: request.cursor }) };
  }
  /** Prefer the viewer's own store authority, then explicit attacher sharing; never retain image bytes. */
  async function thumbnail(ctx: RequestContext, input: unknown): Promise<{ state: 'image'; image: StoreThumbnail } | { state: 'reconnect' | 'none' }> {
    const request = fieldAddress.extend({ recordId: idSchema, itemId: z.string().min(1).max(512) }).strict().parse(input), ref = { appId: request.appId, entityId: request.entityId, recordId: request.recordId };
    const scope = await foundation.policy.scope(ctx, { appId: request.appId, entityId: request.entityId, purpose: 'read' }), d = foundation.descriptors.get(request.appId, request.entityId);
    const row = await reader.raw(ctx, scope, ref);
    if (!row) throw new ApiError('not_found', 'Record not found.');
    const cell = (await reader.render(ctx, scope, d, row, [request.fieldId])).fields[request.fieldId];
    const reference = cell?.state === 'value' && Array.isArray(cell.value) ? cell.value.find(member => isStoreReferenceMember(member) && member.reference.itemId === request.itemId) : undefined;
    if (!reference || !isStoreReferenceMember(reference)) throw new ApiError('not_found', 'Attachment not found.');
    const { connectionId, attachedBy,provider } = reference.reference;
    if (reference.reference.resolution==='unresolved'||!connectionId||provider==='chest') return { state: 'none' };
    // Each viewer asks the store with their own account. The store decides whether that account can read this item.
    const own=(await db.prepare("SELECT id FROM provider_connections WHERE app_id=? AND owner_id=? AND adapter_id=? AND state='connected' AND revoked_at IS NULL ORDER BY created_at DESC,id").bind(request.appId,ctx.principal.id,provider).all<{id:string}>()).results;
    const operation={op:'thumbnail' as const,entityId:request.entityId,fieldId:request.fieldId,recordId:request.recordId,itemId:request.itemId};
    for(const candidate of own){const image=await run<StoreThumbnail|null>(ctx,candidate.id,operation);if(image)return {state:'image',image};}
    if(attachedBy!==ctx.principal.id){
      // The server's shared-preview permit verifies opt-in, the stored reference and both people's current authority.
      const permitted=await personalStorePermit(db,foundation.policy,foundation.entities,ctx,{appId:request.appId,action:'connection.sync',expected:[],cost:[],connectionId,inputHash:''},undefined,operation).catch(error=>{if(error?.code==='forbidden')return null;throw error;});
      if(permitted){const image=await run<StoreThumbnail|null>(ctx,connectionId,operation);if(image)return {state:'image',image};}
    }
    return {state:own.length?'none':'reconnect'};
  }

  return { async canCopy(ctx:RequestContext,appId:string){try{await storeCopyOwner(db,ctx,appId);return true}catch(error){if(error instanceof Error&&'code'in error&&error.code==='forbidden')return false;throw error}},copy:createStoreCopy(db,foundation,reader,writer,evidence,run),resolve:createStoreResolution(db,foundation,reader,writer,run),settings:createFileStoreSettings(db,foundation),connections, browse, thumbnail, identity: (ctx: RequestContext) => ({ attachedBy: ctx.principal.id }) };
}
