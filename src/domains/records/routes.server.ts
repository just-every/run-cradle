import { Hono } from 'hono';
import { createUlid } from '../../core/shared/ids';
import { errorResponse } from '../../core/registry/errors.server';
import { readJsonBody } from '../../core/registry/body';
import type { RequestContext, PolicyPort } from '../authority/ports';
import type { createRecordReader } from './query.server';
import type { createRecordMetadata } from './metadata.server';
import { idSchema, querySchema } from './validators';
import { AdmissionError } from '../admission/errors';
import {RestRateLimitError} from './rest/rate-limit.server';
export function createRecordHttp(ports: {
    authenticate(request: Request, ingress: RequestContext['ingress'], requestId: string): Promise<RequestContext>;
    templateButtons?:ReturnType<typeof import('./templates/buttons.server').createTemplateButtons>;
    templates?: ReturnType<typeof import('./templates/service.server').createRecordTemplates>;
    rest?: ReturnType<typeof import('./rest/service.server').createRecordRest>;
    policy: PolicyPort;
    presence: ReturnType<typeof import('./presence.server').createRecordPresence>;
    reader: ReturnType<typeof createRecordReader>;
    metadata: ReturnType<typeof createRecordMetadata>;
    writer: ReturnType<typeof import('./change.server').createRecordWriter>;
}) {
    const app = new Hono();
    app.all('*', async (c) => {
        const requestId = createUlid(), request = c.req.raw, url = new URL(request.url), path = url.pathname, operation = request.method + ' ' + path;
        try {
            const ctx = await ports.authenticate(request, 'http', requestId);
            if (request.method === 'POST' && request.headers.has('cookie') && request.headers.get('origin') !== url.origin)
                throw new AdmissionError('forbidden', 'A same-origin request is required');
            if(ports.rest && (/^\/api\/v1\/apps\/[^/]+\/openapi\.json$/.test(path)||/^\/api\/v1\/apps\/[^/]+\/rest\//.test(path))){
                if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.has('cookie')&&request.headers.get('origin')!==url.origin)throw new AdmissionError('forbidden','A same-origin request is required');
                const data=await ports.rest.handle(ctx,request);
                if(data instanceof Response)return data;
                if(path.endsWith('/openapi.json'))return c.json(data as ReturnType<typeof import('./rest/openapi').recordOpenApi>,{headers:{'cache-control':'no-store'}});
                return c.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},{headers:{'cache-control':'no-store'}});
            }
            let data: unknown;
            const pageInput = { limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined, cursor: url.searchParams.get('cursor') ?? undefined };
            const buttons=path.match(/^\/api\/v1\/apps\/([^/]+)\/entities\/([^/]+)\/template-buttons$/);
            if(buttons&&request.method==='GET'&&ports.templateButtons){const data=await ports.templateButtons.list(ctx,idSchema.parse(buttons[1]),idSchema.parse(buttons[2]));return c.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},{headers:{'cache-control':'no-store'}})}
            const templates=path.match(/^\/api\/v1\/apps\/([^/]+)\/entities\/([^/]+)\/templates$/);
            if(templates&&request.method==='GET'&&ports.templates){const data=await ports.templates.list(ctx,idSchema.parse(templates[1]),idSchema.parse(templates[2]));return c.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},{headers:{'cache-control':'no-store'}})}
            const impact = path.match(/^\/api\/v1\/apps\/([^/]+)\/entities\/([^/]+)\/records\/([^/]+)\/delete-impact$/);
            if (impact && request.method === 'GET') {
                const prepared = await ports.writer.deletionImpact(ctx, { appId: idSchema.parse(impact[1]), entityId: idSchema.parse(impact[2]), recordId: idSchema.parse(impact[3]) });
                return c.json({ data: { ref: prepared.ref, references: prepared.references }, meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now, consistencyToken: ctx.consistencyToken ?? '' } });
            }
            const entityPresence = path.match(/^\/api\/v1\/apps\/([^/]+)\/entities\/([^/]+)\/presence$/), viewPresence = path.match(/^\/api\/v1\/views\/([^/]+)\/presence$/);
            const forms=path.match(/^\/api\/v1\/apps\/([^/]+)\/forms$/);
            const entities = path.match(/^\/api\/v1\/apps\/([^/]+)\/entities(?:\/([^/]+)(?:\/(query|records)(?:\/([^/]+))?)?)?$/), views = path.match(/^\/api\/v1\/apps\/([^/]+)\/views$/), view = path.match(/^\/api\/v1\/views\/([^/]+)(?:\/(query|history))?$/), form = path.match(/^\/api\/v1\/forms\/([^/]+)$/);
            if (request.method === 'POST' && (entityPresence || viewPresence)) {
                const target = entityPresence ? { appId: idSchema.parse(entityPresence[1]), entityId: idSchema.parse(entityPresence[2]) } : { viewId: idSchema.parse(viewPresence![1]) };
                data = await ports.presence.heartbeat(ctx, target);
            }
            else if (path === '/api/v1/apps' && request.method === 'GET') {
                data = await ports.metadata.page(ctx, await ports.metadata.apps(ctx), path, pageInput);
            }
            else if (entities) {
                const appId = idSchema.parse(entities[1]), entityId = entities[2] ? idSchema.parse(entities[2]) : null;
                if (!entityId && request.method === 'GET') {
                    const items = await ports.metadata.entities(ctx, appId);
                    data = await ports.metadata.page(ctx, items, path, pageInput);
                }
                else if (entityId && !entities[3] && request.method === 'GET') {
                    data = (await ports.metadata.entities(ctx, appId)).find(e => e.id === entityId);
                    if (!data)
                        throw new AdmissionError('not_found', 'Entity not found');
                }
                else if (entityId && entities[3] === 'query' && request.method === 'POST') {
                    const scope = await ports.policy.scope(ctx, { appId, entityId, purpose: 'read' });
                    data = await ports.reader.query(ctx, scope, querySchema.parse(await readJsonBody(request)));
                }
                else if (entityId && entities[3] === 'records' && entities[4] && request.method === 'GET') {
                    const scope = await ports.policy.scope(ctx, { appId, entityId, purpose: 'read' });
                    data = await ports.reader.get(ctx, scope, { appId, entityId, recordId: idSchema.parse(entities[4]) });
                }
                else
                    throw new AdmissionError('not_found', 'Unknown records route');
            }
            else if (views && request.method === 'GET') {
                const state=url.searchParams.get('state')??'active';if(!['active','deleted'].includes(state))throw new AdmissionError('validation','Invalid view state');const items=state==='deleted'?await ports.metadata.deletedViews(ctx,idSchema.parse(views[1])):await ports.metadata.views(ctx,idSchema.parse(views[1]));
                data = await ports.metadata.page(ctx, items, path+'?state='+state, pageInput);
            }
            else if (view) {
                const definition = await ports.metadata.readView(ctx, idSchema.parse(view[1]));
                if(view[2]==='history'&&request.method==='GET')data=await ports.metadata.viewHistory(ctx,definition.id);
                else if (view[2] === 'query' && request.method === 'POST')
                    data = await ports.metadata.viewQuery(ctx, definition, querySchema.parse(await readJsonBody(request)));
                else if (!view[2] && request.method === 'GET')
                    data = definition;
                else
                    throw new AdmissionError('not_found', 'Unknown view route');
            }
            else if(forms&&request.method==='GET')data=await ports.metadata.page(ctx,await ports.metadata.forms(ctx,idSchema.parse(forms[1])),path,pageInput);
            else if (form && request.method === 'GET')
                data = await ports.metadata.readForm(ctx, idSchema.parse(form[1]));
            else
                throw new AdmissionError('not_found', 'Unknown record route');
            return c.json({ data, meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: new Date().toISOString(), consistencyToken: ctx.consistencyToken ?? '' } }, { headers: { 'cache-control': 'no-store' } });
        }
        catch (error) {
            const response=errorResponse(error, requestId, operation);
            if(error instanceof RestRateLimitError)response.headers.set('Retry-After',String(error.retryAfter));
            return response;
        }
    });
    return app;
}
