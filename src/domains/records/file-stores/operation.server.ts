import { z } from 'zod';
import { fileStoreAdapter } from '../../../adapters/file-stores.server';
import type { CredentialPort } from '../../../adapters/contracts';
import { fileStoreProviders } from '../../connections/oauth.server';
import type { FileStoreProvider } from '../../connections/oauth.server';
import { registerTable } from '../../admission/sql.server';
import type { RequestContext } from '../../authority/ports';
export const fileStoreRequests = registerTable('file_store_requests', ['job_id', 'connection_id', 'actor_id', 'request_json', 'result_json', 'created_at']);
export const fileStoreRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('browse'), query: z.string().trim().min(1).max(200).nullable(), cursor: z.string().min(1).max(2048).nullable() }).strict(),
  z.object({ op: z.literal('thumbnail'), itemId: z.string().min(1).max(512) }).strict(),
]);
/** The fixed read operation a connection job runs for a file store: list, search or one thumbnail. It has no write endpoint. */
export async function runFileStoreOperation(db: D1Database, ctx: RequestContext, connectionId: string, credentials: CredentialPort) {
  const row = await db.prepare('SELECT r.request_json,c.adapter_id FROM file_store_requests r JOIN provider_connections c ON c.id=r.connection_id WHERE r.job_id=? AND r.connection_id=? AND r.actor_id=?').bind(ctx.requestId, connectionId, ctx.principal.id).first<{ request_json: string; adapter_id: string }>();
  if (!row || !(fileStoreProviders as readonly string[]).includes(row.adapter_id)) throw new Error('File store request is missing');
  const adapter = fileStoreAdapter(row.adapter_id as FileStoreProvider, credentials), request = fileStoreRequestSchema.parse(JSON.parse(row.request_json));
  const result = request.op === 'browse' ? await adapter.browse(connectionId, ctx.requestId, request) : await adapter.thumbnail(connectionId, ctx.requestId, request.itemId);
  await db.prepare('UPDATE file_store_requests SET result_json=? WHERE job_id=?').bind(JSON.stringify(result), ctx.requestId).run();
}
