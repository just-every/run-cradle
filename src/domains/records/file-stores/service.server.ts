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
export type FileStoreConnection = { id: string; provider: string; name: string; state: string };
type Reader = ReturnType<typeof createRecordReader>;
/** Browsing and thumbnails read a person's own file store through a connection job, so the credential never leaves custody. */
export function createFileStores(db: D1Database, foundation: ServerFoundation, providers: ReturnType<typeof createProvidersComposition>, reader: Reader) {
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
    const prepared = await providers.jobs.prepare(ctx, createUlid(), connectionId, 'connection.sync');
    const plan = { ...prepared, mutations: [...prepared.mutations, { kind: 'insert' as const, table: fileStoreRequests, row: { job_id: prepared.committedResult.jobId, connection_id: connectionId, actor_id: ctx.principal.id, request_json: JSON.stringify(request), created_at: ctx.now } }] };
    const saved = await foundation.admission.commit(ctx, plan);
    if (saved.result.state !== 'committed') throw new ApiError('version_conflict', 'The file store request was not admitted.');
    const jobId = saved.result.value.jobId, outbox = await db.prepare("SELECT id FROM admission_outbox WHERE command_id=? AND action='connection.operation'").bind(plan.commandId).first<{ id: string }>();
    if (!outbox) throw new Error('File store outbox missing');
    await providers.jobs.dispatch(outbox.id);
    const answer = await db.prepare("SELECT r.result_json FROM file_store_requests r JOIN connection_jobs j ON j.id=r.job_id WHERE r.job_id=? AND r.actor_id=? AND j.state='completed'").bind(jobId, ctx.principal.id).first<{ result_json: string | null }>();
    await db.prepare('DELETE FROM file_store_requests WHERE job_id=? OR created_at<?').bind(jobId, new Date(Date.parse(ctx.now) - 3_600_000).toISOString()).run();
    if (!answer || answer.result_json === null) throw new ApiError('provider_unavailable', 'The file store did not answer. Reconnect it or try again.');
    return JSON.parse(answer.result_json) as T;
  }
  async function connections(ctx: RequestContext, appId: string): Promise<FileStoreConnection[]> {
    const rows = await db.prepare(`SELECT id,adapter_id,name,state,revoked_at FROM provider_connections WHERE app_id=? AND owner_id=? AND adapter_id IN (${fileStoreProviders.map(() => '?').join(',')}) ORDER BY created_at,id`).bind(appId, ctx.principal.id, ...fileStoreProviders).all<{ id: string; adapter_id: string; name: string; state: string; revoked_at: string | null }>();
    return rows.results.map(row => ({ id: row.id, provider: row.adapter_id, name: row.name, state: row.revoked_at ? 'revoked' : row.state }));
  }
  async function browse(ctx: RequestContext, input: unknown) {
    const request = fieldAddress.extend({ connectionId: idSchema, query: z.string().trim().min(1).max(200).nullable().default(null), cursor: z.string().min(1).max(2048).nullable().default(null) }).strict().parse(input);
    await authorize(ctx, request); await ownConnection(ctx, request.appId, request.connectionId);
    const provider = (await db.prepare('SELECT adapter_id FROM provider_connections WHERE id=?').bind(request.connectionId).first<{ adapter_id: string }>())!.adapter_id;
    return { provider, attachedBy: ctx.principal.id, ...await run<StoreBrowse>(ctx, request.connectionId, { op: 'browse', query: request.query, cursor: request.cursor }) };
  }
  /** The image is fetched now, through the connection of the person who attached the file, and handed on without being kept. */
  async function thumbnail(ctx: RequestContext, input: unknown): Promise<{ state: 'image'; image: StoreThumbnail } | { state: 'reconnect' | 'none' }> {
    const request = fieldAddress.extend({ recordId: idSchema, itemId: z.string().min(1).max(512) }).strict().parse(input), ref = { appId: request.appId, entityId: request.entityId, recordId: request.recordId };
    const scope = await foundation.policy.scope(ctx, { appId: request.appId, entityId: request.entityId, purpose: 'read' }), d = foundation.descriptors.get(request.appId, request.entityId);
    const row = await reader.raw(ctx, scope, ref);
    if (!row) throw new ApiError('not_found', 'Record not found.');
    const cell = (await reader.render(ctx, scope, d, row, [request.fieldId])).fields[request.fieldId];
    const reference = cell?.state === 'value' && Array.isArray(cell.value) ? cell.value.find(member => isStoreReferenceMember(member) && member.reference.itemId === request.itemId) : undefined;
    if (!reference || !isStoreReferenceMember(reference)) throw new ApiError('not_found', 'Attachment not found.');
    const { connectionId, attachedBy } = reference.reference;
    if (!connectionId || attachedBy !== ctx.principal.id) return { state: 'none' };
    const live = await db.prepare("SELECT 1 AS live FROM provider_connections WHERE id=? AND owner_id=? AND state='connected' AND revoked_at IS NULL").bind(connectionId, ctx.principal.id).first();
    if (!live) return { state: 'reconnect' };
    const image = await run<StoreThumbnail | null>(ctx, connectionId, { op: 'thumbnail', itemId: request.itemId });
    return image ? { state: 'image', image } : { state: 'none' };
  }
  return { connections, browse, thumbnail, identity: (ctx: RequestContext) => ({ attachedBy: ctx.principal.id }) };
}
