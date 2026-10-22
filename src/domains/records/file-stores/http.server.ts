import { Hono } from 'hono';
import { createUlid } from '../../../core/shared/ids';
import { readJsonBody } from '../../../core/registry/body';
import { ApiError, errorResponse } from '../../../core/registry/errors.server';
import type { ServerFoundation } from '../../../core/app/foundation.server';
import { unbase64 } from '../../../adapters/crypto.server';
import type { createFileStores } from './service.server';
import { idSchema } from '../validators';

const json = { 'cache-control': 'no-store' };
/** Same-origin doors for the attachment chooser: connections, browse and one thumbnail. */
export function fileStoresHttp(foundation: ServerFoundation, stores: ReturnType<typeof createFileStores>) {
  const app = new Hono();
  app.all('*', async c => {
    const request = c.req.raw, url = new URL(request.url), requestId = createUlid();
    try {
      const ctx = await foundation.authenticate(request, 'http', requestId);
      if (request.method === 'GET' && url.pathname.endsWith('/thumbnail')) {
        const result = await stores.thumbnail(ctx, Object.fromEntries(['appId', 'entityId', 'fieldId', 'recordId', 'itemId'].map(key => [key, url.searchParams.get(key)])));
        if (result.state !== 'image') return c.json({ state: result.state }, 404, json);
        return new Response(unbase64(result.image.base64) as BodyInit, { headers: { 'content-type': result.image.contentType, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
      }
      if (request.method === 'GET' && url.pathname.endsWith('/identity')) return c.json({ data: stores.identity(ctx), meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now } }, 200, json);
      if (request.method === 'GET' && url.pathname.endsWith('/connections')) return c.json({ data: { connections: await stores.connections(ctx, idSchema.parse(url.searchParams.get('appId'))) }, meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now } }, 200, json);
      if (request.method === 'POST' && url.pathname.endsWith('/browse')) {
        if (request.headers.get('origin') !== url.origin) throw new ApiError('forbidden', 'A same-origin request is required.');
        return c.json({ data: await stores.browse(ctx, await readJsonBody(request)), meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now } }, 200, json);
      }
      throw new ApiError('not_found', 'Unknown file store door.');
    } catch (error) { return errorResponse(error, requestId, 'File store'); }
  });
  return app;
}
